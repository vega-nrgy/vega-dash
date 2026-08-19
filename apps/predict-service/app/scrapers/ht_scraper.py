"""
HT (high-tension) bill scraper for TGSPDCL.

Confirmed 2026-08-13: unlike the LT flow, this is a plain GET with no session/
CSRF needed at all --
GET https://webportal.tgsouthernpower.org/HTBilling/MeterDetails/HTBillSet_BillViewGen.jsp?htscno=<scno>
returns a fully server-rendered HTML bill page (not JSON) for that station's
current HT bill, with the covered month printed explicitly on the bill itself
("...for the Month of July 2026...") -- no covered_month() heuristic needed,
unlike the LT live scrape.

TGNPDCL HT is NOT implemented here -- see scripts/archive/ for the investigation.
The TGNPDCL portal (http://210.212.223.83:9000/EBS/HTBillingMeter/...) consistently
returns a server-side "NULL values" error for every TGNPDCL-HT unique_scno currently
in `stations` (tried as-is and with the embedded space stripped); those stored
scnos look like an old-format "SC No." rather than the "USC No." the live TGSPDCL
HT bill showed as a *separate* field from SC No. -- needs a confirmed-correct
USC No. for at least one TGNPDCL HT station before this can be built.
"""

import re
from dataclasses import dataclass

import requests

HT_BILL_URL = "https://webportal.tgsouthernpower.org/HTBilling/MeterDetails/HTBillSet_BillViewGen.jsp"

_MONTH_RE = re.compile(r"for the Month of\s*(?:&nbsp;)*\s*([A-Za-z]+\s+\d{4})")
# Not in the LABEL</td><td>VALUE</td> table structure _label_value expects -- this one's
# inline text inside a <div><FONT> block: "PAYABLE ON OR BEFORE Dated : &nbsp;&nbsp;15-Aug-26".
_DUE_DATE_RE = re.compile(r"PAYABLE ON OR BEFORE Dated\s*:\s*(?:&nbsp;)*\s*(\d{2}-[A-Za-z]{3}-\d{2})")
# Same inline-text pattern, for the bill's own issue date: "...Date: 01-Aug-26</B>".
_BILL_DATE_RE = re.compile(r"Date:\s*(\d{2}-[A-Za-z]{3}-\d{2})")


def _label_value(html: str, label: str) -> str | None:
    m = re.search(re.escape(label) + r"</td>\s*<td[^>]*>([^<]*)</td>", html)
    return m.group(1).strip() if m else None


def _label_row_values(html: str, label: str, n: int) -> list[str | None]:
    """Some rows (the KWH/KVAH/KVA/TOD1/TOD2 consumption table) have n value
    cells after the label cell, not just one."""
    pattern = re.escape(label) + r"</td>" + r"\s*<td[^>]*>([^<]*)</td>" * n
    m = re.search(pattern, html)
    if not m:
        return [None] * n
    return [g.strip() for g in m.groups()]


def _to_float(s: str | None) -> float | None:
    if not s:
        return None
    s = s.strip().replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


@dataclass
class HtBillResult:
    scno: str
    found: bool
    consumer_name: str | None = None
    category: str | None = None
    contracted_md_kva: float | None = None
    bill_month_label: str | None = None  # e.g. "July 2026", printed directly on the bill
    bill_date: str | None = None  # "DD-Mon-YY", the bill's own issue date
    total_consumption_kwh: float | None = None
    total_consumption_kvah: float | None = None
    total_consumption_kva: float | None = None
    net_bill_amount_rs: float | None = None
    total_arrears_rs: float | None = None
    total_amount_payable_rs: float | None = None
    due_date: str | None = None
    raw_html: str | None = None
    error: str | None = None


def scrape_ht_bill(session: requests.Session, scno: str, timeout_s: float = 15) -> HtBillResult:
    try:
        resp = session.get(HT_BILL_URL, params={"htscno": scno}, timeout=timeout_s)
        resp.raise_for_status()
    except requests.RequestException as exc:
        return HtBillResult(scno=scno, found=False, error=f"request failed: {exc}")

    html = resp.text
    month_m = _MONTH_RE.search(html)
    consumer_number = _label_value(html, "Consumer Number")

    # A page for an unknown/invalid htscno doesn't echo the scno back and has no bill table.
    if not month_m or not consumer_number:
        return HtBillResult(scno=scno, found=False, error="no bill found (unrecognized htscno)")

    kwh, kvah, kva, _tod1, _tod2 = _label_row_values(html, "Total Consumption", 5)

    return HtBillResult(
        scno=scno,
        found=True,
        consumer_name=_label_value(html, "Name"),
        category=_label_value(html, "Category"),
        contracted_md_kva=_to_float(_label_value(html, "Contracted MD (KVA/HP)")),
        bill_month_label=month_m.group(1).strip(),
        bill_date=(lambda m: m.group(1) if m else None)(_BILL_DATE_RE.search(html)),
        total_consumption_kwh=_to_float(kwh),
        total_consumption_kvah=_to_float(kvah),
        total_consumption_kva=_to_float(kva),
        net_bill_amount_rs=_to_float(_label_value(html, "Net Bill Amount")),
        total_arrears_rs=_to_float(_label_value(html, "Total Arrears")),
        total_amount_payable_rs=_to_float(_label_value(html, "Total Amount Payable")),
        due_date=(lambda m: m.group(1) if m else None)(_DUE_DATE_RE.search(html)),
        raw_html=None,  # not stored by default -- caller can capture resp.text if needed
    )
