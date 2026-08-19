"""
Ported from the prior vega_v2 project's pipeline/parsers/common.py, unchanged.
Pure PDF-text parsing helpers/dataclasses -- no VDV-specific coupling.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterator, Literal

import pdfplumber

StationType = Literal["LT", "HT"]
GeoPrecision = Literal["exact", "pincode_centroid", "none"]
ParserName = Literal["lt_single", "lt_dual", "ht_wide", "lt_compact", "details_only"]

MONTH_ABBR_TO_NUM = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

_MONTH_YEAR_RE = re.compile(r"^[A-Za-z]{3}/\d{4}$")


def extract_full_text(pdf_path: Path) -> str:
    with pdfplumber.open(pdf_path) as pdf:
        return "\n".join(page.extract_text() or "" for page in pdf.pages)


def extract_all_table_rows(pdf_path: Path) -> Iterator[list[Any]]:
    """Yields every row from every table on every page, in document order.
    Real data rows are identified by their content pattern by the caller; this just flattens."""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                for row in table:
                    yield row


def strip_padding(row: list[Any]) -> list[Any]:
    """Drops leading/trailing None/empty-string cells. Some pages render table rows with extra
    blank columns prepended/appended depending on page layout; real data never starts or ends blank."""
    start = 0
    end = len(row)
    while start < end and (row[start] is None or str(row[start]).strip() == ""):
        start += 1
    while end > start and (row[end - 1] is None or str(row[end - 1]).strip() == ""):
        end -= 1
    return row[start:end]


def is_month_year(value: Any) -> bool:
    return isinstance(value, str) and bool(_MONTH_YEAR_RE.match(value.strip()))


def parse_month_year(value: str) -> date:
    """'Apr/2026' -> date(2026, 4, 1)"""
    dt = datetime.strptime(value.strip(), "%b/%Y")
    return date(dt.year, dt.month, 1)


def parse_float(value: Any) -> float | None:
    if value is None:
        return None
    s = str(value).strip().replace(",", "")
    if s == "":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_wrapped_day_month_year(fragment: str, year_hint: int | None = None) -> date | None:
    """Reassembles a line-wrapped bill date like '05-Apr-\\n26' or '01-\\nMAR-25' into a real date.
    This is the 'inline bill-date parse bug' fix: pdfplumber/the source PDF wraps the 2-digit year
    (or sometimes the month abbreviation) onto a second line within the same cell."""
    if not fragment:
        return None
    compact = re.sub(r"\s+", "", fragment.strip())  # '05-Apr-26' or '01-MAR-25'
    m = re.match(r"^(\d{2})-([A-Za-z]{3})-(\d{2})$", compact)
    if not m:
        return None
    day, mon_abbr, yy = m.groups()
    month = MONTH_ABBR_TO_NUM.get(mon_abbr.lower())
    if month is None:
        return None
    dt = datetime.strptime(f"{day}-{mon_abbr}-{yy}", "%d-%b-%y")
    return date(dt.year, dt.month, dt.day)


@dataclass
class MonthlyBillRow:
    bill_month: date  # normalized to the 1st of the month
    billed_kwh: float
    status_code: str | None = None
    recorded_kwh: float | None = None
    kwh_reading_closing: float | None = None
    kvah_units: float | None = None
    cmd_kva_billed: float | None = None
    demand_rs: float | None = None
    collection_rs: float | None = None
    je_credit_rs: float | None = None
    je_debit_rs: float | None = None
    arrears_rs: float | None = None
    tod_peak_kwh: float | None = None
    tod_offpeak_kwh: float | None = None
    tod_raw_kwh: float | None = None
    bill_date_precise: date | None = None
    source_pdf_filename: str = ""


@dataclass
class StationGeo:
    lat: float | None = None
    long: float | None = None
    geo_precision: GeoPrecision = "none"
    on_highway: bool | None = None
    highway_name: str | None = None


@dataclass
class StationRecord:
    unique_scno: str
    station_type: StationType
    raw_parser_used: ParserName
    service_number_raw: str | None = None
    source_folder: str | None = None
    consumer_name: str | None = None
    address_raw: str | None = None
    pincode: str | None = None
    district: str | None = None
    mandal: str | None = None
    category: str | None = None
    sub_category: str | None = None
    contracted_load_kva: float | None = None
    meter_side: str | None = None
    voltage_kv: float | None = None
    cmd_kva: float | None = None
    geo: StationGeo = field(default_factory=StationGeo)
    bills: list[MonthlyBillRow] = field(default_factory=list)
    is_valid_station: bool = False
    validity_reason: str = ""
