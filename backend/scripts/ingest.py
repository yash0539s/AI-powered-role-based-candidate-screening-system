"""Build the vector knowledge base from downloaded textbooks.

Usage:
    python -m scripts.ingest                # all books that are downloaded
    python -m scripts.ingest mitchell burkov
    python -m scripts.ingest --force bishop # re-chunk / re-embed
"""
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.rag.ingest import ingest_book, kb_status  # noqa: E402
from app.roles import BOOKS  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


def main() -> None:
    args = sys.argv[1:]
    force = "--force" in args
    ids = [a for a in args if not a.startswith("--")] or list(BOOKS)
    for bid in ids:
        print(ingest_book(bid, force=force))
    print("\nKnowledge base status (chunks per book):")
    for bid, n in kb_status().items():
        print(f"  {bid:14s} {n}")


if __name__ == "__main__":
    main()
