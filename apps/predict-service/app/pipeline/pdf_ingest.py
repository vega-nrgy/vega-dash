"""
PDF-history ingestion: parses the real TS_LT_data/TS_HT_data bill-history PDF
fixtures the user supplied (NOT a live scrape -- these are downloaded bill
history/details PDFs) and upserts monthly_bills + station_audit.

Reuses the parser/discovery code ported from the prior vega_v2 project
(app/parsers/, app/discovery/) -- pure PDF-text parsing, no VDV-specific
coupling, so it was ported verbatim.

Only stations already seeded in `stations` (from the Excel import, see
supabase/seed/import_excel_stations.py) are written to -- this pipeline
never creates a station row, only enriches monthly_bills for an existing
unique_scno. A PDF whose body-extracted unique_scno has no matching station
is logged as unmatched, not inserted as a new station.
"""

from __future__ import annotations

import dataclasses
import itertools
import time
import uuid
from datetime import date
from pathlib import Path

from psycopg.types.json import Jsonb

from app.db import get_connection
from app.discovery.ht_walker import discover_ht_files
from app.discovery.lt_walker import LtPair, discover_lt_pairs
from app.parsers.common import MonthlyBillRow
from app.parsers.details import parse_ht_body_metadata, parse_lt_details
from app.parsers.detect import auto_parse_history

PARSER_NAME_PREFIX = "pdf_ingest_v1"

# app/pipeline/pdf_ingest.py's MonthlyBillRow.source_pdf_filename identifies the exact PDF
# format detected -- map that to the monthly_bills.source check-constraint values.
_SOURCE_BY_FORMAT = {
    "lt_single": "pdf_history_lt_single",
    "lt_dual": "pdf_history_lt_dual",
    "ht_wide": "pdf_history_ht_wide",
    "lt_compact": "pdf_history_lt_compact",
}


@dataclasses.dataclass
class FileResult:
    unique_scno: str
    station_type: str
    source_file: str
    fmt: str | None
    bills: list[MonthlyBillRow]
    error: str | None = None
    # Contracted Load / CMD -- parsed from the HT history PDF's own body metadata
    # table, or the LT station's separate Consumer-Details PDF. None when the
    # relevant source doc is missing or the field wasn't present in it.
    contracted_load_kva: float | None = None
    cmd_source: str | None = None


def _bill_to_jsonb(bill: MonthlyBillRow) -> Jsonb:
    d = dataclasses.asdict(bill)
    for k, v in d.items():
        if isinstance(v, date):
            d[k] = v.isoformat()
    return Jsonb(d)


def _parse_lt_contracted_load(details_path: Path | None) -> tuple[float | None, str | None]:
    """Best-effort: a missing/unparseable Details PDF must not fail the pair --
    the History PDF's bills are the primary payload, CMD is a bonus field."""
    if details_path is None:
        return None, None
    try:
        details = parse_lt_details(details_path)
    except Exception:
        return None, None
    load = details.get("contracted_load_kva")
    return (load, "lt_details_pdf") if load is not None else (None, None)


def parse_lt_pair(pair: LtPair) -> FileResult:
    contracted_load_kva, cmd_source = _parse_lt_contracted_load(pair.details_path)
    if pair.history_path is None:
        return FileResult(
            pair.unique_scno, "LT", "", None, [], error="no_history_file",
            contracted_load_kva=contracted_load_kva, cmd_source=cmd_source,
        )
    try:
        fmt, bills = auto_parse_history(pair.history_path)
    except Exception as exc:  # real-world PDFs vary; one bad file must not kill the batch
        return FileResult(
            pair.unique_scno, "LT", pair.history_path.name, None, [], error=str(exc),
            contracted_load_kva=contracted_load_kva, cmd_source=cmd_source,
        )
    return FileResult(
        pair.unique_scno, "LT", pair.history_path.name, fmt, bills,
        contracted_load_kva=contracted_load_kva, cmd_source=cmd_source,
    )


def parse_ht_file(path: Path) -> FileResult:
    try:
        fmt, bills = auto_parse_history(path)
        meta = parse_ht_body_metadata(path)
    except Exception as exc:
        return FileResult(path.stem, "HT", path.name, None, [], error=str(exc))
    scno = meta.get("unique_scno") or path.stem
    cmd_kva = meta.get("cmd_kva")
    cmd_source = "ht_body_metadata" if cmd_kva is not None else None
    return FileResult(
        scno, "HT", path.name, fmt, bills,
        contracted_load_kva=cmd_kva, cmd_source=cmd_source,
    )


def collect_results(lt_root: Path, ht_root: Path, limit: int | None = None) -> list[FileResult]:
    """discover_lt_pairs/discover_ht_files are generators that do PDF text-extraction as they
    walk -- with ~950 real LT PDFs, fully materializing the list before slicing to `limit` would
    mean paying that cost for every file regardless of limit (this is what made an earlier
    unlimited run look hung). itertools.islice pulls lazily, so a small `limit` stops the walk
    (and the expensive per-file text extraction) after the first few matching folders/files."""
    results: list[FileResult] = []

    lt_pairs = itertools.islice(discover_lt_pairs(lt_root), limit) if limit else discover_lt_pairs(lt_root)
    for pair in lt_pairs:
        results.append(parse_lt_pair(pair))

    ht_files = itertools.islice(discover_ht_files(ht_root), limit) if limit else discover_ht_files(ht_root)
    for path in ht_files:
        results.append(parse_ht_file(path))

    return results


def _known_station_ids(conn) -> set[str]:
    with conn.cursor() as cur:
        cur.execute("select unique_scno from stations")
        return {row[0] for row in cur.fetchall()}


def _print_sample(results: list[FileResult], sample: int) -> None:
    print(f"\n=== Sample verification output (first {sample} files) ===")
    for result in results[:sample]:
        print(
            f"\n--- {result.unique_scno} ({result.station_type}, fmt={result.fmt}) "
            f"file={result.source_file} contracted_load_kva={result.contracted_load_kva} "
            f"({result.cmd_source}) ---"
        )
        if result.error:
            print(f"  ERROR: {result.error}")
            continue
        print(f"  bills: {len(result.bills)}")
        for b in result.bills:
            print(
                f"    {b.bill_month} | kWh={b.billed_kwh} | demand_rs={b.demand_rs} | "
                f"arrears_rs={b.arrears_rs} | collection_rs={b.collection_rs} | "
                f"closing_reading={b.kwh_reading_closing} | cmd_kva_billed={b.cmd_kva_billed} | "
                f"bill_date_precise={b.bill_date_precise}"
            )
    print("=== End sample ===\n")


def run(
    lt_root: Path,
    ht_root: Path,
    limit: int | None = None,
    dry_run: bool = False,
    sample: int = 0,
    progress_every: int = 50,
) -> dict:
    started_at = time.monotonic()
    results = collect_results(lt_root, ht_root, limit)
    if sample:
        _print_sample(results, sample)

    conn = get_connection()
    conn.autocommit = False
    known_ids = _known_station_ids(conn)

    batch_id = str(uuid.uuid4())
    if not dry_run:
        with conn.cursor() as cur:
            cur.execute("insert into ingestion_batches (id, status) values (%s, 'running')", (batch_id,))
        conn.commit()

    files_parsed = 0
    files_errored = 0
    files_unmatched = 0
    unmatched_scnos: list[str] = []
    bills_written = 0
    cmd_backfilled = 0

    for i, result in enumerate(results):
        matched = result.unique_scno in known_ids
        if result.error:
            files_errored += 1
        else:
            files_parsed += 1
        if not matched:
            files_unmatched += 1
            unmatched_scnos.append(result.unique_scno)

        source_tag = _SOURCE_BY_FORMAT.get(result.fmt) if result.fmt else None

        if not dry_run:
            # station_audit.station_id is NOT NULL + FK to stations -- an unmatched scno has no
            # row to reference, so it can't be audited in-DB (this pipeline never creates
            # stations); unmatched files are only counted/printed, not persisted.
            if matched:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        insert into station_audit (
                            station_id, is_valid, validity_reason, parser_used,
                            source_file, scrape_ts, ingestion_batch_id, raw_extract
                        ) values (%s, %s, %s, %s, %s, now(), %s, %s)
                        """,
                        (
                            result.unique_scno,
                            result.error is None and len(result.bills) > 0,
                            result.error,
                            result.fmt or "unknown",
                            result.source_file,
                            batch_id,
                            Jsonb({"bill_count": len(result.bills)}),
                        ),
                    )

            if matched and source_tag:
                with conn.cursor() as cur:
                    for bill in result.bills:
                        cur.execute(
                            """
                            insert into monthly_bills (
                                station_id, bill_month, units_kwh, billed_demand_kva,
                                demand_amount_rs, arrears_rs, collection_rs, closing_reading,
                                bill_date, source, raw
                            ) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            on conflict (station_id, bill_month) do update set
                                units_kwh = excluded.units_kwh,
                                billed_demand_kva = excluded.billed_demand_kva,
                                demand_amount_rs = excluded.demand_amount_rs,
                                arrears_rs = excluded.arrears_rs,
                                collection_rs = excluded.collection_rs,
                                closing_reading = excluded.closing_reading,
                                bill_date = excluded.bill_date,
                                source = excluded.source,
                                raw = excluded.raw,
                                ingested_at = now()
                            """,
                            (
                                result.unique_scno,
                                bill.bill_month,
                                bill.billed_kwh,
                                bill.cmd_kva_billed,
                                bill.demand_rs,
                                bill.arrears_rs,
                                bill.collection_rs,
                                bill.kwh_reading_closing,
                                bill.bill_date_precise,
                                source_tag,
                                _bill_to_jsonb(bill),
                            ),
                        )
                        bills_written += 1

            # Unconditional update, not on-conflict-do-update -- safe to re-run the whole
            # pipeline repeatedly, same idempotency guarantee as the monthly_bills upsert above.
            if matched and result.contracted_load_kva is not None:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        update stations
                        set contracted_load_kva = %s, cmd_source = %s, updated_at = now()
                        where unique_scno = %s
                        """,
                        (result.contracted_load_kva, result.cmd_source, result.unique_scno),
                    )
                cmd_backfilled += 1

            conn.commit()
        elif matched:
            if source_tag:
                bills_written += len(result.bills)
            if result.contracted_load_kva is not None:
                cmd_backfilled += 1

        if (i + 1) % progress_every == 0 or (i + 1) == len(results):
            elapsed = time.monotonic() - started_at
            print(
                f"  [{i + 1}/{len(results)}] parsed={files_parsed} errors={files_errored} "
                f"unmatched={files_unmatched} bills={bills_written} elapsed={elapsed:.0f}s"
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
                (files_parsed, files_errored + files_unmatched, batch_id),
            )
        conn.commit()

    conn.close()

    summary = {
        "batch_id": batch_id,
        "total_files": len(results),
        "files_parsed": files_parsed,
        "files_errored": files_errored,
        "files_unmatched": files_unmatched,
        "unmatched_scnos": unmatched_scnos,
        "bills_written": bills_written,
        "cmd_backfilled": cmd_backfilled,
        "elapsed_s": round(time.monotonic() - started_at, 1),
    }
    print(f"Done: {summary}")
    return summary
