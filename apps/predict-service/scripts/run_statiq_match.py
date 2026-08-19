"""
CLI entrypoint for cross-referencing Statiq's public station-markers API against
our stations table -- see app/pipeline/statiq_match.py for the full rationale.

Usage (run from apps/predict-service/):
    python scripts/run_statiq_match.py --dry-run   # fetch + match, no DB writes
    python scripts/run_statiq_match.py              # full live run
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.pipeline.statiq_match import run  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Fetch and match only, skip all DB writes")
    args = parser.parse_args()
    run(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
