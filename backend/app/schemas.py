"""API request/response contracts (decoupled from ORM models)."""
from datetime import datetime as _dt
from datetime import timezone
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field


def _as_utc(d: _dt) -> _dt:
    # SQLite drops tzinfo on read; all stored timestamps are UTC, so make that explicit
    # (serialises as ...+00:00 and browsers convert to local time correctly).
    return d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d


datetime = Annotated[_dt, AfterValidator(_as_utc)]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class BookOut(BaseModel):
    id: str
    title: str
    author: str
    chunks: int


class RoleOut(BaseModel):
    id: str
    title: str
    category: str
    description: str
    core_areas: list[str]
    books: list[BookOut]
    ready: bool


class ContextChunkOut(BaseModel):
    id: str
    label: str
    text: str
    book_id: str
    book_title: str
    page_start: int
    page_end: int
    similarity: float
    fused_score: float
    matched_by: list[str]
    used: bool


class AnswerOut(ORM):
    id: str
    text: str
    skipped: bool
    time_taken_s: float | None
    score: float
    evaluation: dict
    created_at: datetime


class QuestionOut(ORM):
    id: str
    position: int
    kind: str
    parent_question_id: str | None
    topic: str
    question_type: str
    difficulty: int
    text: str
    rationale: str
    retrieval_queries: list[str]
    context_chunks: list[ContextChunkOut]
    expected_points: list[str]
    created_at: datetime
    answer: AnswerOut | None = None


class CandidateQuestionOut(BaseModel):
    """What the candidate sees while answering (no expected points)."""

    id: str
    position: int
    kind: str
    topic: str
    question_type: str
    difficulty: int
    text: str
    rationale: str
    retrieval_queries: list[str]
    context_chunks: list[ContextChunkOut]
    total_questions: int


class ReportOut(ORM):
    overall_score: float
    content: dict
    created_at: datetime


class SessionSummaryOut(BaseModel):
    id: str
    candidate_name: str
    role_id: str
    role_title: str
    status: str
    num_questions: int
    answered: int
    overall_score: float | None
    created_at: datetime


class SessionDetailOut(ORM):
    id: str
    candidate_name: str
    role_id: str
    role_title: str
    status: str
    resume_filename: str | None
    profile: dict
    plan: dict
    num_questions: int
    current_difficulty: int
    created_at: datetime
    completed_at: datetime | None
    questions: list[QuestionOut]
    report: ReportOut | None


class AnswerIn(BaseModel):
    answer: str = Field(default="", max_length=8000)
    skipped: bool = False
    time_taken_s: float | None = Field(default=None, ge=0, le=36000)


class AnswerResultOut(BaseModel):
    question_id: str
    score: float
    evaluation: dict
    difficulty_before: int
    difficulty_after: int
    questions_remaining: int
    next_action: str
    will_follow_up: bool
