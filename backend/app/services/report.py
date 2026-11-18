"""Session report: deterministic analytics + LLM-written narrative.

Numbers (scores, per-topic breakdown, difficulty trajectory, study references)
are computed in code so they are exact and reproducible; the LLM only writes
the qualitative narrative on top of them.
"""
import logging
from collections import defaultdict

from ..models import InterviewSession
from ..roles import Role
from .llm import LLMError, get_llm
from .prompts import REPORT_SYSTEM

log = logging.getLogger(__name__)


def _difficulty_weight(d: int) -> float:
    return 0.75 + 0.125 * d  # d=1 -> 0.875 ... d=5 -> 1.375


def compute_analytics(session: InterviewSession) -> dict:
    answered = [q for q in session.questions if q.answer is not None]
    if not answered:
        return {"overall_score": 0.0, "raw_average": 0.0, "answered": 0, "skipped": 0, "topics": [], "trajectory": []}

    wsum = sum(_difficulty_weight(q.difficulty) for q in answered)
    overall = sum(q.answer.score * _difficulty_weight(q.difficulty) for q in answered) / wsum
    raw = sum(q.answer.score for q in answered) / len(answered)

    by_topic: dict[str, list] = defaultdict(list)
    for q in answered:
        by_topic[q.topic].append(q)
    plan_topics = {t["topic"]: t for t in session.plan.get("topics", [])}
    topics = []
    for name, qs in by_topic.items():
        avg = sum(q.answer.score for q in qs) / len(qs)
        topics.append(
            {
                "topic": name,
                "score": round(avg, 1),
                "questions": len(qs),
                "resume_anchored": bool(plan_topics.get(name, {}).get("resume_anchor")),
                "level": "strong" if avg >= 7.5 else "adequate" if avg >= 5 else "weak",
            }
        )

    rubric_avg = {
        k: round(sum(q.answer.evaluation.get("rubric", {}).get(k, 0) for q in answered) / len(answered), 1)
        for k in ("correctness", "depth", "clarity")
    }

    anchored = [t["score"] for t in topics if t["resume_anchored"]]
    unanchored = [t["score"] for t in topics if not t["resume_anchored"]]

    # Grounded study plan: weak topics -> exact textbook pages that the questions were built from.
    study = []
    for t in sorted(topics, key=lambda t: t["score"]):
        if t["score"] >= 7:
            continue
        refs, seen = [], set()
        for q in by_topic[t["topic"]]:
            for c in q.context_chunks:
                key = (c["book_title"], c["page_start"])
                if c.get("used", True) and key not in seen:
                    seen.add(key)
                    refs.append({"book": c["book_title"], "pages": f"{c['page_start']}-{c['page_end']}"})
        study.append({"topic": t["topic"], "score": t["score"], "references": refs[:3]})

    times = [q.answer.time_taken_s for q in answered if q.answer.time_taken_s]
    return {
        "overall_score": round(overall, 1),
        "raw_average": round(raw, 1),
        "answered": len(answered),
        "skipped": sum(1 for q in answered if q.answer.skipped),
        "follow_ups": sum(1 for q in answered if q.kind.value == "follow_up"),
        "rubric_average": rubric_avg,
        "topics": topics,
        "resume_anchored_avg": round(sum(anchored) / len(anchored), 1) if anchored else None,
        "non_resume_avg": round(sum(unanchored) / len(unanchored), 1) if unanchored else None,
        "trajectory": [
            {"position": q.position, "difficulty": q.difficulty, "score": q.answer.score, "kind": q.kind.value}
            for q in answered
        ],
        "avg_time_s": round(sum(times) / len(times), 1) if times else None,
        "study_plan": study[:5],
    }


def _fallback_narrative(analytics: dict) -> dict:
    s = analytics["overall_score"]
    strong = [t["topic"] for t in analytics["topics"] if t["level"] == "strong"]
    weak = [t["topic"] for t in analytics["topics"] if t["level"] == "weak"]
    rec = "advance" if s >= 7 else "consider" if s >= 5 else "do_not_advance"
    return {
        "headline": f"Overall weighted score {s}/10.",
        "summary": "Narrative unavailable (LLM error); see analytics below.",
        "strengths": [f"Solid on {t}" for t in strong[:3]],
        "gaps": [f"Needs work on {t}" for t in weak[:3]],
        "resume_alignment": "",
        "recommendation": rec,
        "recommendation_reason": "Derived from the weighted score thresholds.",
    }


def build_report(session: InterviewSession, role: Role) -> dict:
    analytics = compute_analytics(session)
    records = "\n".join(
        f"- Q{q.position} [{q.kind.value}] topic='{q.topic}' difficulty={q.difficulty} score={q.answer.score}/10 "
        f"verdict={q.answer.evaluation.get('verdict')} missed={q.answer.evaluation.get('missed_points', [])[:3]}"
        for q in session.questions
        if q.answer is not None
    )
    p = session.profile
    user = (
        f"CANDIDATE: {session.candidate_name}; level={p.get('experience_level')}; "
        f"claimed ML concepts={', '.join(p.get('ml_concepts', [])[:12])}; tech={', '.join(p.get('technologies', [])[:12])}\n"
        f"OVERALL (difficulty-weighted): {analytics['overall_score']}/10; "
        f"resume-anchored avg={analytics.get('resume_anchored_avg')}; non-resume avg={analytics.get('non_resume_avg')}\n"
        f"QUESTION RECORDS:\n{records}"
    )
    try:
        narrative = get_llm().json_chat(REPORT_SYSTEM.format(role=role.title), user, temperature=0.2, max_tokens=900)
        if narrative.get("recommendation") not in {"advance", "consider", "do_not_advance"}:
            narrative["recommendation"] = _fallback_narrative(analytics)["recommendation"]
    except LLMError as exc:
        log.error("Report narrative failed: %s", exc)
        narrative = _fallback_narrative(analytics)
    return {"analytics": analytics, "narrative": narrative}
