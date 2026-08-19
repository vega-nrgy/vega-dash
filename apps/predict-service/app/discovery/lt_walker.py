"""Ported from the prior vega_v2 project's pipeline/discovery/lt_walker.py, unchanged."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, Literal

from app.parsers.common import extract_full_text

logger = logging.getLogger(__name__)

_UNIQUE_SCNO_RE = re.compile(
    r"(?:Pre-Paid Unique SCNo|Service Number\s*/\s*Unique\s*Scno|Service Number\s*/\s*UKSCNO)"
    r"\s+(\d+(?:\s\d+)?)(?:\s*/\s*(\d+(?:\s\d+)?))?"
)
# Fallback for History docs that print the same "Consumer Management" block without the
# "/ UKSCNO" suffix ("Service Number 114955578 Last Pay Date ...", vs. the usual
# "Service Number / UKSCNO 114195145 / 114195145 Last Pay Date ..."). Found 2026-08-17: 17
# such files across the assets/Data drop, all correctly classified as history but silently
# dropped (extract_unique_scno returned None) -- confirmed by cross-checking against each
# file's own filename-embedded id and its sibling Details doc, all matched exactly.
# Anchored on "Last Pay Date" immediately after, since that's specific to this History-report
# block -- bare "Service Number" in a *Details* doc means the old raw service number instead
# (a different value) and is there followed by "Sub Division", never "Last Pay Date". Gated
# on doc_type == "history" at the call site as a second safeguard against that mix-up.
_HISTORY_SCNO_FALLBACK_RE = re.compile(r"Service Number\s+(\d+)\s+Last Pay Date")
_FILENAME_SCNO_RE = re.compile(r"^(\d+)")
_INDEX_DOC_MARKER = "New Service Registration Report"
_DETAILS_MARKER = "Service Particulars"
_HISTORY_MARKER = "Consumption, Billing, Collection and Arrears"

DocType = Literal["details", "history", "unknown"]


@dataclass
class LtPair:
    unique_scno: str
    station_folder_name: str
    details_path: Path | None
    history_path: Path | None


def is_index_document(text: str) -> bool:
    """Content-sniff for zone-level 'New Service Registration Report' rosters, which don't follow
    a reliable filename convention (e.g. 'ibrahimbagh.pdf' has no naming hint at all)."""
    return _INDEX_DOC_MARKER in text


def classify_document(text: str) -> DocType:
    if _HISTORY_MARKER in text:
        return "history"
    if _DETAILS_MARKER in text:
        return "details"
    return "unknown"


def extract_unique_scno(text: str, doc_type: DocType | None = None) -> str | None:
    m = _UNIQUE_SCNO_RE.search(text)
    if m:
        return re.sub(r"\s+", "", m.group(1))
    if doc_type == "history":
        m = _HISTORY_SCNO_FALLBACK_RE.search(text)
        if m:
            return m.group(1)
    return None


def discover_lt_pairs_flat(pdf_dir: Path) -> Iterator[LtPair]:
    """Same pairing logic as discover_lt_pairs, but for a FLAT directory where all PDFs sit
    directly in pdf_dir (no subdirectory structure). Used for the pdfs/ drop folder."""
    groups: dict[str, dict[str, list[Path]]] = {}

    for pdf_path in sorted(pdf_dir.glob("*.pdf")):
        try:
            text = extract_full_text(pdf_path)
        except Exception:
            logger.warning("Failed to read %s, skipping", pdf_path)
            continue

        if is_index_document(text):
            continue

        doc_type = classify_document(text)
        if doc_type == "unknown":
            logger.warning("Unclassifiable PDF %s, skipping", pdf_path)
            continue

        unique_scno = extract_unique_scno(text, doc_type)
        if unique_scno is None:
            logger.warning("No unique_scno found in %s, skipping", pdf_path)
            continue

        groups.setdefault(unique_scno, {"details": [], "history": []})
        groups[unique_scno][doc_type].append(pdf_path)

    for unique_scno, files in groups.items():
        details_files = files["details"]
        history_files = files["history"]

        if len(details_files) > 1:
            logger.info("%s: %d duplicate details files, using %s", unique_scno, len(details_files), details_files[0].name)
        if len(history_files) > 1:
            logger.info("%s: %d duplicate history files, using %s", unique_scno, len(history_files), history_files[0].name)
        if not history_files:
            logger.info("%s: details-only (no history file) -- will be ingested as no_billing_history", unique_scno)

        yield LtPair(
            unique_scno=unique_scno,
            station_folder_name="pdfs",
            details_path=details_files[0] if details_files else None,
            history_path=history_files[0] if history_files else None,
        )


def discover_lt_pairs(lt_root: Path) -> Iterator[LtPair]:
    """Walks TS_LT_data/<Station>/, groups files by the body-extracted unique_scno (NOT by folder
    or filename -- folder names are not station keys; e.g. NLG/ holds two distinct "Narketpally"
    stations, and filenames can be inconsistent with the true identifier, e.g. a Details file named
    '1206 17041-...' can legitimately pair with a History file named '115019368-...' because both
    share the same body-extracted Unique SCNo)."""
    for station_dir in sorted(p for p in lt_root.iterdir() if p.is_dir()):
        groups: dict[str, dict[str, list[Path]]] = {}

        for pdf_path in sorted(station_dir.glob("*.pdf")):
            try:
                text = extract_full_text(pdf_path)
            except Exception:
                logger.warning("Failed to read %s, skipping", pdf_path)
                continue

            if is_index_document(text):
                continue

            doc_type = classify_document(text)
            if doc_type == "unknown":
                logger.warning("Unclassifiable PDF %s, skipping", pdf_path)
                continue

            unique_scno = extract_unique_scno(text, doc_type)
            if unique_scno is None:
                logger.warning("No unique_scno found in %s, skipping", pdf_path)
                continue

            groups.setdefault(unique_scno, {"details": [], "history": []})
            groups[unique_scno][doc_type].append(pdf_path)

        for unique_scno, files in groups.items():
            details_files = files["details"]
            history_files = files["history"]

            if len(details_files) > 1:
                logger.info(
                    "%s: %d duplicate details files, using %s",
                    unique_scno, len(details_files), details_files[0].name,
                )
            if len(history_files) > 1:
                logger.info(
                    "%s: %d duplicate history files, using %s",
                    unique_scno, len(history_files), history_files[0].name,
                )
            if not history_files:
                logger.info("%s: details-only (no history file) -- will be ingested as no_billing_history", unique_scno)

            yield LtPair(
                unique_scno=unique_scno,
                station_folder_name=station_dir.name,
                details_path=details_files[0] if details_files else None,
                history_path=history_files[0] if history_files else None,
            )
