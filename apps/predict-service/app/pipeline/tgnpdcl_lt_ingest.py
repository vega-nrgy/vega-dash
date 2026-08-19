"""
TGNPDCL LT ingestion orchestrator: scrape -> normalize -> upsert monthly_bills,
write station_audit, log ingestion_batches. See app/scrapers/tgnpdcl_lt_scraper.py.

Only targets station_type='LT' and discom='TGNPDCL' -- the TGSPDCL-discom LT
stations already go through app/pipeline/lt_ingest.py against a different site.
"""

import time
import uuid
from datetime import datetime

from psycopg.types.json import Jsonb

from app.db import get_connection
from app.pipeline.month_shift import covered_month
from app.scrapers.base import RateLimiter
from app.scrapers.tgnpdcl_lt_scraper import TgnpdclLtBillResult, new_tgnpdcl_session, scrape_tgnpdcl_lt_bill

MIN_REQUEST_INTERVAL_S = 1.5
PARSER_NAME = "tgnpdcl_lt_scraper_v1"


def _eligible_scnos(conn, limit: int | None) -> list[str]:
    with conn.cursor() as cur:
        query = "select unique_scno from stations where station_type = 'LT' and discom = 'TGNPDCL' order by unique_scno"
        if limit:
            query += f" limit {int(limit)}"
        cur.execute(query)
        return [row[0] for row in cur.fetchall()]


def _parse_bill_date(value: str | None):
    if not value:
        return None
    try:
        return datetime.strptime(value, "%d/%m/%Y").date()
    except ValueError:
        return None


def _upsert_bill(conn, scno: str, result: TgnpdclLtBillResult) -> bool:
    bill_date = _parse_bill_date(result.bill_date)
    if bill_date is None:
        return False
    bill_month = covered_month(bill_date)

    arrears_rs = None
    if result.total_due_rs is not None and result.bill_amount_rs is not None:
        arrears_rs = round(result.total_due_rs - result.bill_amount_rs, 2)

    with conn.cursor() as cur:
        cur.execute(
            """
            insert into monthly_bills (
                station_id, bill_month, units_kwh,
                arrears_rs, total_amount_rs, bill_date, source, raw
            ) values (%s, %s, %s, %s, %s, %s, 'scrape_tgnpdcl_lt', %s)
            on conflict (station_id, bill_month) do update set
                units_kwh = excluded.units_kwh,
                arrears_rs = excluded.arrears_rs,
                total_amount_rs = excluded.total_amount_rs,
                bill_date = excluded.bill_date,
                source = excluded.source,
                raw = excluded.raw,
                ingested_at = now()
            """,
            (
                scno,
                bill_month,
                result.units_kwh,
                arrears_rs,
                result.total_due_rs,
                bill_date,
                Jsonb(
                    {
                        "consumer_name": result.consumer_name,
                        "category": result.category,
                        "bill_amount_rs": result.bill_amount_rs,
                        "bill_date_raw": result.bill_date,
                        "due_date": result.due_date,
                    }
                ),
            ),
        )
    return True


def _write_audit(conn, scno: str, batch_id: str, result: TgnpdclLtBillResult) -> None:
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
                Jsonb({"bill_date": result.bill_date}) if result.found else None,
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
    print(f"Ingesting {len(scnos)} TGNPDCL LT station(s) (dry_run={dry_run}, batch={batch_id})")

    session = new_tgnpdcl_session()
    limiter = RateLimiter(MIN_REQUEST_INTERVAL_S)

    found = 0
    errors = 0
    started_at = time.monotonic()

    for i, scno in enumerate(scnos):
        limiter.wait()
        result = scrape_tgnpdcl_lt_bill(session, scno)

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
