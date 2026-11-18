"""FastAPI application entrypoint.

Run:  uvicorn app.main:app --reload --port 8000   (from backend/)
"""
import logging
import threading
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from .api.routes import router
from .config import get_settings
from .db import init_db
from .services.interview_service import GenerationError, InvalidStateError, NotFoundError
from .services.llm import LLMError
from .services.resume_parser import ResumeError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("app")


def _warm_up() -> None:
    """Load the embedding model + BM25 indexes in the background so the first request is fast."""
    try:
        from .rag.retriever import get_retriever
        from .roles import ROLES

        r = get_retriever()
        for role in ROLES.values():
            r._bm25_for(tuple(role.book_ids))
        log.info("Retrieval warm-up complete")
    except Exception as exc:  # pragma: no cover
        log.warning("Warm-up skipped: %s", exc)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    threading.Thread(target=_warm_up, daemon=True).start()
    yield


app = FastAPI(
    title="AI Candidate Screening API",
    description="RAG-powered, role-based technical screening interviews.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


@app.middleware("http")
async def request_context(request: Request, call_next):
    """Attach a request id (propagated from X-Request-ID if present) and log latency."""
    rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    request.state.request_id = rid
    start = time.perf_counter()
    response = await call_next(request)
    ms = (time.perf_counter() - start) * 1000
    response.headers["X-Request-ID"] = rid
    if request.url.path.startswith("/api"):
        log.info("%s %s -> %s in %.0fms [rid=%s]", request.method, request.url.path, response.status_code, ms, rid)
    return response


def _err(status: int, code: str, msg: str, request: Request | None = None) -> JSONResponse:
    rid = getattr(getattr(request, "state", None), "request_id", None)
    return JSONResponse(status_code=status, content={"error": code, "detail": msg, "request_id": rid})


@app.exception_handler(IntegrityError)
async def _integrity(request: Request, exc: IntegrityError):
    log.warning("Integrity conflict: %s", exc.orig)
    return _err(409, "conflict", "Concurrent update detected - please retry.", request)


@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error [rid=%s]", getattr(request.state, "request_id", "?"))
    return _err(500, "internal_error", "Unexpected server error. It has been logged.", request)


@app.exception_handler(NotFoundError)
async def _nf(_: Request, exc: NotFoundError):
    return _err(404, "not_found", str(exc))


@app.exception_handler(InvalidStateError)
async def _inv(_: Request, exc: InvalidStateError):
    return _err(409, "invalid_state", str(exc))


@app.exception_handler(ResumeError)
async def _resume(_: Request, exc: ResumeError):
    return _err(422, "invalid_resume", str(exc))


@app.exception_handler(GenerationError)
async def _gen(_: Request, exc: GenerationError):
    return _err(502, "generation_failed", f"Question generation failed: {exc}")


@app.exception_handler(LLMError)
async def _llm(_: Request, exc: LLMError):
    return _err(502, "llm_error", str(exc))


app.include_router(router)


@app.get("/")
def root() -> dict:
    return {"service": "ai-candidate-screening", "docs": "/docs"}
