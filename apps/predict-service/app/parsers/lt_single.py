"""Ported from the prior vega_v2 project's pipeline/parsers/lt_single.py, unchanged."""

from __future__ import annotations

from pathlib import Path

from app.parsers.common import (
    MonthlyBillRow,
    extract_all_table_rows,
    is_month_year,
    parse_float,
    parse_month_year,
    strip_padding,
)

# Real header (confirmed via pdfplumber.extract_tables on the Swathi fixture):
# ['Bill Date', 'Status', 'Closing Reading', 'Units in kWh', 'Demand (Rs.)',
#  'JE Debit (Rs.)', 'Collection (Rs.)', 'JE Credit (Rs.)', 'Arrears (Rs.)']
_EXPECTED_COLS = 9


def parse_lt_single(pdf_path: Path) -> list[MonthlyBillRow]:
    rows: list[MonthlyBillRow] = []
    for raw_row in extract_all_table_rows(pdf_path):
        row = strip_padding(raw_row)
        if len(row) != _EXPECTED_COLS or not is_month_year(row[0]):
            continue
        bill_month = parse_month_year(row[0])
        billed_kwh = parse_float(row[3])
        if billed_kwh is None:
            continue
        rows.append(
            MonthlyBillRow(
                bill_month=bill_month,
                billed_kwh=billed_kwh,
                status_code=str(row[1]).strip() if row[1] is not None else None,
                kwh_reading_closing=parse_float(row[2]),
                demand_rs=parse_float(row[4]),
                je_debit_rs=parse_float(row[5]),
                collection_rs=parse_float(row[6]),
                je_credit_rs=parse_float(row[7]),
                arrears_rs=parse_float(row[8]),
                source_pdf_filename=pdf_path.name,
            )
        )
    # De-dup by bill_month: the table sometimes repeats across page-table boundaries.
    by_month = {r.bill_month: r for r in rows}
    return sorted(by_month.values(), key=lambda r: r.bill_month)
