"""Ported from the prior vega_v2 project's pipeline/discovery/ht_walker.py, unchanged."""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Iterator

logger = logging.getLogger(__name__)

_HT_FILENAME_RE = re.compile(r"^[A-Z]{2,5}\d+\.pdf$")


def discover_ht_files(ht_root: Path) -> Iterator[Path]:
    """Flat directory, history-only (no Details file, no maps URL -- spec §0). Every real filename
    in this dataset matches '^[A-Z]{2,5}\\d+\\.pdf$' (e.g. SPT1307.pdf); anything else is logged and
    skipped defensively in case future drops add stray non-station files."""
    for pdf_path in sorted(ht_root.glob("*.pdf")):
        if _HT_FILENAME_RE.match(pdf_path.name):
            yield pdf_path
        else:
            logger.warning("Skipping non-conforming HT filename: %s", pdf_path.name)
