"""
Fallback parser for a third LT history layout, found 2026-08-17 in 17 files
across the assets/Data drop (all from what looks like the same "TECHNICAL
RRN" export tool -- e.g. TTL-113835518-2.pdf). Unlike the other two LT
formats, pdfplumber's table extraction doesn't split this document's billing
table into cells at all -- the whole multi-month table lands in a single
newline-separated text blob within one cell, so neither parse_lt_single nor
parse_lt_dual's row-shape checks ever match a row (both silently return zero
rows, no exception -- this is NOT caught by fmt detection or auto_parse_history
on its own).

Real observed lines (flattened, one bill-month per line):
    Jul/2026 99 9 / 3 38081 0 / 1 0.00 0.00 0.00 0.00 0.00
    Dec/2025 99 / IR 9 / 3 38038 34 / 1 476.00 332.00 0.00 1373.00 0.00
    Nov/2025 01 / IR 9 / 3 38002 46 / 1 565.00 0.00 0.00 0.00 565.00
Columns (per the document's own header row): Month/Year | Status | Cat/Phase |
Closing Reading | Units kWh / MF | Demand (Rs.) | JE Debit (Rs.) |
Collection (Rs.) | JE Credit (Rs.) | Arrears (Rs.).

Only ever observed MF=1 in this format's sample data -- billed_kwh is taken
as the raw units figure, unmultiplied (matches every sample seen; would need
revisiting if a real MF != 1 row ever turns up).

detect.py calls this ONLY as a fallback when the normally-selected parser
returns zero rows -- never as a primary format, since its own detection
signal (bare "Service Number ... Last Pay Date", no table markers at all)
would be too weak to trust up front.
"""

from __future__ import annotations

import re
from pathlib import Path

from app.parsers.common import MonthlyBillRow, extract_full_text, parse_float, parse_month_year

_ROW_RE = re.compile(
    r"([A-Za-z]{3}/\d{4})\s+"          # 1: Month/Year
    r"(\d{2}(?:\s*/\s*IR)?)\s+"        # 2: Status ("99" or "01 / IR")
    r"(\d+)\s*/\s*(\d+)\s+"            # 3,4: Cat / Phase
    r"(\d+)\s+"                        # 5: Closing Reading
    r"(\d+)\s*/\s*(\d+)\s+"            # 6,7: Units kWh / MF
    r"([\d.]+)\s+"                     # 8: Demand (Rs.)
    r"([\d.]+)\s+"                     # 9: JE Debit (Rs.)
    r"([\d.]+)\s+"                     # 10: Collection (Rs.)
    r"([\d.]+)\s+"                     # 11: JE Credit (Rs.)
    r"([\d.]+)"                        # 12: Arrears (Rs.)
)


def parse_lt_compact(pdf_path: Path) -> list[MonthlyBillRow]:
    text = extract_full_text(pdf_path)
    rows: list[MonthlyBillRow] = []

    for m in _ROW_RE.finditer(text):
        month_year, status, _cat, _phase, closing, units, _mf, demand, je_debit, collection, je_credit, arrears = m.groups()
        billed_kwh = parse_float(units)
        if billed_kwh is None:
            continue
        rows.append(
            MonthlyBillRow(
                bill_month=parse_month_year(month_year),
                billed_kwh=billed_kwh,
                status_code=re.sub(r"\s+", "", status),
                kwh_reading_closing=parse_float(closing),
                demand_rs=parse_float(demand),
                je_debit_rs=parse_float(je_debit),
                collection_rs=parse_float(collection),
                je_credit_rs=parse_float(je_credit),
                arrears_rs=parse_float(arrears),
                source_pdf_filename=pdf_path.name,
            )
        )

    by_month = {r.bill_month: r for r in rows}
    return sorted(by_month.values(), key=lambda r: r.bill_month)
