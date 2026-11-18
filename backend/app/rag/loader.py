"""PDF loading + text cleaning for textbook ingestion.

Textbooks contain a lot of text that is useless (or harmful) for retrieval:
table-of-contents pages, indexes, bibliographies, running headers and bare page
numbers. We filter those at the *page* level with cheap heuristics so they
never enter the vector store.
"""
import logging
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader

log = logging.getLogger(__name__)

_TOC_LINE = re.compile(r"(\.\s?){4,}\s*\d+\s*$|\s{2,}\d{1,4}\s*$")
_INDEX_LINE = re.compile(r"^[A-Za-z][\w\s,\-()']{1,60},\s*\d{1,4}(\s*[,–-]\s*\d{1,4})*\s*$")
_PAGE_NUM_LINE = re.compile(r"^\s*(page\s*)?\d{1,4}\s*$", re.I)
_BIB_LINE = re.compile(r"^\s*\[?\d{1,3}\]?\s+[A-Z][a-z]+,?\s+[A-Z]\.|\(\d{4}\)\.|\bpp\.\s*\d+", re.I)


@dataclass
class Page:
    number: int  # 1-based physical page number in the PDF
    text: str


def _clean_page_text(raw: str) -> str:
    text = unicodedata.normalize("NFKC", raw)  # ligatures (ﬁ, ﬀ) -> plain letters
    text = text.replace("­", "").replace("�", " ")  # soft hyphens / replacement chars
    text = re.sub(r"([a-z])\s?-\s*\n\s*([a-z])", r"\1\2", text)  # de-hyphenate line breaks
    text = re.sub(r"\b([a-z]{2,}) - ([a-z]{2,})\b", r"\1\2", text)  # "mul - tiple" -> "multiple"
    lines = [ln.strip() for ln in text.splitlines()]
    lines = [ln for ln in lines if ln and not _PAGE_NUM_LINE.match(ln)]
    # Re-flow: join lines inside a paragraph; keep blank-ish breaks after sentence ends.
    out: list[str] = []
    for ln in lines:
        if out and not re.search(r"[.!?:]\s*$", out[-1]) and len(out[-1]) > 40:
            out[-1] = f"{out[-1]} {ln}"
        else:
            out.append(ln)
    text = "\n".join(out)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def _is_low_value_page(text: str) -> bool:
    if len(text) < 200:
        return True
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if not lines:
        return True
    alpha_ratio = sum(c.isalpha() for c in text) / max(len(text), 1)
    if alpha_ratio < 0.45:  # tables / heavy-math-only / garbage extraction
        return True
    toc = sum(bool(_TOC_LINE.search(ln)) for ln in lines) / len(lines)
    idx = sum(bool(_INDEX_LINE.match(ln)) for ln in lines) / len(lines)
    bib = sum(bool(_BIB_LINE.search(ln)) for ln in lines) / len(lines)
    head = text[:200].lower()
    if any(k in head for k in ("table of contents", "contents\n", "bibliography", "references\n", "index\n")):
        if toc > 0.2 or idx > 0.2 or bib > 0.2:
            return True
    return toc > 0.35 or idx > 0.45 or bib > 0.4


def load_pdf_pages(path: Path) -> list[Page]:
    reader = PdfReader(str(path))
    pages: list[Page] = []
    skipped = 0
    for i, pg in enumerate(reader.pages, start=1):
        try:
            raw = pg.extract_text() or ""
        except Exception as exc:  # pragma: no cover - corrupt page objects
            log.debug("page %s extraction failed: %s", i, exc)
            skipped += 1
            continue
        text = _clean_page_text(raw)
        if _is_low_value_page(text):
            skipped += 1
            continue
        pages.append(Page(number=i, text=text))
    log.info("%s: kept %d pages, skipped %d low-value pages", path.name, len(pages), skipped)
    return pages
