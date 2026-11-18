"""Local embedding model (fastembed / ONNX, CPU-only, no API key needed).

BAAI/bge-small-en-v1.5: 384-d, strong on retrieval benchmarks for its size and
fast on CPU. bge models are *asymmetric*: queries get an instruction prefix,
passages do not -- fastembed's `query_embed` / `passage_embed` handle that.
"""
import logging
from functools import lru_cache

import numpy as np

from ..config import DATA_DIR, get_settings

log = logging.getLogger(__name__)


class Embedder:
    def __init__(self, model_name: str):
        from fastembed import TextEmbedding

        log.info("Loading embedding model %s ...", model_name)
        self.model_name = model_name
        self._model = TextEmbedding(model_name=model_name, cache_dir=str(DATA_DIR / ".fastembed_cache"))

    @staticmethod
    def _norm(m: np.ndarray) -> np.ndarray:
        return m / np.clip(np.linalg.norm(m, axis=1, keepdims=True), 1e-12, None)

    def embed_passages(self, texts: list[str], batch_size: int = 64) -> np.ndarray:
        vecs = np.array(list(self._model.passage_embed(texts, batch_size=batch_size)), dtype=np.float32)
        return self._norm(vecs)

    def embed_queries(self, texts: list[str]) -> np.ndarray:
        vecs = np.array(list(self._model.query_embed(texts)), dtype=np.float32)
        return self._norm(vecs)


@lru_cache
def get_embedder() -> Embedder:
    return Embedder(get_settings().embedding_model)
