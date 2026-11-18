"""HTTP layer: validation + (de)serialisation only. Business rules live in services."""
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import InterviewSession, Question
from ..rag.ingest import kb_status
from ..roles import BOOKS, ROLES
from ..schemas import (
    AnswerIn,
    AnswerResultOut,
    BookOut,
    CandidateQuestionOut,
    ReportOut,
    RoleOut,
    SessionDetailOut,
    SessionSummaryOut,
)
from ..services import interview_service as svc

router = APIRouter(prefix="/api")


# ------------------------------------------------------------------ helpers
def _role_title(s: InterviewSession) -> str:
    r = ROLES.get(s.role_id)
    return r.title if r else s.role_id.replace("_", " ").title()


def _detail(s: InterviewSession) -> SessionDetailOut:
    return SessionDetailOut.model_validate(
        {
            **{c: getattr(s, c) for c in (
                "id", "candidate_name", "role_id", "resume_filename", "profile", "plan",
                "num_questions", "current_difficulty", "created_at", "completed_at",
            )},
            "status": s.status.value,
            "role_title": _role_title(s),
            "questions": [
                {**{c: getattr(q, c) for c in (
                    "id", "position", "parent_question_id", "topic", "question_type", "difficulty", "text",
                    "rationale", "retrieval_queries", "context_chunks", "expected_points", "created_at", "answer",
                )}, "kind": q.kind.value}
                for q in s.questions
            ],
            "report": s.report,
        }
    )


def _candidate_q(q: Question, total: int) -> CandidateQuestionOut:
    return CandidateQuestionOut(
        id=q.id, position=q.position, kind=q.kind.value, topic=q.topic, question_type=q.question_type,
        difficulty=q.difficulty, text=q.text, rationale=q.rationale, retrieval_queries=q.retrieval_queries,
        context_chunks=q.context_chunks, total_questions=total,
    )


# ------------------------------------------------------------------ meta
@router.get("/health")
def health() -> dict:
    s = get_settings()
    kb = kb_status()
    return {
        "status": "ok",
        "llm_configured": bool(s.groq_api_key),
        "llm_model": s.llm_model,
        "embedding_model": s.embedding_model,
        "knowledge_base": kb,
    }


@router.get("/roles", response_model=list[RoleOut])
def roles() -> list[RoleOut]:
    kb = kb_status()
    out = []
    for r in ROLES.values():
        books = [BookOut(id=b, title=BOOKS[b].title, author=BOOKS[b].author, chunks=kb.get(b, 0)) for b in r.book_ids]
        out.append(
            RoleOut(
                id=r.id, title=r.title, category=r.category, description=r.description, core_areas=list(r.core_areas),
                books=books, ready=any(b.chunks > 0 for b in books),
            )
        )
    return out


# ------------------------------------------------------------------ sessions
@router.post("/sessions", response_model=SessionDetailOut, status_code=status.HTTP_201_CREATED)
async def create_session(
    resume: UploadFile = File(..., description="Resume as PDF or .txt"),
    role_id: str = Form(...),
    candidate_name: str = Form(""),
    num_questions: int | None = Form(None),
    db: Session = Depends(get_db),
) -> SessionDetailOut:
    role = ROLES.get(role_id)
    if role is None:
        raise HTTPException(404, f"Unknown role '{role_id}'")
    kb = kb_status()
    if not any(kb.get(b, 0) for b in role.book_ids):
        raise HTTPException(503, f"Knowledge base for '{role.title}' is not ingested yet. Run `python -m scripts.ingest`.")
    data = await resume.read()
    # LLM calls are blocking -> run in the threadpool, don't stall the event loop.
    s = await run_in_threadpool(
        svc.create_session, db, candidate_name=candidate_name, role_id=role_id,
        filename=resume.filename or "", data=data, num_questions=num_questions,
    )
    return _detail(s)


@router.get("/sessions", response_model=list[SessionSummaryOut])
def list_sessions(db: Session = Depends(get_db)) -> list[SessionSummaryOut]:
    return [
        SessionSummaryOut(
            id=s.id, candidate_name=s.candidate_name, role_id=s.role_id, role_title=_role_title(s),
            status=s.status.value, num_questions=s.num_questions,
            answered=sum(1 for q in s.questions if q.answer is not None) if s.questions else 0,
            overall_score=s.report.overall_score if s.report else None, created_at=s.created_at,
        )
        for s in svc.list_sessions(db)
    ]


@router.get("/sessions/{session_id}", response_model=SessionDetailOut)
def get_session(session_id: str, db: Session = Depends(get_db)) -> SessionDetailOut:
    return _detail(svc.get_session(db, session_id))


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session_id: str, db: Session = Depends(get_db)) -> None:
    svc.delete_session(db, session_id)


@router.post("/sessions/{session_id}/questions/next", response_model=CandidateQuestionOut)
def next_question(session_id: str, db: Session = Depends(get_db)) -> CandidateQuestionOut:
    q = svc.next_question(db, session_id)
    s = svc.get_session(db, session_id)
    return _candidate_q(q, s.num_questions)


@router.post("/sessions/{session_id}/questions/{question_id}/answer", response_model=AnswerResultOut)
def answer(session_id: str, question_id: str, body: AnswerIn, db: Session = Depends(get_db)) -> AnswerResultOut:
    if not body.skipped and len(body.answer.strip()) < 3:
        raise HTTPException(422, "Answer is empty. Type an answer or skip the question.")
    q, meta = svc.answer_question(
        db, session_id, question_id, text=body.answer, skipped=body.skipped, time_taken_s=body.time_taken_s
    )
    return AnswerResultOut(question_id=q.id, score=q.answer.score, evaluation=q.answer.evaluation, **meta)


@router.post("/sessions/{session_id}/complete", response_model=SessionDetailOut)
def complete(session_id: str, db: Session = Depends(get_db)) -> SessionDetailOut:
    return _detail(svc.complete(db, session_id))


@router.get("/sessions/{session_id}/report", response_model=ReportOut)
def report(session_id: str, db: Session = Depends(get_db)) -> ReportOut:
    s = svc.get_session(db, session_id)
    if s.report is None:
        raise HTTPException(409, "Report not available until the interview is completed")
    return ReportOut.model_validate(s.report)
