"""Context construction: (role, resume profile) -> ordered interview plan.

Each plan topic carries its own textbook-style retrieval queries, the resume
item it is anchored to (if any), a rationale and a base difficulty. This is the
step where the resume drives *topic selection*, *difficulty* and *direction*.
"""
import logging

from ..roles import Role
from .llm import LLMError, get_llm
from .prompts import PLAN_SYSTEM

log = logging.getLogger(__name__)

LEVEL_DIFFICULTY = {"student": 2, "junior": 2, "mid": 3, "senior": 4}
_TYPES = {"conceptual", "applied", "scenario", "tradeoff"}


def initial_difficulty(profile: dict) -> int:
    base = LEVEL_DIFFICULTY.get(profile.get("experience_level", "junior"), 2)
    # Rich ML background on the resume nudges the starting point up.
    if len(profile.get("ml_concepts", [])) >= 8 and base < 4:
        base += 1
    return base


def _profile_brief(profile: dict) -> str:
    projects = "; ".join(
        f"{p['name']} ({', '.join(p.get('technologies', [])[:5])}): {p.get('summary', '')}"
        for p in profile.get("projects", [])
    )
    return (
        f"Level: {profile.get('experience_level')} ({profile.get('years_experience', 0)} yrs)\n"
        f"Summary: {profile.get('summary', '')}\n"
        f"Skills: {', '.join(profile.get('skills', []))}\n"
        f"Technologies: {', '.join(profile.get('technologies', []))}\n"
        f"ML concepts: {', '.join(profile.get('ml_concepts', []))}\n"
        f"Domains: {', '.join(profile.get('domains', []))}\n"
        f"Projects: {projects or 'n/a'}\n"
        f"Education: {profile.get('education', '')}"
    )


def _fallback_plan(role: Role, profile: dict, n: int) -> list[dict]:
    """Deterministic plan: resume ML concepts first, then uncovered core areas."""
    diff = initial_difficulty(profile)
    topics: list[dict] = []
    for c in profile.get("ml_concepts", [])[: max(1, n // 2)]:
        topics.append(
            {
                "topic": c,
                "resume_anchor": c,
                "why": f"Listed on the resume; verifying depth of understanding of {c}.",
                "queries": [c, f"{c} {role.title.split('/')[0].strip()}"],
                "question_type": "applied",
                "base_difficulty": diff,
            }
        )
    for area in role.core_areas:
        if len(topics) >= n:
            break
        topics.append(
            {
                "topic": area,
                "resume_anchor": None,
                "why": f"Core {role.title} knowledge area not evidenced on the resume.",
                "queries": [area],
                "question_type": "conceptual",
                "base_difficulty": max(1, diff - 1),
            }
        )
    return topics[:n]


def _sanitize(topics: list, profile: dict) -> list[dict]:
    diff = initial_difficulty(profile)
    out = []
    for t in topics:
        if not isinstance(t, dict) or not t.get("topic"):
            continue
        queries = [str(q) for q in (t.get("queries") or []) if str(q).strip()][:3] or [str(t["topic"])]
        try:
            bd = int(t.get("base_difficulty", diff))
        except (TypeError, ValueError):
            bd = diff
        qt = str(t.get("question_type", "conceptual")).lower()
        out.append(
            {
                "topic": str(t["topic"])[:120],
                "resume_anchor": (str(t["resume_anchor"])[:120] if t.get("resume_anchor") else None),
                "why": str(t.get("why", ""))[:300],
                "queries": queries,
                "question_type": qt if qt in _TYPES else "conceptual",
                "base_difficulty": min(5, max(1, bd)),
            }
        )
    return out


def build_plan(role: Role, profile: dict, n_topics: int) -> dict:
    user = (
        f"ROLE: {role.title}\nROLE DESCRIPTION: {role.description}\n"
        f"ROLE KNOWLEDGE AREAS: {', '.join(role.core_areas)}\n\nCANDIDATE PROFILE:\n{_profile_brief(profile)}"
    )
    source = "llm"
    try:
        data = get_llm().json_chat(PLAN_SYSTEM.format(n=n_topics), user, fast=True, temperature=0.3, max_tokens=1800)
        topics = _sanitize(data.get("topics", []), profile)
    except LLMError as exc:
        log.warning("Plan generation failed, using fallback: %s", exc)
        topics = []
    if len(topics) < n_topics:
        source = "llm+fallback" if topics else "fallback"
        existing = {t["topic"].lower() for t in topics}
        for t in _fallback_plan(role, profile, n_topics * 2):
            if len(topics) >= n_topics:
                break
            if t["topic"].lower() not in existing:
                topics.append(t)
                existing.add(t["topic"].lower())
    return {"topics": topics[:n_topics], "source": source, "initial_difficulty": initial_difficulty(profile)}
