"""Download the knowledge-base textbooks listed in the assignment.

Usage:  python -m scripts.download_books [book_id ...]
"""
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402
from app.roles import BOOKS  # noqa: E402

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"


def download(book_id: str, dest_dir: Path) -> None:
    book = BOOKS[book_id]
    dest = dest_dir / book.filename
    if dest.exists() and dest.stat().st_size > 50_000:
        print(f"[skip] {book_id}: already present ({dest.stat().st_size / 1e6:.1f} MB)")
        return
    print(f"[get ] {book_id}: {book.url}")
    req = urllib.request.Request(book.url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = resp.read()
    except Exception as exc:
        print(f"[FAIL] {book_id}: {exc}")
        return
    if not data.startswith(b"%PDF"):
        print(f"[FAIL] {book_id}: response is not a PDF (got {data[:40]!r})")
        return
    dest.write_bytes(data)
    print(f"[ ok ] {book_id}: {len(data) / 1e6:.1f} MB -> {dest}")


def main() -> None:
    dest_dir = Path(get_settings().books_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    ids = sys.argv[1:] or list(BOOKS)
    for bid in ids:
        if bid not in BOOKS:
            print(f"unknown book id {bid}; choose from {list(BOOKS)}")
            continue
        download(bid, dest_dir)


if __name__ == "__main__":
    main()
