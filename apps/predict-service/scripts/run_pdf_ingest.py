"""
CLI entrypoint for the PDF-history ingestion pipeline (TS_LT_data / TS_HT_data
bill fixture PDFs the user supplied -- not a live scrape).

Usage (run from apps/predict-service/):
    python scripts/run_pdf_ingest.py --dry-run --limit 5 --sample 10   # inspect only, no DB writes
    python scripts/run_pdf_ingest.py --dry-run                         # full dry-run stats, no writes
    python scripts/run_pdf_ingest.py                                    # full live run
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.pipeline.pdf_ingest import run  # noqa: E402

# apps/predict-service/scripts/run_pdf_ingest.py -> parents[3] = repo root, which holds
# TS_LT_data/ and TS_HT_data/ directly.
DEFAULT_LT_DIR = Path(__file__).resolve().parents[3] / "TS_LT_data"
DEFAULT_HT_DIR = Path(__file__).resolve().parents[3] / "TS_HT_data"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lt-dir", type=Path, default=DEFAULT_LT_DIR)
    parser.add_argument("--ht-dir", type=Path, default=DEFAULT_HT_DIR)
    parser.add_argument("--limit", type=int, default=None, help="Only process the first N stations per source (LT/HT each)")
    parser.add_argument("--dry-run", action="store_true", help="Parse only, skip all DB writes")
    parser.add_argument("--sample", type=int, default=0, help="Print full parsed bill detail for the first N files, for manual verification")
    args = parser.parse_args()

    run(lt_root=args.lt_dir, ht_root=args.ht_dir, limit=args.limit, dry_run=args.dry_run, sample=args.sample)


if __name__ == "__main__":
    main()
