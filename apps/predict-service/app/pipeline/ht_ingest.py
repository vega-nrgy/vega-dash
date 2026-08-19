"""
HT ingestion orchestrator: scrape -> normalize -> upsert monthly_bills, write
station_audit, log ingestion_batches. See app/scrapers/ht_scraper.py.

Only targets station_type='HT' and discom='TGSPDCL' -- the TGNPDCL HT portal
isn't wired up yet (see ht_scraper.py's module docstring for why).
"""

import time
import uuid
from datetime import datetime

from psycopg.types.json import Jsonb

from app.db import get_connection
from app.scrapers.base import RateLimiter, new_session
from app.scrapers.ht_scraper import HtBillResult, scrape_ht_bill

MIN_REQUEST_INTERVAL_S = 1.5
PARSER_NAME = "ht_scraper_v1"


def _eligible_scnos(conn, limit: int | None) -> list[str]:
    with conn.cursor() as cur:
        query = "select unique_scno from stations where station_type = 'HT' and discom = 'TGSPDCL' order by unique_scno"
        if limit:
            query += f" limit {int(limit)}"
        cur.execute(query)
        return [row[0] for row in cur.fetchall()]


def _parse_bill_month(label: str | None):
    if not label:
        return None
    try:
        dt = datetime.strptime(label, "%B %Y")
    except ValueError:
        return None
    return dt.date().replace(day=1)


def _upsert_bill(conn, scno: str, result: HtBillResult) -> bool:
    bill_month = _parse_bill_month(result.bill_month_label)
    if bill_month is None:
        return False

    bill_date = None
    if result.bill_date:
        try:
            bill_date = datetime.strptime(result.bill_date, "%d-%b-%y").date()
        except ValueError:
            bill_date = None

    with conn.cursor() as cur:
        cur.execute(
            """
            insert into monthly_bills (
                station_id, bill_month, units_kwh, billed_demand_kva,
                arrears_rs, total_amount_rs, bill_date, source, raw
            ) values (%s, %s, %s, %s, %s, %s, %s, 'scrape_ht_tgspdcl', %s)
            on conflict (station_id, bill_month) do update set
                units_kwh = excluded.units_kwh,
                billed_demand_kva = excluded.billed_demand_kva,
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
                result.total_consumption_kwh,
                result.total_consumption_kva,
                result.total_arrears_rs,
                result.total_amount_payable_rs,
                bill_date,
                Jsonb(
                    {
                        "consumer_name": result.consumer_name,
                        "category": result.category,
                        "contracted_md_kva": result.contracted_md_kva,
                        "bill_month_label": result.bill_month_label,
                        "total_consumption_kvah": result.total_consumption_kvah,
                        "net_bill_amount_rs": result.net_bill_amount_rs,
                        "due_date": result.due_date,
                    }
                ),
            ),
        )
    return True


def _write_audit(conn, scno: str, batch_id: str, result: HtBillResult) -> None:
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
                Jsonb({"bill_month_label": result.bill_month_label}) if result.found else None,
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
    print(f"Ingesting {len(scnos)} HT station(s) (dry_run={dry_run}, batch={batch_id})")

    session = new_session()
    limiter = RateLimiter(MIN_REQUEST_INTERVAL_S)

    found = 0
    errors = 0
    started_at = time.monotonic()

    for i, scno in enumerate(scnos):
        limiter.wait()
        result = scrape_ht_bill(session, scno)

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
