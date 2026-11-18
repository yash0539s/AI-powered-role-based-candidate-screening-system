"""Knowledge ingestion: PDF -> clean pages -> chunks -> embeddings -> Chroma.

Idempotent: a book that already has chunks in the store is skipped unless
`force=True`. Chunk IDs are deterministic (`<book_id>:<index>`).
"""
import logging
import time
from pathlib import Path

from ..config import get_settings
from ..roles import BOOKS
from .chunker import chunk_pages
from .embeddings import get_embedder
from .loader import load_pdf_pages
from .vector_store import get_vector_store

log = logging.getLogger(__name__)


def ingest_book(book_id: str, force: bool = False) -> dict:
    s = get_settings()
    book = BOOKS[book_id]
    path = Path(s.books_dir) / book.filename
    store = get_vector_store()

    if not path.exists():
        return {"book_id": book_id, "status": "missing_pdf", "path": str(path)}

    existing = store.book_chunk_count(book_id)
    if existing and not force:
        return {"book_id": book_id, "status": "already_ingested", "chunks": existing}
    if existing:
        store.delete_book(book_id)

    t0 = time.time()
    pages = load_pdf_pages(path)
    chunks = chunk_pages(pages, s.chunk_size_chars, s.chunk_overlap_chars, s.min_chunk_chars)
    if not chunks:
        return {"book_id": book_id, "status": "no_text_extracted"}

    log.info("%s: %d pages -> %d chunks; embedding...", book_id, len(pages), len(chunks))
    texts = [c.text for c in chunks]
    vecs = get_embedder().embed_passages(texts)
    store.add(
        ids=[f"{book_id}:{c.index}" for c in chunks],
        texts=texts,
        embeddings=vecs,
        metas=[
            {
                "book_id": book_id,
                "chunk_index": c.index,
                "page_start": c.page_start,
                "page_end": c.page_end,
            }
            for c in chunks
        ],
    )
    dt = time.time() - t0
    log.info("%s: ingested %d chunks in %.1fs", book_id, len(chunks), dt)
    return {"book_id": book_id, "status": "ingested", "pages": len(pages), "chunks": len(chunks), "seconds": round(dt, 1)}


def kb_status() -> dict[str, int]:
    store = get_vector_store()
    return {bid: store.book_chunk_count(bid) for bid in BOOKS}
