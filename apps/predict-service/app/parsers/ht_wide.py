"""Ported from the prior vega_v2 project's pipeline/parsers/ht_wide.py, unchanged."""

from __future__ import annotations

from datetime import date, datetime
from pathlib import Path

from app.parsers.common import MonthlyBillRow, extract_all_table_rows, parse_float, strip_padding

# Real header (confirmed via pdfplumber.extract_tables on SPT1307, 17 cols, identical across pages):
#   0 SL.NO | 1 BILL_MONTH (wrapped, ignored) | 2 PRST_RDG_DT | 3 PRST_STATUS
#   4 READINGS.KWH | 5 READINGS.KVAH | 6 READINGS.KVA | 7 READINGS.TOD
#   8 MF
#   9 RECORDED.KWH  <- this is the spec's "value immediately after MF" = our billed_kwh
#   10 RECORDED.KVAH | 11 RECORDED.KVA | 12 RECORDED.TOD
#   13 BILLED.KVAH | 14 BILLED.KVA | 15 BILLED.TOD
#   16 DEMAND (bill amount Rs, not mapped to a MonthlyBillRow field this pass)
# There is no separate literal "BILLED.KWH" column in the real bill -- RECORDED.KWH is the only
# kWh-flavored monthly figure, and it is what the spec means by "BILLED KWH". We mirror it into both
# billed_kwh (canonical, NOT NULL) and recorded_kwh (audit) since the data genuinely offers only one value.
_ROW_LEN = 17


def _is_data_row(row: list) -> bool:
    return len(row) == _ROW_LEN and str(row[0]).strip().isdigit()


def parse_ht_wide(pdf_path: Path) -> list[MonthlyBillRow]:
    rows: list[MonthlyBillRow] = []
    for raw_row in extract_all_table_rows(pdf_path):
        row = strip_padding(raw_row)
        if not _is_data_row(row):
            continue

        rdg_date = _parse_rdg_date(row[2])
        if rdg_date is None:
            continue
        billed_kwh = parse_float(row[9])
        if billed_kwh is None:
            continue

        rows.append(
            MonthlyBillRow(
                bill_month=date(rdg_date.year, rdg_date.month, 1),
                billed_kwh=billed_kwh,
                status_code=str(row[3]).strip() if row[3] is not None else None,
                recorded_kwh=billed_kwh,
                kvah_units=parse_float(row[13]),
                cmd_kva_billed=parse_float(row[14]),
                tod_raw_kwh=parse_float(row[15]),
                bill_date_precise=rdg_date,
                source_pdf_filename=pdf_path.name,
            )
        )

    by_month = {r.bill_month: r for r in rows}
    return sorted(by_month.values(), key=lambda r: r.bill_month)


def _parse_rdg_date(value) -> date | None:
    if not value:
        return None
    try:
        dt = datetime.strptime(str(value).strip(), "%d-%b-%Y")
        return date(dt.year, dt.month, dt.day)
    except ValueError:
        return None
