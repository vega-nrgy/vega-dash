"""Ported from the prior vega_v2 project's pipeline/geo/lt_geo.py, unchanged."""

from __future__ import annotations

import re
from pathlib import Path

import pdfplumber

_MAPS_URI_RE = re.compile(r"query=(-?\d+\.\d+),(-?\d+\.\d+)")


def extract_lt_geo(details_pdf_path: Path) -> tuple[float, float] | None:
    """Scans every page's link annotations for a Google Maps URI and pulls out lat/long.
    Confirmed mechanism: real Consumer Details PDFs embed a clickable map icon whose link
    annotation 'uri' looks like 'https://www.google.com/maps/search/?api=1&query=LAT,LONG&t=k'."""
    with pdfplumber.open(details_pdf_path) as pdf:
        for page in pdf.pages:
            for annot in page.hyperlinks:
                uri = annot.get("uri", "") or ""
                if "google.com/maps" not in uri:
                    continue
                m = _MAPS_URI_RE.search(uri)
                if m:
                    return float(m.group(1)), float(m.group(2))
    return None
