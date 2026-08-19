"""
LT (low-tension) bill scraper for TGSPDCL/TGNPDCL.

Confirmed 2026-08-11 (see scripts/archive/manual_verify_scraper.py): the
`/paybillonline` page a browser loads only returns a static form shell — the
real bill lookup happens client-side via `POST /paybulkpayments {ukscno}`,
which returns JSON. That's the endpoint this module targets directly.
"""

from dataclasses import dataclass

import requests

PAYBULKPAYMENTS_URL = "https://tgsouthernpower.org/paybulkpayments"

HEADERS = {
    "X-Requested-With": "XMLHttpRequest",
    "Referer": "https://tgsouthernpower.org/paybillonline",
}


@dataclass
class LtBillResult:
    scno: str
    found: bool
    customer_name: str | None = None
    customer_address: str | None = None
    service_no: str | None = None
    units_kwh: float | None = None
    bill_amount_rs: float | None = None
    arrears_rs: float | None = None
    total_amount_rs: float | None = None
    bill_date: str | None = None  # "DD-Mon-YY" as returned by the API
    due_date: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    raw: dict | None = None
    error: str | None = None


def scrape_lt_bill(session: requests.Session, scno: str, timeout_s: float = 15) -> LtBillResult:
    try:
        resp = session.post(
            PAYBULKPAYMENTS_URL,
            data={"ukscno": scno},
            headers=HEADERS,
            timeout=timeout_s,
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        return LtBillResult(scno=scno, found=False, error=f"request failed: {exc}")

    try:
        data = resp.json()
    except ValueError:
        return LtBillResult(scno=scno, found=False, error="non-JSON response")

    if data.get("ERROR") == "Y" or not data.get("BILLAMT"):
        return LtBillResult(scno=scno, found=False, error=f"no bill data: {data}", raw=data)

    def to_float(key: str) -> float | None:
        val = data.get(key)
        try:
            return float(val) if val not in (None, "") else None
        except ValueError:
            return None

    return LtBillResult(
        scno=scno,
        found=True,
        customer_name=data.get("CUSTOMERNAME"),
        customer_address=data.get("CUSTOMERADD"),
        service_no=data.get("SERVICENO"),
        units_kwh=to_float("UNITS"),
        bill_amount_rs=to_float("BILLAMT"),
        arrears_rs=to_float("ARRAMT"),
        total_amount_rs=to_float("TOTAMT"),
        bill_date=data.get("BILLDATE"),
        due_date=data.get("DUEDATE"),
        latitude=to_float("LATITUDE"),
        longitude=to_float("LONGITUDE"),
        raw=data,
    )
