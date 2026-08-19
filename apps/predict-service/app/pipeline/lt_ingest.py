"""
LT ingestion orchestrator: scrape -> normalize -> upsert monthly_bills,
write station_audit, log ingestion_batches. See plan §6/§8 Phase 2.

Only targets stations whose unique_scno is purely numeric (the LT `ukscno`
format) — alphanumeric HT-style IDs (e.g. SPT1326, BJH2143) are a
structurally different system and out of scope for this scraper.
"""

import time
import uuid

from psycopg.types.json import Jsonb

from app.db import get_connection
from app.pipeline.month_shift import covered_month, parse_api_date
from app.scrapers.base import RateLimiter, new_session
from app.scrapers.lt_scraper import LtBillResult, scrape_lt_bill

MIN_REQUEST_INTERVAL_S = 1.5
PARSER_NAME = "lt_scraper_v1"


def _eligible_scnos(conn, limit: int | None) -> list[str]:
    with conn.cursor() as cur:
        query = "select unique_scno from stations where unique_scno ~ '^[0-9]+$' order by unique_scno"
        if limit:
            query += f" limit {int(limit)}"
        cur.execute(query)
        return [row[0] for row in cur.fetchall()]


def _upsert_bill(conn, scno: str, result: LtBillResult) -> None:
    bill_date = parse_api_date(result.bill_date) if result.bill_date else None
    bill_month = covered_month(bill_date) if bill_date else None
    if bill_month is None:
        return

    # This endpoint gives BILLAMT (current bill) and TOTAMT (bill + arrears);
    # store TOTAMT as total_amount_rs (the actual amount payable) — BILLAMT
    # isn't dropped, it's preserved verbatim in `raw`. demand_amount_rs and
    # billed_demand_kva are for HT-style detailed bills and not available
    # from this live-lookup endpoint, so they stay null here.
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into monthly_bills (
                station_id, bill_month, units_kwh,
                total_amount_rs, arrears_rs, bill_date, source, raw
            ) values (%s, %s, %s, %s, %s, %s, 'scrape_paybulkpayments', %s)
            on conflict (station_id, bill_month) do update set
                units_kwh = excluded.units_kwh,
                total_amount_rs = excluded.total_amount_rs,
                arrears_rs = excluded.arrears_rs,
                bill_date = excluded.bill_date,
                source = excluded.source,
                raw = excluded.raw,
                ingested_at = now()
            """,
            (
                scno,
                bill_month,
                result.units_kwh,
                result.total_amount_rs,
                result.arrears_rs,
                bill_date,
                _to_jsonb(result.raw),
            ),
        )
        cur.execute(
            """
            update stations
            set station_type = 'LT', updated_at = now()
            where unique_scno = %s and station_type = 'UNKNOWN'
            """,
            (scno,),
        )


def _to_jsonb(d: dict | None):
    return Jsonb(d) if d is not None else None


def _write_audit(conn, scno: str, batch_id: str, result: LtBillResult) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into station_audit (
                station_id, is_valid, validity_reason, parser_used,
                scrape_ts, ingestion_batch_id, raw_extract
            ) values (%s, %s, %s, %s, now(), %s, %s)
            """,
            (
                scno,
                result.found,
                None if result.found else result.error,
                PARSER_NAME,
                batch_id,
                _to_jsonb(result.raw),
            ),
        )


def run(limit: int | None = None, dry_run: bool = False, progress_every: int = 25) -> dict:
    conn = get_connection()
    conn.autocommit = False

    batch_id = str(uuid.uuid4())
    if not dry_run:
        with conn.cursor() as cur:
            cur.execute(
                "insert into ingestion_batches (id, status) values (%s, 'running')",
                (batch_id,),
            )
        conn.commit()

    scnos = _eligible_scnos(conn, limit)
    print(f"Ingesting {len(scnos)} LT station(s) (dry_run={dry_run}, batch={batch_id})")

    session = new_session()
    limiter = RateLimiter(MIN_REQUEST_INTERVAL_S)

    found = 0
    errors = 0
    started_at = time.monotonic()

    for i, scno in enumerate(scnos):
        limiter.wait()
        result = scrape_lt_bill(session, scno)

        if result.found:
            found += 1
            if not dry_run:
                _upsert_bill(conn, scno, result)
                _write_audit(conn, scno, batch_id, result)
                conn.commit()
        else:
            errors += 1
            if not dry_run:
                _write_audit(conn, scno, batch_id, result)
                conn.commit()

        if (i + 1) % progress_every == 0 or (i + 1) == len(scnos):
            elapsed = time.monotonic() - started_at
            print(
                f"  [{i + 1}/{len(scnos)}] found={found} errors={errors} "
                f"elapsed={elapsed:.0f}s"
            )

    if not dry_run:
        with conn.cursor() as cur:
            cur.execute(
                """
                update ingestion_batches
                set finished_at = now(), status = 'completed',
                    stations_processed = %s, errors_count = %s
                where id = %s
                """,
                (found, errors, batch_id),
            )
        conn.commit()

    conn.close()

    summary = {
        "batch_id": batch_id,
        "total": len(scnos),
        "found": found,
        "errors": errors,
        "elapsed_s": round(time.monotonic() - started_at, 1),
    }
    print(f"Done: {summary}")
    return summary
