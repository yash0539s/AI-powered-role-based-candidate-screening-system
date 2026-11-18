"""Answer evaluation against expected points + retrieved textbook context.

The LLM fills a rubric; the final score is computed deterministically from the
rubric so scoring is consistent and explainable:
    score = 0.5 * correctness + 0.3 * depth + 0.2 * clarity     (0..10)
"""
import logging

from .llm import LLMError, get_llm
from .prompts import EVAL_SYSTEM

log = logging.getLogger(__name__)

WEIGHTS = {"correctness": 0.5, "depth": 0.3, "clarity": 0.2}


def _clamp(v) -> int:
    try:
        return int(min(10, max(0, round(float(v)))))
    except (TypeError, ValueError):
        return 0


def skipped_evaluation(expected_points: list[str]) -> dict:
    return {
        "rubric": {"correctness": 0, "depth": 0, "clarity": 0},
        "covered_points": [],
        "missed_points": expected_points,
        "misconceptions": [],
        "feedback": "Question was skipped.",
        "verdict": "no_answer",
        "score": 0.0,
    }


def evaluate_answer(question: str, expected_points: list[str], context_chunks: list[dict], answer: str) -> dict:
    if len(answer.strip()) < 3:
        return skipped_evaluation(expected_points)

    excerpts = "\n\n".join(
        f"[{c.get('label', '')}] {c['text'][:700]}" for c in context_chunks if c.get("used", True)
    )[:3500]
    user = (
        f"QUESTION: {question}\n"
        f"EXPECTED KEY POINTS: {'; '.join(expected_points) or 'n/a'}\n\n"
        f"REFERENCE EXCERPTS:\n{excerpts}\n\n"
        f"CANDIDATE ANSWER:\n{answer[:4000]}"
    )
    try:
        data = get_llm().json_chat(EVAL_SYSTEM, user, temperature=0.0, max_tokens=700)
    except LLMError as exc:
        log.error("Evaluation failed: %s", exc)
        return {
            "rubric": {"correctness": 0, "depth": 0, "clarity": 0},
            "covered_points": [],
            "missed_points": [],
            "misconceptions": [],
            "feedback": "Automatic evaluation unavailable for this answer.",
            "verdict": "unevaluated",
            "score": 0.0,
            "error": str(exc),
        }

    rubric = {k: _clamp((data.get("rubric") or {}).get(k)) for k in WEIGHTS}
    score = round(sum(rubric[k] * w for k, w in WEIGHTS.items()), 1)
    verdict = "strong" if score >= 7.5 else "adequate" if score >= 5 else "weak"
    return {
        "rubric": rubric,
        "covered_points": [str(p) for p in data.get("covered_points") or []][:6],
        "missed_points": [str(p) for p in data.get("missed_points") or []][:6],
        "misconceptions": [str(p) for p in data.get("misconceptions") or []][:4],
        "feedback": str(data.get("feedback") or "")[:800],
        "verdict": verdict,
        "score": score,
    }
