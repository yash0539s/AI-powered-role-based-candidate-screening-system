"""Interview orchestration + lifecycle state machine.

    create_session          planned
        │  next_question()
        ▼
    in_progress  ◄──┐   answer_question() -> evaluate -> adapt difficulty
        │           └── next_question()  (primary topic or adaptive follow-up)
        │  complete()
        ▼
    completed  (report generated & persisted; idempotent)

Invariants enforced here (not in the API layer):
* at most one unanswered question at a time (next_question is idempotent:
  it returns the pending question instead of generating a new one -> page
  reloads never burn LLM calls or skip questions);
* answers only for the session's current pending question;
* question budget = session.num_questions (follow-ups count towards it).
"""
import logging
import threading
from collections import defaultdict
from contextlib import contextmanager
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..config import get_settings
from ..models import Answer, InterviewSession, Question, QuestionKind, Report, SessionStatus
from ..roles import Role, get_role
from . import planner, question_generator
from .evaluator import evaluate_answer, skipped_evaluation
from .llm import LLMError
from .report import build_report
from .resume_parser import extract_profile, extract_text

log = logging.getLogger(__name__)


class NotFoundError(LookupError):
    pass


class InvalidStateError(RuntimeError):
    pass


class GenerationError(RuntimeError):
    pass


# Per-session mutex: serialises state-changing operations on the same session so that
# concurrent requests (double clicks, two tabs) can't generate two questions or answer twice.
# Within one process this is exact; across processes the UNIQUE(session_id, position)
# constraint on questions is the backstop.
_locks: defaultdict[str, threading.Lock] = defaultdict(threading.Lock)
_locks_guard = threading.Lock()


@contextmanager
def session_lock(session_id: str):
    with _locks_guard:
        lock = _locks[session_id]
    with lock:
        yield


def _role_or_404(role_id: str) -> Role:
    role = get_role(role_id)
    if role is None:
        raise NotFoundError(f"Unknown role '{role_id}'")
    return role


def session_role(s: InterviewSession) -> Role:
    """Resolve a session's role; sessions created with a role that no longer exists get a clear 404."""
    role = get_role(s.role_id)
    if role is None:
        raise NotFoundError(f"The role '{s.role_id}' used by this session is no longer available.")
    return role


def get_session(db: Session, session_id: str) -> InterviewSession:
    s = db.scalar(
        select(InterviewSession)
        .where(InterviewSession.id == session_id)
        .options(selectinload(InterviewSession.questions).selectinload(Question.answer), selectinload(InterviewSession.report))
        # Always refresh from the DB: objects in the identity map may hold stale relationships
        # (expire_on_commit=False), e.g. `question.answer` loaded as None before the answer was added.
        .execution_options(populate_existing=True)
    )
    if s is None:
        raise NotFoundError(f"Session '{session_id}' not found")
    return s


def list_sessions(db: Session, limit: int = 50) -> list[InterviewSession]:
    return list(
        db.scalars(
            select(InterviewSession)
            .options(selectinload(InterviewSession.report), selectinload(InterviewSession.questions))
            .order_by(InterviewSession.created_at.desc())
            .limit(limit)
        )
    )


# ---------------------------------------------------------------- create
def create_session(
    db: Session, *, candidate_name: str, role_id: str, filename: str, data: bytes, num_questions: int | None,
) -> InterviewSession:
    settings = get_settings()
    role = _role_or_404(role_id)
    n = num_questions or settings.default_num_questions
    n = max(3, min(n, settings.max_num_questions))

    resume_text = extract_text(filename, data)  # raises ResumeError -> 422
    profile = extract_profile(resume_text)
    # Plan one topic per question; follow-ups consume budget and skip the tail topics.
    plan = planner.build_plan(role, profile, n_topics=n)

    s = InterviewSession(
        candidate_name=(candidate_name or profile.get("candidate_name") or "Candidate").strip()[:120],
        role_id=role.id,
        resume_filename=filename,
        resume_text=resume_text,
        profile=profile,
        plan=plan,
        num_questions=n,
        current_difficulty=plan["initial_difficulty"],
        status=SessionStatus.planned,
    )
    db.add(s)
    db.commit()
    return get_session(db, s.id)


# ---------------------------------------------------------------- questions
def _pending(s: InterviewSession) -> Question | None:
    return next((q for q in s.questions if q.answer is None), None)


def _should_follow_up(s: InterviewSession, last: Question | None) -> bool:
    if last is None or last.answer is None or last.answer.skipped:
        return False
    if last.kind != QuestionKind.primary:
        return False
    if len(s.questions) >= s.num_questions:  # no budget left
        return False
    follow_ups = sum(1 for q in s.questions if q.parent_question_id == last.id)
    if follow_ups >= get_settings().max_follow_ups_per_topic:
        return False
    # Partially correct answers (adequate, not strong: 3.5 <= score < 7.5) are the most informative to probe.
    return 3.5 <= last.answer.score < 7.5 and last.answer.evaluation.get("verdict") != "unevaluated"


def next_question(db: Session, session_id: str) -> Question:
    with session_lock(session_id):
        return _next_question(db, session_id)


def _next_question(db: Session, session_id: str) -> Question:
    s = get_session(db, session_id)
    if s.status == SessionStatus.completed:
        raise InvalidStateError("Interview already completed")
    pending = _pending(s)
    if pending is not None:
        return pending
    if len(s.questions) >= s.num_questions:
        raise InvalidStateError("Question budget exhausted; complete the interview to get the report")

    role = session_role(s)
    last = s.questions[-1] if s.questions else None
    position = len(s.questions) + 1

    try:
        if _should_follow_up(s, last):
            diff = s.current_difficulty
            gen = question_generator.generate_follow_up(
                role,
                parent_question=last.text,
                answer=last.answer.text,
                evaluation=last.answer.evaluation,
                context_chunks=last.context_chunks,
                retrieval_queries=last.retrieval_queries,
                difficulty=diff,
            )
            q = Question(
                session_id=s.id,
                position=position,
                kind=QuestionKind.follow_up,
                parent_question_id=last.id,
                topic=last.topic,
                difficulty=diff,
                text=gen.text,
                question_type=gen.question_type,
                rationale=gen.rationale,
                retrieval_queries=gen.retrieval_queries,
                context_chunks=gen.context_chunks,
                expected_points=gen.expected_points,
            )
        else:
            topics = s.plan.get("topics", [])
            if s.topic_cursor >= len(topics):
                raise InvalidStateError("No more planned topics; complete the interview")
            topic = topics[s.topic_cursor]
            # Blend adaptive running difficulty with the planner's per-topic estimate.
            diff = max(1, min(5, round(0.6 * s.current_difficulty + 0.4 * topic["base_difficulty"])))
            used_ids = {c["id"] for q0 in s.questions for c in q0.context_chunks}
            gen = question_generator.generate_primary(
                role,
                s.profile,
                topic,
                diff,
                previous_questions=[q0.text for q0 in s.questions],
                used_chunk_ids=used_ids,
            )
            q = Question(
                session_id=s.id,
                position=position,
                kind=QuestionKind.primary,
                topic=topic["topic"],
                difficulty=diff,
                text=gen.text,
                question_type=gen.question_type,
                rationale=gen.rationale,
                retrieval_queries=gen.retrieval_queries,
                context_chunks=gen.context_chunks,
                expected_points=gen.expected_points,
            )
            s.topic_cursor += 1
    except (LLMError, RuntimeError) as exc:
        if isinstance(exc, InvalidStateError):
            raise
        log.exception("Question generation failed")
        raise GenerationError(str(exc)) from exc

    s.status = SessionStatus.in_progress
    db.add(q)
    db.commit()
    db.refresh(q)
    return q


# ---------------------------------------------------------------- answers
def answer_question(
    db: Session, session_id: str, question_id: str, *, text: str, skipped: bool, time_taken_s: float | None
) -> tuple[Question, dict]:
    with session_lock(session_id):
        return _answer_question(db, session_id, question_id, text=text, skipped=skipped, time_taken_s=time_taken_s)


def _answer_question(
    db: Session, session_id: str, question_id: str, *, text: str, skipped: bool, time_taken_s: float | None
) -> tuple[Question, dict]:
    s = get_session(db, session_id)
    if s.status == SessionStatus.completed:
        raise InvalidStateError("Interview already completed")
    q = next((x for x in s.questions if x.id == question_id), None)
    if q is None:
        raise NotFoundError(f"Question '{question_id}' not found in this session")
    if q.answer is not None:
        raise InvalidStateError("Question already answered")

    text = (text or "").strip()
    if skipped or not text:
        evaluation, skipped = skipped_evaluation(q.expected_points), True
    else:
        evaluation = evaluate_answer(q.text, q.expected_points, q.context_chunks, text)

    score = float(evaluation.get("score", 0.0))
    db.add(Answer(question_id=q.id, text=text, skipped=skipped, time_taken_s=time_taken_s, score=score, evaluation=evaluation))

    # ---- adaptive difficulty ----
    before = s.current_difficulty
    if evaluation.get("verdict") != "unevaluated":
        if score >= 8:
            s.current_difficulty = min(5, s.current_difficulty + 1)
        elif score <= 4:
            s.current_difficulty = max(1, s.current_difficulty - 1)
    db.commit()

    s = get_session(db, session_id)
    q = next(x for x in s.questions if x.id == question_id)
    remaining = s.num_questions - len(s.questions)
    meta = {
        "difficulty_before": before,
        "difficulty_after": s.current_difficulty,
        "questions_remaining": remaining,
        "next_action": "next_question" if remaining > 0 else "complete",
        "will_follow_up": _should_follow_up(s, q) if remaining > 0 else False,
    }
    return q, meta


# ---------------------------------------------------------------- complete
def complete(db: Session, session_id: str) -> InterviewSession:
    with session_lock(session_id):
        return _complete(db, session_id)


def _complete(db: Session, session_id: str) -> InterviewSession:
    s = get_session(db, session_id)
    if s.status == SessionStatus.completed and s.report is not None:
        return s
    if not any(q.answer is not None for q in s.questions):
        raise InvalidStateError("Answer at least one question before completing the interview")

    # An unanswered pending question (ended early) is dropped from the record.
    for q in list(s.questions):
        if q.answer is None:
            s.questions.remove(q)
            db.delete(q)
    db.flush()

    role = session_role(s)
    content = build_report(s, role)
    db.add(Report(session_id=s.id, overall_score=content["analytics"]["overall_score"], content=content))
    s.status = SessionStatus.completed
    s.completed_at = datetime.now(timezone.utc)
    db.commit()
    return get_session(db, session_id)


def delete_session(db: Session, session_id: str) -> None:
    s = get_session(db, session_id)
    db.delete(s)
    db.commit()
