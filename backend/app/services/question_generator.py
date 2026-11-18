"""RAG question generation: plan topic -> retrieval -> grounded, personalised question."""
import logging
from dataclasses import dataclass

from ..rag.retriever import RetrievedChunk, get_retriever
from ..roles import Role
from .llm import get_llm
from .prompts import DIFFICULTY_GUIDE, FOLLOW_UP_SYSTEM, QUESTION_SYSTEM

log = logging.getLogger(__name__)

_EXCERPT_CHARS = 900  # per chunk, keeps prompts within free-tier token budgets


@dataclass
class GeneratedQuestion:
    text: str
    question_type: str
    expected_points: list[str]
    rationale: str
    retrieval_queries: list[str]
    context_chunks: list[dict]  # chunk dicts, each with `used` flag


def _format_excerpts(chunks: list[RetrievedChunk]) -> str:
    return "\n\n".join(
        f"[E{i + 1}] ({c.book_title}, p.{c.page_start}): {c.text[:_EXCERPT_CHARS]}" for i, c in enumerate(chunks)
    )


def _context_records(chunks: list[RetrievedChunk], used_labels: list) -> list[dict]:
    used = {str(u).strip().upper() for u in used_labels or []}
    recs = []
    for i, c in enumerate(chunks):
        d = c.to_dict()
        d["label"] = f"E{i + 1}"
        d["used"] = d["label"] in used or not used  # if model didn't say, treat all as used
        recs.append(d)
    return recs


def _candidate_brief(profile: dict) -> str:
    """Verbatim resume facts. The generator may only personalise using what is listed here."""
    projects = "\n".join(
        f"  - {p['name']}: {p.get('summary', '')} (tech: {', '.join(p.get('technologies', [])) or 'n/a'})"
        for p in profile.get("projects", [])[:5]
    )
    return (
        f"Level: {profile.get('experience_level', 'junior')}, {profile.get('years_experience', 0)} yrs. "
        f"Summary: {profile.get('summary', '')}\n"
        f"Technologies: {', '.join(profile.get('technologies', [])[:12])}\n"
        f"ML concepts: {', '.join(profile.get('ml_concepts', [])[:12])}\n"
        f"Projects/experience:\n{projects or '  n/a'}"
    )


def _clean_points(points) -> list[str]:
    return [str(p)[:240] for p in (points or []) if str(p).strip()][:5]


def generate_primary(
    role: Role,
    profile: dict,
    topic: dict,
    difficulty: int,
    previous_questions: list[str],
    used_chunk_ids: set[str],
) -> GeneratedQuestion:
    queries = list(topic.get("queries") or [topic["topic"]])
    if topic.get("resume_anchor"):
        queries.append(f"{topic['topic']} {topic['resume_anchor']}")
    chunks = get_retriever().retrieve(queries, role, exclude_ids=used_chunk_ids)
    if not chunks:
        raise RuntimeError("Knowledge base returned no context. Has the role's corpus been ingested?")

    user = (
        f"TOPIC: {topic['topic']}\n"
        f"RESUME ANCHOR: {topic.get('resume_anchor') or 'none'}\n"
        f"WHY THIS TOPIC: {topic.get('why', '')}\n"
        f"CANDIDATE RESUME FACTS (the only facts you may attribute to the candidate):\n{_candidate_brief(profile)}\n"
        f"PREVIOUSLY ASKED: {' | '.join(previous_questions[-8:]) or 'none'}\n\n"
        f"TEXTBOOK EXCERPTS:\n{_format_excerpts(chunks)}"
    )
    data = get_llm().json_chat(
        QUESTION_SYSTEM.format(
            role=role.title,
            difficulty=difficulty,
            difficulty_desc=DIFFICULTY_GUIDE[difficulty],
            question_type=topic.get("question_type", "conceptual"),
        ),
        user,
        temperature=0.6,
        max_tokens=700,
    )
    text = str(data.get("question", "")).strip()
    if not text:
        raise RuntimeError("LLM returned an empty question")
    return GeneratedQuestion(
        text=text,
        question_type=str(data.get("question_type") or topic.get("question_type", "conceptual")),
        expected_points=_clean_points(data.get("expected_points")),
        rationale=str(data.get("rationale") or topic.get("why", "")),
        retrieval_queries=queries,
        context_chunks=_context_records(chunks, data.get("used_excerpts")),
    )


def generate_follow_up(
    role: Role,
    parent_question: str,
    answer: str,
    evaluation: dict,
    context_chunks: list[dict],
    retrieval_queries: list[str],
    difficulty: int,
) -> GeneratedQuestion:
    """Follow-ups reuse the parent's retrieved context (same topic, same grounding)."""
    excerpts = "\n\n".join(
        f"[{c['label']}] ({c['book_title']}, p.{c['page_start']}): {c['text'][:_EXCERPT_CHARS]}" for c in context_chunks
    )
    user = (
        f"ORIGINAL QUESTION: {parent_question}\n"
        f"CANDIDATE ANSWER: {answer[:2000]}\n"
        f"MISSED POINTS: {'; '.join(evaluation.get('missed_points', [])) or 'n/a'}\n"
        f"MISCONCEPTIONS: {'; '.join(evaluation.get('misconceptions', [])) or 'none'}\n\n"
        f"TEXTBOOK EXCERPTS:\n{excerpts}"
    )
    data = get_llm().json_chat(
        FOLLOW_UP_SYSTEM.format(role=role.title, difficulty=difficulty, difficulty_desc=DIFFICULTY_GUIDE[difficulty]),
        user,
        temperature=0.5,
        max_tokens=500,
    )
    text = str(data.get("question", "")).strip()
    if not text:
        raise RuntimeError("LLM returned an empty follow-up")
    used = {str(u).strip().upper() for u in data.get("used_excerpts") or []}
    ctx = [{**c, "used": (c["label"] in used) if used else c.get("used", True)} for c in context_chunks]
    return GeneratedQuestion(
        text=text,
        question_type=str(data.get("question_type") or "conceptual"),
        expected_points=_clean_points(data.get("expected_points")),
        rationale=str(data.get("rationale") or "Probing a gap in the previous answer."),
        retrieval_queries=retrieval_queries,
        context_chunks=ctx,
    )
