"""Ported from the prior vega_v2 project's pipeline/parsers/details.py, unchanged.

Only parse_ht_body_metadata is actually consumed by app/pipeline/pdf_ingest.py right now
(HT has no separate Details file -- Service No./identity comes from the History PDF's own
body table). parse_lt_details is kept for parity/future use (LT station metadata enrichment
is not in scope for the current bill-history ingestion pass).
"""

from __future__ import annotations

import re
from pathlib import Path

import pdfplumber

from app.parsers.common import extract_full_text

_LT_PATTERNS = {
    "unique_scno": r"Pre-Paid Unique SCNo\s+([\d\s]+?)\s+Category",
    "service_number_raw": r"Service Number\s+([\d\s]+?)\s+Sub Division",
    "consumer_name": r"Consumer Name\s+(.+?)\s+Area Code",
    "contracted_load_kva": r"Contracted Load\s+([\d.]+)",
    "pincode": r"Pin Code\s+(\d{6})",
    "meter_side": r"Meterside\s+(\S+)",
}
_LT_CATEGORY_RE = re.compile(r"Category/SubCat\s+(\d+)\s*/\s*(\d+)")
_LT_ADDRESS_RE = re.compile(r"Address\s+(.+?)\s+Group\s*/\s*Cycle")


def parse_lt_details(pdf_path: Path) -> dict:
    """Extracts station identity/metadata from an LT Consumer-Details PDF body text.
    Geo (the maps hyperlink) is handled separately by pipeline.geo.lt_geo in the old project."""
    text = extract_full_text(pdf_path)
    result: dict = {}

    for key, pattern in _LT_PATTERNS.items():
        m = re.search(pattern, text)
        if not m:
            result[key] = None
            continue
        value = m.group(1).strip()
        if key in ("unique_scno", "service_number_raw"):
            result[key] = re.sub(r"\s+", "", value) if key == "unique_scno" else value
        elif key == "contracted_load_kva":
            result[key] = float(value)
        else:
            result[key] = value

    cat_match = _LT_CATEGORY_RE.search(text)
    result["category"] = cat_match.group(1) if cat_match else None
    result["sub_category"] = cat_match.group(2) if cat_match else None

    addr_match = _LT_ADDRESS_RE.search(text)
    result["address_raw"] = addr_match.group(1).strip() if addr_match else None

    return result


def parse_ht_body_metadata(pdf_path: Path) -> dict:
    """Extracts station identity/metadata for HT stations, which have no separate Details file --
    everything comes from the 'Consumer Details' label/value mini-table embedded in the history PDF."""
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[0]
        tables = page.extract_tables()

    fields: dict[str, str] = {}
    for table in tables:
        for row in table:
            for i in range(0, len(row) - 1, 2):
                label, value = row[i], row[i + 1]
                if label and value is not None:
                    fields[str(label).strip()] = str(value).strip()

    service_no = fields.get("Service No.")
    address_raw = fields.get("Address", "").replace("\n", " ")

    return {
        "unique_scno": service_no,
        "service_number_raw": service_no,
        "consumer_name": (fields.get("Consumer Name") or "").replace("\n", " ") or None,
        "address_raw": address_raw or None,
        "district": fields.get("Division"),
        "category": fields.get("Category"),
        "sub_category": None,
        "cmd_kva": float(fields["CMD"]) if fields.get("CMD") and fields["CMD"] != "null" else None,
        "voltage_kv": float(fields["Voltage"]) if fields.get("Voltage") and fields["Voltage"] != "null" else None,
    }
