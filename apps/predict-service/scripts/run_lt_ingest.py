"""
CLI entrypoint for the LT bill ingestion pipeline.

Usage:
    python scripts/run_lt_ingest.py                 # full run, all eligible stations
    python scripts/run_lt_ingest.py --limit 20       # first 20 only
    python scripts/run_lt_ingest.py --dry-run        # scrape only, no DB writes

Run from apps/predict-service/ (so the `app` package resolves), e.g.:
    cd apps/predict-service && python scripts/run_lt_ingest.py
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.pipeline.lt_ingest import run  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=None, help="Only process the first N eligible stations")
    parser.add_argument("--dry-run", action="store_true", help="Scrape only, skip all DB writes")
    args = parser.parse_args()

    run(limit=args.limit, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
