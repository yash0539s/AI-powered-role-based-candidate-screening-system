"""Resume text extraction + structured profile extraction.

Two layers:
1. LLM extraction (fast model) into a fixed JSON schema.
2. A deterministic keyword lexicon pass that (a) acts as a fallback if the LLM
   is unavailable and (b) is merged into the LLM result to catch obvious items
   the model skipped. This keeps the pipeline robust for the demo and in prod.
"""
import io
import logging
import re

from pypdf import PdfReader

from ..config import get_settings
from .llm import LLMError, get_llm
from .prompts import RESUME_SYSTEM

log = logging.getLogger(__name__)


class ResumeError(ValueError):
    pass


_LEXICON = {
    "technologies": [
        "Python", "R", "SQL", "Java", "C++", "JavaScript", "TypeScript", "Go", "Scala", "Spark", "Hadoop",
        "TensorFlow", "PyTorch", "Keras", "scikit-learn", "XGBoost", "LightGBM", "Pandas", "NumPy", "SciPy",
        "Matplotlib", "OpenCV", "Hugging Face", "LangChain", "FastAPI", "Flask", "Django", "Docker",
        "Kubernetes", "AWS", "GCP", "Azure", "PostgreSQL", "MongoDB", "Redis", "Kafka", "Airflow", "MLflow",
        "React", "Node.js", "Git", "Tableau", "Power BI",
    ],
    "ml_concepts": [
        "linear regression", "logistic regression", "decision tree", "random forest", "gradient boosting",
        "SVM", "support vector machine", "k-means", "clustering", "PCA", "neural network", "deep learning",
        "CNN", "RNN", "LSTM", "transformer", "NLP", "computer vision", "reinforcement learning",
        "naive bayes", "bayesian", "k-nearest", "KNN", "feature engineering", "cross-validation",
        "hyperparameter tuning", "regularization", "time series", "recommendation", "anomaly detection",
        "classification", "regression", "embeddings", "RAG", "LLM", "fine-tuning", "A/B testing",
    ],
}


def extract_text(filename: str, data: bytes) -> str:
    s = get_settings()
    if len(data) > s.max_upload_mb * 1024 * 1024:
        raise ResumeError(f"Resume exceeds {s.max_upload_mb} MB limit.")
    name = (filename or "").lower()
    if name.endswith(".pdf") or data[:4] == b"%PDF":
        try:
            reader = PdfReader(io.BytesIO(data))
            text = "\n".join((p.extract_text() or "") for p in reader.pages)
        except Exception as exc:
            raise ResumeError(f"Could not read PDF: {exc}") from exc
    elif name.endswith((".txt", ".md")) or not name:
        text = data.decode("utf-8", errors="ignore")
    else:
        raise ResumeError("Unsupported file type. Please upload a PDF or .txt resume.")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if len(text) < 100:
        raise ResumeError(
            "Very little text could be extracted from the resume (is it a scanned image?). "
            "Please upload a text-based PDF or a .txt file."
        )
    return text[: s.max_resume_chars]


def _lexicon_profile(text: str) -> dict:
    low = text.lower()

    def found(terms: list[str]) -> list[str]:
        out = []
        for t in terms:
            pat = r"(?<![a-z0-9])" + re.escape(t.lower()) + r"(?![a-z0-9])"
            if re.search(pat, low):
                out.append(t)
        return out

    years = [int(y) for y in re.findall(r"(\d{1,2})\+?\s*(?:years|yrs)", low)]
    yrs = max(years) if years else 0
    level = "student" if re.search(r"\b(student|undergraduate|b\.?tech|pursuing)\b", low) and yrs < 1 else (
        "senior" if yrs >= 6 else "mid" if yrs >= 3 else "junior"
    )
    return {
        "candidate_name": None,
        "summary": "",
        "experience_level": level,
        "years_experience": yrs,
        "skills": [],
        "technologies": found(_LEXICON["technologies"]),
        "domains": [],
        "ml_concepts": found(_LEXICON["ml_concepts"]),
        "projects": [],
        "education": "",
    }


def _merge_lists(a: list, b: list, limit: int = 20) -> list:
    seen, out = set(), []
    for x in [*a, *b]:
        if isinstance(x, str) and x.strip() and x.strip().lower() not in seen:
            seen.add(x.strip().lower())
            out.append(x.strip())
    return out[:limit]


def extract_profile(resume_text: str) -> dict:
    lex = _lexicon_profile(resume_text)
    try:
        data = get_llm().json_chat(RESUME_SYSTEM, f"RESUME:\n{resume_text}", fast=True, temperature=0.0)
        source = "llm+lexicon"
    except LLMError as exc:
        log.warning("Resume LLM extraction failed, using lexicon fallback: %s", exc)
        data, source = {}, "lexicon_fallback"

    level = data.get("experience_level")
    profile = {
        "candidate_name": data.get("candidate_name") or None,
        "summary": str(data.get("summary") or "")[:500],
        "experience_level": level if level in {"student", "junior", "mid", "senior"} else lex["experience_level"],
        "years_experience": _num(data.get("years_experience"), lex["years_experience"]),
        "skills": _merge_lists(data.get("skills") or [], []),
        "technologies": _merge_lists(data.get("technologies") or [], lex["technologies"]),
        "domains": _merge_lists(data.get("domains") or [], []),
        "ml_concepts": _merge_lists(data.get("ml_concepts") or [], lex["ml_concepts"]),
        "projects": [
            {
                "name": str(p.get("name", ""))[:120],
                "summary": str(p.get("summary", ""))[:300],
                "technologies": [str(t) for t in (p.get("technologies") or [])][:10],
            }
            for p in (data.get("projects") or [])[:5]
            if isinstance(p, dict)
        ],
        "education": str(data.get("education") or "")[:200],
        "extraction_source": source,
    }
    return profile


def _num(v, default: float) -> float:
    try:
        return max(0.0, float(v))
    except (TypeError, ValueError):
        return float(default)
