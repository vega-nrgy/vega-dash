"""
LT bill scraper for TGNPDCL (the Northern discom -- distinct from TGSPDCL's
paybulkpayments flow in app/scrapers/lt_scraper.py).

Confirmed 2026-08-13:
  1. GET https://tgnpdcl.com/Consumer/DuplicateBillValidate first -- this
     returns 500 on its own (it's a redirect/wrapper page, not meant to be
     browsed directly), but still sets a valid session cookie (JSESSIONID)
     and CSRF token (XSRF-TOKEN cookie, mirrored into a hidden `_csrf` form
     field) that the POST below needs.
  2. POST the same URL with {uscno, getBill: "Get Bill", _csrf: <token>} --
     returns a full HTML page with the bill embedded as server-rendered
     tables (not JSON, unlike TGSPDCL's LT endpoint).
  3. An unrecognized uscno returns the same page shell with no "USC No."
     bill section at all -- that absence is the not-found signal.

tgnpdcl.com's TLS handshake also fails against modern OpenSSL's default
security level -- needs SECLEVEL=1 relaxation, see LegacyTLSAdapter.

Unlike TGSPDCL's bill (BILLDATE + explicit UNITS), this bill doesn't print
its own covered month -- "Dt:" is the bill-cum-notice generation date, and
"KWH Units" is the meter-reading delta between the previous and present
reading dates (a ~30 day window, not a calendar month). Covered month is
derived from "Dt:" via the same covered_month() heuristic used for the
TGSPDCL LT scrape (app/pipeline/month_shift.py).
"""

import re
import ssl
from dataclasses import dataclass

import requests
from requests.adapters import HTTPAdapter

BASE_URL = "https://tgnpdcl.com/Consumer/DuplicateBillValidate"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    ),
}


class LegacyTLSAdapter(HTTPAdapter):
    """tgnpdcl.com's server fails modern OpenSSL's default handshake -- relax to
    SECLEVEL=1 and allow legacy renegotiation, the standard fix for these hosts."""

    def init_poolmanager(self, *args, **kwargs):
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.check_hostname = True
        ctx.verify_mode = ssl.CERT_REQUIRED
        try:
            ctx.set_ciphers("DEFAULT@SECLEVEL=1")
        except ssl.SSLError:
            pass
        ctx.options |= 0x4  # OP_LEGACY_SERVER_CONNECT
        kwargs["ssl_context"] = ctx
        return super().init_poolmanager(*args, **kwargs)


def new_tgnpdcl_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(HEADERS)
    session.mount("https://", LegacyTLSAdapter())
    return session


def _label_value(html: str, label: str) -> str | None:
    """Handles this portal's varied table markup: label cell may have leading
    whitespace or be wrapped in <b>; the value cell may follow immediately or
    after one-or-more empty <td></td> spacer cells (the charge-summary rows use
    two); label/value cells are a mix of <td> and <th>."""
    pattern = (
        r"<t[dh][^>]*>\s*(?:<b>)?\s*" + re.escape(label) + r"\s*(?:</b>)?\s*</t[dh]>"
        r"(?:\s*<td[^>]*></td>)*"
        r"\s*<t[dh][^>]*>\s*(?:<b>)?\s*([^<]*?)\s*(?:</b>)?\s*</t[dh]>"
    )
    m = re.search(pattern, html)
    return m.group(1).strip() if m else None


def _to_float(s: str | None) -> float | None:
    if not s:
        return None
    s = s.strip().replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


@dataclass
class TgnpdclLtBillResult:
    scno: str
    found: bool
    consumer_name: str | None = None
    category: str | None = None
    units_kwh: float | None = None
    bill_amount_rs: float | None = None
    total_due_rs: float | None = None
    bill_date: str | None = None  # "DD/MM/YYYY", the bill-cum-notice "Dt:"
    due_date: str | None = None
    error: str | None = None


def scrape_tgnpdcl_lt_bill(session: requests.Session, scno: str, timeout_s: float = 15) -> TgnpdclLtBillResult:
    try:
        session.get(BASE_URL, timeout=timeout_s)
        csrf = session.cookies.get("XSRF-TOKEN")
        resp = session.post(
            BASE_URL,
            data={"uscno": scno, "getBill": "Get Bill", "_csrf": csrf},
            headers={
                "X-Requested-With": "XMLHttpRequest",
                "Referer": BASE_URL,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            timeout=timeout_s,
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        return TgnpdclLtBillResult(scno=scno, found=False, error=f"request failed: {exc}")

    html = resp.text
    usc_no = _label_value(html, "USC No.")
    if not usc_no:
        return TgnpdclLtBillResult(scno=scno, found=False, error="no bill found (unrecognized uscno)")

    return TgnpdclLtBillResult(
        scno=scno,
        found=True,
        consumer_name=_label_value(html, "Name:"),
        category=_label_value(html, "Cat:"),
        units_kwh=_to_float(_label_value(html, "KWH Units")),
        bill_amount_rs=_to_float(_label_value(html, "Bill Amount")),
        total_due_rs=_to_float(_label_value(html, "Total Due")),
        bill_date=_label_value(html, "Dt:"),
        due_date=_label_value(html, "Due Date"),
    )
