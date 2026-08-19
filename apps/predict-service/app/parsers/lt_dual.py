"""Ported from the prior vega_v2 project's pipeline/parsers/lt_dual.py, unchanged."""

from __future__ import annotations

from pathlib import Path

from app.parsers.common import (
    MonthlyBillRow,
    extract_all_table_rows,
    is_month_year,
    parse_float,
    parse_month_year,
    parse_wrapped_day_month_year,
    strip_padding,
)

# Real header (confirmed via pdfplumber.extract_tables on the Narketpally fixture). Each month
# occupies TWO physical rows:
#   IR row (11 cols): Month/Year, Status('01 / IR'|'01'|'00'), Cat('9'), KWH Reading, KWH Units,
#                      Demand(Rs), JE Debit(Rs), Collection(Rs), JE Credit(Rs), Arrears(Rs), Fixed Charges
#   9N LT row (11):    CMD(KVA), '9N', 'LT', KVAH Reading, KVAH Units, Billed Units, RMD(KVA),
#                       Comp Load, Bill MD, PF, Bill Date (line-wrapped, e.g. '05-Apr-\n26')
_ROW_LEN = 11


def _is_ir_row(row: list) -> bool:
    return len(row) == _ROW_LEN and is_month_year(row[0]) and str(row[2]).strip() == "9"


def _is_lt_row(row: list) -> bool:
    return len(row) == _ROW_LEN and str(row[1]).strip() == "9N" and str(row[2]).strip() == "LT"


def parse_lt_dual(pdf_path: Path) -> list[MonthlyBillRow]:
    stripped_rows = [strip_padding(r) for r in extract_all_table_rows(pdf_path)]

    rows: list[MonthlyBillRow] = []
    i = 0
    while i < len(stripped_rows):
        row = stripped_rows[i]
        if not _is_ir_row(row):
            i += 1
            continue

        bill_month = parse_month_year(row[0])
        billed_kwh = parse_float(row[4])  # KWH Units on the IR row = the EV consumption value
        if billed_kwh is None:
            i += 1
            continue

        bill_date_precise = None
        kvah_units = None
        cmd_kva_billed = None
        if i + 1 < len(stripped_rows) and _is_lt_row(stripped_rows[i + 1]):
            lt_row = stripped_rows[i + 1]
            bill_date_precise = parse_wrapped_day_month_year(str(lt_row[10]) if lt_row[10] else "")
            kvah_units = parse_float(lt_row[4])
            cmd_kva_billed = parse_float(lt_row[6])  # RMD(KVA)
            i += 2
        else:
            i += 1

        rows.append(
            MonthlyBillRow(
                bill_month=bill_month,
                billed_kwh=billed_kwh,
                status_code=str(row[1]).strip() if row[1] is not None else None,
                kwh_reading_closing=parse_float(row[3]),
                kvah_units=kvah_units,
                cmd_kva_billed=cmd_kva_billed,
                demand_rs=parse_float(row[5]),
                je_debit_rs=parse_float(row[6]),
                collection_rs=parse_float(row[7]),
                je_credit_rs=parse_float(row[8]),
                arrears_rs=parse_float(row[9]),
                bill_date_precise=bill_date_precise,
                source_pdf_filename=pdf_path.name,
            )
        )

    by_month = {r.bill_month: r for r in rows}
    return sorted(by_month.values(), key=lambda r: r.bill_month)
