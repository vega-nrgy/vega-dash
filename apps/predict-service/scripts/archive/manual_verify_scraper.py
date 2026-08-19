"""
ARCHIVED — historical reference only. This was the one-off exploratory
script for the Phase 2 gate (see plan §8/§9 risk #1). Its finding is now
implemented as the real pipeline in app/scrapers/lt_scraper.py +
app/pipeline/lt_ingest.py (run via scripts/run_lt_ingest.py) — use that for
actual ingestion, not this script. Kept here only to document how the
/paybulkpayments decision was reached.

Original purpose: empirically check whether
POST https://tgsouthernpower.org/paybillonline actually returns real current
bill data for a given LT service number, per the user's explicit instruction,
before building the real scraper around it.

RESULT of the first dry run (2026-08-11, 5 LT stations): /paybillonline
itself only returns the static "Pay Bill Online" form page (~78KB HTML, no
populated bill fields) — confirmed by inspecting its own embedded jQuery,
which calls `POST https://tgsouthernpower.org/paybulkpayments` with
`{ukscno: <scno>}` client-side to actually populate the form. That endpoint
DOES return real current-month bill JSON (BILLAMT, UNITS, BILLDATE, DUEDATE,
CUSTOMERNAME, CUSTOMERADD, lat/lon, etc.) for all 5 stations tested. So:
/paybillonline is the page you'd load in a browser; /paybulkpayments is the
actual data endpoint it calls under the hood — not a "fallback", it's the
real mechanism. This script hits /paybulkpayments accordingly.

This is a DRY RUN ONLY:
  - No database writes (no station_audit / monthly_bills rows).
  - No payment action is taken — this is a bill lookup used to populate the
    payment form before checkout, not a checkout submission.
  - Read-only inspection of the raw HTTP response per station.

Usage (archived, run from repo root if needed):
    python apps/predict-service/scripts/archive/manual_verify_scraper.py
    python apps/predict-service/scripts/manual_verify_scraper.py 114229478 114412708 ...
"""

import json
import sys
import time

import requests

PAYBULKPAYMENTS_URL = "https://tgsouthernpower.org/paybulkpayments"
REQUEST_DELAY_S = 1.5  # be a good citizen against a live utility site
TIMEOUT_S = 15

DEFAULT_SCNOS = [
    "114229478",  # known LT sample — have Details/History PDF fixtures
    "114412708",  # known LT sample — have Details/History PDF fixtures
    "114997824",
    "115129703",
    "114449572",
]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    ),
    "X-Requested-With": "XMLHttpRequest",
    "Referer": "https://tgsouthernpower.org/paybillonline",
}


def classify(resp: requests.Response) -> str:
    try:
        data = resp.json()
    except ValueError:
        return f"non-JSON response ({len(resp.text)} chars) — unexpected, inspect manually"
    if data.get("ERROR") == "Y" or not data.get("BILLAMT"):
        return f"no bill data returned: {data}"
    return f"OK - {data.get('CUSTOMERNAME')}, {data['UNITS']} kWh, Rs.{data['BILLAMT']}, due {data.get('DUEDATE')}"


def main() -> None:
    scnos = sys.argv[1:] if len(sys.argv) > 1 else DEFAULT_SCNOS
    print(f"Dry run: {len(scnos)} station(s) against {PAYBULKPAYMENTS_URL}")
    print("(No DB writes. No payment action. Read-only bill lookup only.)\n")

    session = requests.Session()
    results = []

    for i, scno in enumerate(scnos):
        if i > 0:
            time.sleep(REQUEST_DELAY_S)

        print(f"--- {scno} ---")
        try:
            resp = session.post(
                PAYBULKPAYMENTS_URL,
                data={"ukscno": scno},
                headers=HEADERS,
                timeout=TIMEOUT_S,
            )
        except requests.RequestException as exc:
            print(f"  REQUEST FAILED: {exc}")
            results.append({"scno": scno, "error": str(exc)})
            continue

        verdict = classify(resp)
        print(f"  status: {resp.status_code}")
        print(f"  verdict: {verdict}\n")

        try:
            bill = resp.json()
        except ValueError:
            bill = None
        results.append({"scno": scno, "status": resp.status_code, "bill": bill})

    print("=== Summary ===")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
