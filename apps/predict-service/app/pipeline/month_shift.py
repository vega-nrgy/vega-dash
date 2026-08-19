"""
Bill-date -> covered-usage-month heuristic.

Per the plan's flagged pitfall (reference repo research): bills are
generated a few days INTO the month after the usage they cover — e.g. a
bill dated 01-04 Aug typically covers July's consumption. Observed BILLDATE
values from the live /paybulkpayments endpoint (2026-08-11 dry run) were all
early-month (01-04 Aug), consistent with that pattern.

This is a heuristic, not a certainty (see plan §9) — it has not been cross-
validated against the LT History PDF's explicit per-month Bill Date column,
which would be the authoritative source once that ingestion path is built.
"""

import datetime

EARLY_MONTH_DAY_THRESHOLD = 10


def parse_api_date(value: str) -> datetime.date:
    """Parses the "DD-Mon-YY" format returned by the paybulkpayments API,
    e.g. "04-Aug-26" -> date(2026, 8, 4)."""
    return datetime.datetime.strptime(value, "%d-%b-%y").date()


def covered_month(bill_date: datetime.date) -> datetime.date:
    """First-of-month date of the usage period a bill likely covers."""
    if bill_date.day <= EARLY_MONTH_DAY_THRESHOLD:
        year, month = bill_date.year, bill_date.month - 1
        if month == 0:
            year, month = year - 1, 12
        return datetime.date(year, month, 1)
    return bill_date.replace(day=1)
