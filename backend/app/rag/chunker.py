"""Sentence-aware sliding-window chunker.

Design choices
--------------
* ~1000 characters (~200-250 tokens) per chunk: large enough to hold a complete
  definition/explanation (context preservation), small enough that the top-k
  chunks fit comfortably in a small LLM context window (Groq free tier TPM).
* Chunks are built from whole sentences -- we never cut mid-sentence, which keeps
  each chunk self-contained and readable when shown back to the user as a source.
* ~180 characters of sentence-level overlap between neighbours so an idea that
  straddles a boundary is still retrievable from either side.
* Chunks never cross a *book* boundary, but may cross page boundaries; we keep
  page_start / page_end for citation.
"""
import re
from dataclasses import dataclass

from .loader import Page

# Split on sentence end followed by whitespace + capital/digit/bracket, or on newlines.
_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9(\[])|\n+")


_DOT_LEADER = re.compile(r"(?:\.\s?){5,}")


def is_low_value_chunk(text: str) -> bool:
    """Catch table-of-contents / index fragments that survived page-level filtering
    (dot leaders like 'Pipelines . . . . . 305', or mostly digits/punctuation)."""
    if len(_DOT_LEADER.findall(text)) >= 2:
        return True
    alpha = sum(c.isalpha() for c in text) / max(len(text), 1)
    return alpha < 0.5


@dataclass
class Chunk:
    index: int
    text: str
    page_start: int
    page_end: int


def _sentences(pages: list[Page]) -> list[tuple[str, int]]:
    out: list[tuple[str, int]] = []
    for p in pages:
        for s in _SENT_SPLIT.split(p.text):
            s = s.strip()
            if s:
                out.append((s, p.number))
    return out


def chunk_pages(
    pages: list[Page], size: int = 1000, overlap: int = 180, min_chars: int = 250
) -> list[Chunk]:
    sents = _sentences(pages)
    chunks: list[Chunk] = []
    buf: list[tuple[str, int]] = []
    buf_len = 0

    def flush() -> None:
        nonlocal buf, buf_len
        if not buf:
            return
        text = " ".join(s for s, _ in buf).strip()
        if len(text) >= min_chars and not is_low_value_chunk(text):
            chunks.append(Chunk(len(chunks), text, buf[0][1], buf[-1][1]))
        # keep a tail of sentences as overlap for the next chunk
        tail: list[tuple[str, int]] = []
        tail_len = 0
        for s, pg in reversed(buf):
            if tail_len + len(s) > overlap:
                break
            tail.insert(0, (s, pg))
            tail_len += len(s) + 1
        buf, buf_len = tail, tail_len

    for sent, pg in sents:
        # hard-split pathological very long "sentences" (equations, tables)
        while len(sent) > size:
            head, sent = sent[:size], sent[size:]
            buf.append((head, pg))
            buf_len += len(head)
            flush()
        if buf_len + len(sent) > size and buf_len > 0:
            flush()
        buf.append((sent, pg))
        buf_len += len(sent) + 1
    flush()
    return chunks
