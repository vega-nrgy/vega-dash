"""
CLI entrypoint for training the baseline prediction model.

Usage:
    python scripts/train_model.py

Run from apps/predict-service/, e.g.:
    cd apps/predict-service && python scripts/train_model.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.model.train import run  # noqa: E402

if __name__ == "__main__":
    run()
