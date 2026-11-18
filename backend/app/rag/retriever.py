"""Hybrid retrieval: multi-query dense + BM25 -> Reciprocal Rank Fusion -> grounding filter -> MMR.

Why each stage exists
---------------------
1. **Multi-query**: each interview topic comes with 2-3 queries built from the role
   *and* the resume (e.g. "random forest feature importance" for a candidate who
   lists random forests). Different phrasings recover different relevant chunks.
2. **Dense (bge-small)** captures semantic similarity ("overfitting" ~ "poor
   generalisation"); **BM25** captures exact technical terms / acronyms
   ("EM", "SVM", "ID3") that small embedding models often blur.
3. **RRF** fuses the ranked lists without needing to calibrate score scales.
4. **Grounding filter**: a chunk must be semantically close to the topic
   (cosine >= threshold vs the mean query vector), so BM25 keyword
   coincidences can't sneak irrelevant text into the prompt.
5. **MMR** picks the final k chunks to be relevant *and* non-redundant
   (overlapping neighbour chunks would otherwise waste the context budget).
6. Chunks already used earlier in the session are down-weighted so successive
   questions explore new material.
"""
import logging
import re
import threading
from dataclasses import dataclass, field

import numpy as np
from rank_bm25 import BM25Okapi

from ..config import get_settings
from ..roles import BOOKS, Role
from .embeddings import get_embedder
from .vector_store import get_vector_store

log = logging.getLogger(__name__)

_STOP = set(
    "a an the of and or to in on for with by is are was were be been being as at from that this these those "
    "it its into than then there their they we you your our can could would should may might will what which "
    "who whom how why when where do does did not no yes if else about over under between such using use used".split()
)
_TOKEN = re.compile(r"[a-z0-9][a-z0-9\-\+]*")


def tokenize(text: str) -> list[str]:
    return [t for t in _TOKEN.findall(text.lower()) if t not in _STOP and len(t) > 1]


@dataclass
class RetrievedChunk:
    id: str
    text: str
    book_id: str
    book_title: str
    page_start: int
    page_end: int
    similarity: float  # cosine vs topic query centroid
    fused_score: float  # RRF score
    matched_by: list[str] = field(default_factory=list)  # ["dense", "bm25"]

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "text": self.text,
            "book_id": self.book_id,
            "book_title": self.book_title,
            "page_start": self.page_start,
            "page_end": self.page_end,
            "similarity": round(self.similarity, 4),
            "fused_score": round(self.fused_score, 5),
            "matched_by": self.matched_by,
        }


class _BM25Index:
    def __init__(self, ids: list[str], docs: list[str], metas: list[dict]):
        self.ids = ids
        self.docs = docs
        self.metas = metas
        self.bm25 = BM25Okapi([tokenize(d) for d in docs]) if docs else None

    def search(self, query: str, n: int) -> list[tuple[str, float]]:
        if not self.bm25:
            return []
        scores = self.bm25.get_scores(tokenize(query))
        top = np.argsort(scores)[::-1][:n]
        return [(self.ids[i], float(scores[i])) for i in top if scores[i] > 0]


class HybridRetriever:
    RRF_K = 60

    def __init__(self) -> None:
        self.settings = get_settings()
        self.store = get_vector_store()
        self.embedder = get_embedder()
        self._bm25: dict[tuple[str, ...], _BM25Index] = {}
        self._lock = threading.Lock()

    def _bm25_for(self, book_ids: tuple[str, ...]) -> _BM25Index:
        with self._lock:
            if book_ids not in self._bm25:
                data = self.store.get_all(list(book_ids))
                self._bm25[book_ids] = _BM25Index(data["ids"], data["documents"], data["metadatas"])
                log.info("Built BM25 index for %s (%d chunks)", book_ids, len(data["ids"]))
            return self._bm25[book_ids]

    def invalidate(self) -> None:
        with self._lock:
            self._bm25.clear()

    def retrieve(
        self,
        queries: list[str],
        role: Role,
        top_k: int | None = None,
        exclude_ids: set[str] | None = None,
    ) -> list[RetrievedChunk]:
        s = self.settings
        top_k = top_k or s.retrieval_top_k
        exclude_ids = exclude_ids or set()
        queries = [q for q in dict.fromkeys(q.strip() for q in queries) if q]
        if not queries:
            return []
        book_ids = tuple(role.book_ids)
        n = s.retrieval_candidates

        q_vecs = self.embedder.embed_queries(queries)
        centroid = q_vecs.mean(axis=0)
        centroid /= np.linalg.norm(centroid) + 1e-12

        fused: dict[str, float] = {}
        matched: dict[str, set[str]] = {}
        pool: dict[str, dict] = {}

        # ---- dense ----
        for qv in q_vecs:
            for rank, hit in enumerate(self.store.query(qv, list(book_ids), n)):
                fused[hit["id"]] = fused.get(hit["id"], 0.0) + 1.0 / (self.RRF_K + rank + 1)
                matched.setdefault(hit["id"], set()).add("dense")
                pool[hit["id"]] = hit
        # ---- sparse ----
        bm25 = self._bm25_for(book_ids)
        for q in queries:
            for rank, (cid, _) in enumerate(bm25.search(q, n)):
                fused[cid] = fused.get(cid, 0.0) + 1.0 / (self.RRF_K + rank + 1)
                matched.setdefault(cid, set()).add("bm25")
        missing = [cid for cid in fused if cid not in pool]
        pool.update(self.store.get_by_ids(missing))

        # ---- candidates: grounding filter + novelty penalty ----
        cands = []
        for cid, score in sorted(fused.items(), key=lambda kv: kv[1], reverse=True)[: n * 2]:
            hit = pool.get(cid)
            if hit is None:
                continue
            sim = float(np.dot(hit["embedding"], centroid))
            if sim < s.retrieval_min_similarity:
                continue
            if cid in exclude_ids:
                score *= 0.3
            cands.append((cid, score, sim, hit))

        if not cands:  # relax the floor rather than return nothing
            log.warning("No chunk passed grounding floor for %s; relaxing", queries[:1])
            for cid, score in sorted(fused.items(), key=lambda kv: kv[1], reverse=True)[:top_k]:
                hit = pool.get(cid)
                if hit is not None:
                    cands.append((cid, score, float(np.dot(hit["embedding"], centroid)), hit))

        selected = self._mmr(cands, top_k, s.mmr_lambda)
        out = []
        for cid, score, sim, hit in selected:
            m = hit["meta"]
            out.append(
                RetrievedChunk(
                    id=cid,
                    text=hit["text"],
                    book_id=m.get("book_id", ""),
                    book_title=BOOKS[m["book_id"]].title if m.get("book_id") in BOOKS else m.get("book_id", ""),
                    page_start=int(m.get("page_start", 0)),
                    page_end=int(m.get("page_end", 0)),
                    similarity=sim,
                    fused_score=score,
                    matched_by=sorted(matched.get(cid, set())),
                )
            )
        return out

    @staticmethod
    def _mmr(cands: list[tuple], k: int, lam: float) -> list[tuple]:
        if len(cands) <= k:
            return cands
        rel = np.array([c[1] for c in cands])
        rel = (rel - rel.min()) / (rel.max() - rel.min() + 1e-12)
        sims = np.array([c[2] for c in cands])
        rel = 0.5 * rel + 0.5 * sims  # blend fused rank signal with semantic closeness
        embs = np.stack([c[3]["embedding"] for c in cands])
        chosen: list[int] = [int(np.argmax(rel))]
        while len(chosen) < k:
            best, best_val = -1, -1e9
            for i in range(len(cands)):
                if i in chosen:
                    continue
                redundancy = max(float(np.dot(embs[i], embs[j])) for j in chosen)
                val = lam * rel[i] - (1 - lam) * redundancy
                if val > best_val:
                    best, best_val = i, val
            chosen.append(best)
        return [cands[i] for i in chosen]


_retriever: HybridRetriever | None = None
_retriever_lock = threading.Lock()


def get_retriever() -> HybridRetriever:
    global _retriever
    with _retriever_lock:
        if _retriever is None:
            _retriever = HybridRetriever()
        return _retriever
