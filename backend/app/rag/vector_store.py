"""Thin wrapper around a persistent ChromaDB collection.

One collection holds every book; each chunk carries `book_id` metadata so a role
query is a metadata filter (`book_id IN role.book_ids`). Cosine space, and we
supply our own (normalised) embeddings so the store is model-agnostic.
"""
import logging
from functools import lru_cache
from typing import Any

import numpy as np

from ..config import get_settings

log = logging.getLogger(__name__)


class VectorStore:
    def __init__(self, path: str, collection: str):
        import chromadb
        from chromadb.config import Settings as ChromaSettings

        self._client = chromadb.PersistentClient(
            path=path, settings=ChromaSettings(anonymized_telemetry=False)
        )
        self._col = self._client.get_or_create_collection(
            name=collection, metadata={"hnsw:space": "cosine"}
        )

    # ---------- write ----------
    def add(self, ids: list[str], texts: list[str], embeddings: np.ndarray, metas: list[dict]) -> None:
        step = 2000  # chroma has a max batch size
        for i in range(0, len(ids), step):
            self._col.upsert(
                ids=ids[i : i + step],
                documents=texts[i : i + step],
                embeddings=embeddings[i : i + step].tolist(),
                metadatas=metas[i : i + step],
            )

    def delete_book(self, book_id: str) -> None:
        self._col.delete(where={"book_id": book_id})

    # ---------- read ----------
    def count(self) -> int:
        return self._col.count()

    def book_chunk_count(self, book_id: str) -> int:
        return len(self._col.get(where={"book_id": book_id}, include=[])["ids"])

    @staticmethod
    def _where(book_ids: list[str]) -> dict:
        return {"book_id": book_ids[0]} if len(book_ids) == 1 else {"book_id": {"$in": book_ids}}

    def query(self, embedding: np.ndarray, book_ids: list[str], n: int) -> list[dict[str, Any]]:
        res = self._col.query(
            query_embeddings=[embedding.tolist()],
            n_results=n,
            where=self._where(book_ids),
            include=["documents", "metadatas", "distances", "embeddings"],
        )
        out = []
        for i, cid in enumerate(res["ids"][0]):
            out.append(
                {
                    "id": cid,
                    "text": res["documents"][0][i],
                    "meta": res["metadatas"][0][i],
                    "similarity": 1.0 - float(res["distances"][0][i]),
                    "embedding": np.asarray(res["embeddings"][0][i], dtype=np.float32),
                }
            )
        return out

    def get_all(self, book_ids: list[str]) -> dict[str, list]:
        return self._col.get(where=self._where(book_ids), include=["documents", "metadatas"])

    def get_by_ids(self, ids: list[str]) -> dict[str, dict[str, Any]]:
        if not ids:
            return {}
        res = self._col.get(ids=ids, include=["documents", "metadatas", "embeddings"])
        return {
            cid: {
                "id": cid,
                "text": res["documents"][i],
                "meta": res["metadatas"][i],
                "embedding": np.asarray(res["embeddings"][i], dtype=np.float32),
            }
            for i, cid in enumerate(res["ids"])
        }


@lru_cache
def get_vector_store() -> VectorStore:
    s = get_settings()
    return VectorStore(s.chroma_dir, s.chroma_collection)
