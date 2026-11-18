"""Offline tests: chunking, scoring, and the full interview lifecycle through the HTTP API.

The LLM and the retriever are replaced with deterministic fakes, so these run
without a Groq key or an ingested knowledge base.
"""
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_tmp, 'test.db').as_posix()}"
os.environ["GROQ_API_KEY"] = "test-key"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.rag.chunker import chunk_pages  # noqa: E402
from app.rag.loader import Page  # noqa: E402
from app.rag.retriever import RetrievedChunk  # noqa: E402
from app.services import evaluator  # noqa: E402

RESUME = (Path(__file__).resolve().parents[2] / "samples" / "resume_ml_engineer.txt").read_bytes()


# ---------------------------------------------------------------- unit
def test_chunker_respects_size_overlap_and_pages():
    sent = "Gradient descent iteratively updates the weights in the direction of the negative gradient. "
    pages = [Page(1, sent * 20), Page(2, sent * 20)]
    chunks = chunk_pages(pages, size=500, overlap=100, min_chars=100)
    assert len(chunks) > 4
    assert all(len(c.text) <= 600 for c in chunks)
    assert chunks[0].page_start == 1 and chunks[-1].page_end == 2
    # overlap: the start of chunk i+1 repeats the tail of chunk i
    assert chunks[1].text[:60] in chunks[0].text


def test_score_is_weighted_rubric(monkeypatch):
    class FakeLLM:
        def json_chat(self, *a, **k):
            return {"rubric": {"correctness": 8, "depth": 6, "clarity": 10}, "feedback": "ok"}

    monkeypatch.setattr(evaluator, "get_llm", lambda: FakeLLM())
    ev = evaluator.evaluate_answer("q", ["p1"], [{"text": "ctx", "label": "E1"}], "a real answer")
    assert ev["score"] == pytest.approx(0.5 * 8 + 0.3 * 6 + 0.2 * 10)
    assert ev["verdict"] == "strong"


def test_empty_answer_is_not_sent_to_llm():
    ev = evaluator.evaluate_answer("q", ["p1"], [], "  ")
    assert ev["score"] == 0 and ev["verdict"] == "no_answer"


# ---------------------------------------------------------------- lifecycle
class FakeLLM:
    """Returns schema-valid JSON for each prompt type; scores alternate to exercise adaptation."""

    def __init__(self):
        self.evals = iter([5, 9, 2, 9, 9, 9, 9, 9, 9, 9])

    def json_chat(self, system, user, **_):
        if "Extract structured information from a resume" in system:
            return {"candidate_name": "Ananya Verma", "experience_level": "junior", "years_experience": 2,
                    "skills": ["feature engineering"], "technologies": ["Python", "XGBoost"],
                    "ml_concepts": ["gradient boosting", "cross-validation"], "projects": [], "domains": ["fintech"]}
        if "interview plan" in system:
            return {"topics": [
                {"topic": f"topic {i}", "resume_anchor": "XGBoost" if i % 2 else None, "why": "w",
                 "queries": [f"query {i}"], "question_type": "applied", "base_difficulty": 3}
                for i in range(10)]}
        if "grading a candidate" in system:
            s = next(self.evals)
            return {"rubric": {"correctness": s, "depth": s, "clarity": s}, "missed_points": ["x"], "feedback": "f"}
        if "partially correct" in system:
            return {"question": "Follow-up: why?", "question_type": "conceptual", "used_excerpts": ["E1"],
                    "expected_points": ["a"], "rationale": "probe"}
        if "Write ONE interview question" in system:
            return {"question": "Explain how boosting reduces bias.", "question_type": "applied",
                    "used_excerpts": ["E1"], "expected_points": ["a", "b"], "rationale": "r"}
        if "screening summary" in system:
            return {"headline": "h", "summary": "s", "strengths": ["a"], "gaps": ["b"], "resume_alignment": "r",
                    "recommendation": "consider", "recommendation_reason": "x"}
        raise AssertionError(f"unexpected prompt: {system[:60]}")


class FakeRetriever:
    def retrieve(self, queries, role, top_k=None, exclude_ids=None):
        return [RetrievedChunk(id="mitchell:1", text="Boosting combines weak learners...", book_id="mitchell",
                               book_title="Machine Learning", page_start=10, page_end=10, similarity=0.8,
                               fused_score=0.03, matched_by=["dense", "bm25"])]


@pytest.fixture
def client(monkeypatch):
    from app import main
    from app.api import routes
    from app.services import planner, question_generator, report, resume_parser

    fake = FakeLLM()
    for mod in (resume_parser, planner, question_generator, evaluator, report):
        monkeypatch.setattr(mod, "get_llm", lambda: fake)
    monkeypatch.setattr(question_generator, "get_retriever", lambda: FakeRetriever())
    monkeypatch.setattr(routes, "kb_status", lambda: {"mitchell": 100, "burkov": 0, "ml_beginners": 0})
    monkeypatch.setattr(main, "_warm_up", lambda: None)
    with TestClient(main.app) as c:
        yield c


def test_full_interview_lifecycle(client):
    r = client.post("/api/sessions", data={"role_id": "ai_ml_engineer", "num_questions": "4"},
                    files={"resume": ("resume.txt", RESUME, "text/plain")})
    assert r.status_code == 201, r.text
    s = r.json()
    sid = s["id"]
    assert s["status"] == "planned" and len(s["plan"]["topics"]) == 4
    assert s["candidate_name"] == "Ananya Verma"

    # completing before answering anything is rejected
    assert client.post(f"/api/sessions/{sid}/complete").status_code == 409

    q1 = client.post(f"/api/sessions/{sid}/questions/next").json()
    # idempotent: asking again returns the same pending question
    assert client.post(f"/api/sessions/{sid}/questions/next").json()["id"] == q1["id"]
    assert q1["context_chunks"][0]["book_title"] == "Machine Learning"  # traceability

    a1 = client.post(f"/api/sessions/{sid}/questions/{q1['id']}/answer", json={"answer": "Boosting reweights..."}).json()
    assert a1["score"] == 5.0 and a1["will_follow_up"] is True  # partial answer -> follow-up

    q2 = client.post(f"/api/sessions/{sid}/questions/next").json()
    assert q2["kind"] == "follow_up"
    # answering the same question twice is rejected
    client.post(f"/api/sessions/{sid}/questions/{q2['id']}/answer", json={"answer": "because..."})
    assert client.post(f"/api/sessions/{sid}/questions/{q2['id']}/answer", json={"answer": "again"}).status_code == 409

    q3 = client.post(f"/api/sessions/{sid}/questions/next").json()
    a3 = client.post(f"/api/sessions/{sid}/questions/{q3['id']}/answer", json={"answer": "wrong"}).json()
    assert a3["difficulty_after"] < a3["difficulty_before"]  # adaptive: weak answer -> easier

    q4 = client.post(f"/api/sessions/{sid}/questions/next").json()
    a4 = client.post(f"/api/sessions/{sid}/questions/{q4['id']}/answer", json={"answer": "", "skipped": True}).json()
    assert a4["next_action"] == "complete"
    assert client.post(f"/api/sessions/{sid}/questions/next").status_code == 409  # budget exhausted

    done = client.post(f"/api/sessions/{sid}/complete").json()
    assert done["status"] == "completed"
    rep = done["report"]["content"]
    assert rep["analytics"]["answered"] == 4 and rep["analytics"]["follow_ups"] == 1
    assert rep["narrative"]["recommendation"] == "consider"
    # idempotent completion
    assert client.post(f"/api/sessions/{sid}/complete").json()["report"]["overall_score"] == done["report"]["overall_score"]


def test_concurrent_next_question_generates_once(client, monkeypatch):
    """Double-click / two tabs: parallel `next` calls must yield ONE question, not two."""
    import time
    from concurrent.futures import ThreadPoolExecutor

    from app.services import question_generator

    original = question_generator.generate_primary

    def slow(*a, **k):
        time.sleep(0.3)  # widen the race window
        return original(*a, **k)

    monkeypatch.setattr(question_generator, "generate_primary", slow)
    sid = client.post("/api/sessions", data={"role_id": "ai_ml_engineer", "num_questions": "3"},
                      files={"resume": ("r.txt", RESUME, "text/plain")}).json()["id"]
    with ThreadPoolExecutor(4) as pool:
        ids = list(pool.map(lambda _: client.post(f"/api/sessions/{sid}/questions/next").json()["id"], range(4)))
    assert len(set(ids)) == 1
    assert len(client.get(f"/api/sessions/{sid}").json()["questions"]) == 1


def test_invalid_inputs(client):
    assert client.post("/api/sessions", data={"role_id": "nope"},
                       files={"resume": ("r.txt", RESUME, "text/plain")}).status_code == 404
    r = client.post("/api/sessions", data={"role_id": "ai_ml_engineer"}, files={"resume": ("r.docx", b"x" * 200, "application/octet-stream")})
    assert r.status_code == 422
    assert client.get("/api/sessions/doesnotexist").status_code == 404
