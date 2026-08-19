"""Ported from the prior vega_v2 project's pipeline/parsers/detect.py, unchanged."""

from __future__ import annotations

import re
from pathlib import Path

from app.parsers.common import MonthlyBillRow, ParserName, extract_full_text
from app.parsers.ht_wide import parse_ht_wide
from app.parsers.lt_compact import parse_lt_compact
from app.parsers.lt_dual import parse_lt_dual
from app.parsers.lt_single import parse_lt_single

_HT_MARKERS = re.compile(r"HTDASHBOARD|BillHistoryReport|\bSPT\d+\b")
_LT_DUAL_MARKERS = re.compile(r"9N\s*LT|CMD\(KVA\)")

_PARSERS = {
    "ht_wide": parse_ht_wide,
    "lt_dual": parse_lt_dual,
    "lt_single": parse_lt_single,
}


def detect_format(text: str) -> ParserName:
    """Routes a history PDF's extracted text to the right parser.

    Detection order (most specific first):
    1. HT: HTDASHBOARD / BillHistoryReport server signature, or an SPTxxxx service number,
       combined with the RECORDED/BILLED column groups that only appear in the HT wide format.
    2. LT dual-row: the '9N LT' second line or 'CMD(KVA)' column header.
    3. Otherwise: LT single-row (the default ConsumptionReportHistory format).
    """
    if _HT_MARKERS.search(text) and "RECORDED" in text and "BILLED" in text:
        return "ht_wide"
    if _LT_DUAL_MARKERS.search(text):
        return "lt_dual"
    return "lt_single"


def auto_parse_history(pdf_path: Path | str) -> tuple[ParserName, list[MonthlyBillRow]]:
    """Opens a history PDF, detects its format, and dispatches to the matching parser.

    Falls back to lt_compact (see app/parsers/lt_compact.py) when the primary LT parser
    finds zero rows -- some documents put the whole billing table in one unsplit text blob
    that pdfplumber's table extraction can't see as cells at all, so lt_single/lt_dual's
    row-shape checks never match anything (no exception, just silently empty). Only tried
    for lt_single/lt_dual, never ht_wide -- lt_compact's markers ("Consumer Type LT") are
    LT-specific.
    """
    pdf_path = Path(pdf_path)
    text = extract_full_text(pdf_path)
    fmt = detect_format(text)
    rows = _PARSERS[fmt](pdf_path)
    if not rows and fmt in ("lt_single", "lt_dual"):
        fallback_rows = parse_lt_compact(pdf_path)
        if fallback_rows:
            return "lt_compact", fallback_rows
    return fmt, rows
