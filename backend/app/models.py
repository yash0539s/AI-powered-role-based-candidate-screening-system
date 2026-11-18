"""Persistence model.

InterviewSession 1─* Question 1─1 Answer
InterviewSession 1─1 Report

Every Question stores the full provenance of how it was generated
(topic, retrieval queries, retrieved chunks + scores, rationale), which gives
end-to-end traceability: Context -> Question -> Answer -> Evaluation.
"""
import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Enum, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class SessionStatus(str, enum.Enum):
    planned = "planned"  # resume parsed, interview plan ready, no question yet
    in_progress = "in_progress"
    completed = "completed"


class QuestionKind(str, enum.Enum):
    primary = "primary"
    follow_up = "follow_up"


class InterviewSession(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    candidate_name: Mapped[str] = mapped_column(String(120))
    role_id: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[SessionStatus] = mapped_column(Enum(SessionStatus), default=SessionStatus.planned)

    resume_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    resume_text: Mapped[str] = mapped_column(Text)
    profile: Mapped[dict] = mapped_column(JSON, default=dict)  # extracted skills, level, ...
    plan: Mapped[dict] = mapped_column(JSON, default=dict)  # ordered topics + queries + rationale

    num_questions: Mapped[int] = mapped_column(Integer)
    current_difficulty: Mapped[int] = mapped_column(Integer, default=3)  # 1..5
    topic_cursor: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    questions: Mapped[list["Question"]] = relationship(
        back_populates="session", order_by="Question.position", cascade="all, delete-orphan"
    )
    report: Mapped["Report | None"] = relationship(
        back_populates="session", uselist=False, cascade="all, delete-orphan"
    )


class Question(Base):
    __tablename__ = "questions"
    # Cross-process guard against two concurrent requests creating the same question slot.
    __table_args__ = (UniqueConstraint("session_id", "position", name="uq_question_session_position"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    kind: Mapped[QuestionKind] = mapped_column(Enum(QuestionKind), default=QuestionKind.primary)
    parent_question_id: Mapped[str | None] = mapped_column(String(32), nullable=True)

    topic: Mapped[str] = mapped_column(String(255))
    question_type: Mapped[str] = mapped_column(String(32))  # conceptual | applied | scenario | ...
    difficulty: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)

    # --- traceability ---
    rationale: Mapped[str] = mapped_column(Text, default="")
    retrieval_queries: Mapped[list] = mapped_column(JSON, default=list)
    context_chunks: Mapped[list] = mapped_column(JSON, default=list)
    expected_points: Mapped[list] = mapped_column(JSON, default=list)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    session: Mapped[InterviewSession] = relationship(back_populates="questions")
    answer: Mapped["Answer | None"] = relationship(
        back_populates="question", uselist=False, cascade="all, delete-orphan"
    )


class Answer(Base):
    __tablename__ = "answers"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    question_id: Mapped[str] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), unique=True, index=True
    )
    text: Mapped[str] = mapped_column(Text)
    skipped: Mapped[bool] = mapped_column(default=False)
    time_taken_s: Mapped[float | None] = mapped_column(Float, nullable=True)

    score: Mapped[float] = mapped_column(Float, default=0.0)  # 0..10
    evaluation: Mapped[dict] = mapped_column(JSON, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    question: Mapped[Question] = relationship(back_populates="answer")


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), unique=True, index=True
    )
    overall_score: Mapped[float] = mapped_column(Float)
    content: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    session: Mapped[InterviewSession] = relationship(back_populates="report")
