"""Centralised configuration, loaded from environment variables / .env."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR / ".env", BACKEND_DIR.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- LLM (Groq, OpenAI-compatible API) ---
    groq_api_key: str = ""
    groq_base_url: str = "https://api.groq.com/openai/v1"
    # Strong model: question generation + answer evaluation + report
    llm_model: str = "openai/gpt-oss-120b"
    # Fast/cheap model: resume extraction + interview planning
    llm_model_fast: str = "openai/gpt-oss-20b"
    llm_temperature: float = 0.4
    # For reasoning models (gpt-oss, qwen3): low effort keeps latency + free-tier token use down
    llm_reasoning_effort: str = "low"
    llm_max_retries: int = 4
    llm_timeout_s: float = 60.0

    # --- Embeddings (local, free) ---
    embedding_model: str = "BAAI/bge-small-en-v1.5"

    # --- Storage ---
    database_url: str = f"sqlite:///{(DATA_DIR / 'screening.db').as_posix()}"
    chroma_dir: str = str(DATA_DIR / "chroma")
    books_dir: str = str(DATA_DIR / "books")
    chroma_collection: str = "ml_knowledge_base"

    # --- Chunking ---
    chunk_size_chars: int = 1000
    chunk_overlap_chars: int = 180
    min_chunk_chars: int = 250

    # --- Retrieval ---
    retrieval_candidates: int = 20  # per query, per retriever (dense / bm25)
    retrieval_top_k: int = 4  # chunks handed to the LLM per question
    retrieval_min_similarity: float = 0.45  # dense cosine floor for "grounded" chunks
    mmr_lambda: float = 0.7  # relevance vs diversity trade-off

    # --- Interview ---
    default_num_questions: int = 6
    max_num_questions: int = 12
    max_follow_ups_per_topic: int = 1
    max_resume_chars: int = 12000
    max_upload_mb: int = 5

    # --- API ---
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
