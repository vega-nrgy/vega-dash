"""
Phase 1 seed: import assets/EV_Stations_Telangana_942 locations.xlsx into the
`stations` and `station_chargers` tables, plus a station_audit row per station
(parser_used='excel_seed_v1').

Per the plan (§4, §8): station_type is seeded as 'UNKNOWN' (the Excel alone
can't say HT vs LT — that's resolved in Phase 2 from real bill PDFs), and
Avg Consumption / Footfall are stored under seed_-prefixed columns since the
sheet's own README states they are synthetic placeholder values, not real
consumption data.

Usage:
    python supabase/seed/import_excel_stations.py

Reads DATABASE_URL from the environment, or defaults to the standard local
Supabase (`supabase start`) Postgres connection string.
"""

import os
import re
import sys
import uuid

import openpyxl
import psycopg

XLSX_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "assets",
    "EV_Stations_Telangana_942 locations.xlsx",
)

DEFAULT_LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

# Matches segments like "Bus (240KW )", "4W Fast (60KW )", "Slow (3KW )"
CHARGER_SEGMENT_RE = re.compile(r"([A-Za-z0-9 ]+?)\s*\(\s*([\d.]+)\s*KW\s*\)", re.IGNORECASE)


def parse_charger_details(raw) -> list[dict]:
    """Parse free-text 'Charger Details' into normalized charger rows.

    Example input: "Bus (240KW ),4W Fast (60KW ),4W Fast (60KW )"
    Duplicate (type, power) pairs are collapsed into a count. A minority of
    rows store a bare kW number instead of the "Type (NNkW)" format — those
    are recorded as a single charger of unknown type with that power rating.
    """
    if raw is None or raw == "":
        return []
    if isinstance(raw, (int, float)):
        return [{"charger_type": "Unspecified", "power_kw": float(raw), "count": 1}]
    counts: dict[tuple[str, float], int] = {}
    for match in CHARGER_SEGMENT_RE.finditer(raw):
        charger_type = match.group(1).strip()
        power_kw = float(match.group(2))
        key = (charger_type, power_kw)
        counts[key] = counts.get(key, 0) + 1
    return [
        {"charger_type": t, "power_kw": p, "count": c}
        for (t, p), c in counts.items()
    ]


def main() -> None:
    db_url = os.environ.get("DATABASE_URL", DEFAULT_LOCAL_DB_URL)

    wb = openpyxl.load_workbook(XLSX_PATH, data_only=True)
    ws = wb["Stations"]
    rows = list(ws.iter_rows(values_only=True))
    header, data_rows = rows[0], rows[1:]
    col = {name: i for i, name in enumerate(header)}

    batch_id = uuid.uuid4()

    with psycopg.connect(db_url, autocommit=False) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into ingestion_batches (id, status)
                values (%s, 'running')
                """,
                (str(batch_id),),
            )

            processed = 0
            errors = 0

            for row in data_rows:
                if row[col["ID"]] is None:
                    continue
                raw_id = row[col["ID"]]
                # Most IDs are plain numeric SCNos, but some HT-style ids are
                # alphanumeric (e.g. "BJH2143", akin to the SPT1326 sample).
                scno = str(int(raw_id)) if isinstance(raw_id, (int, float)) else str(raw_id).strip()
                try:
                    cur.execute(
                        """
                        insert into stations (
                            unique_scno, station_type, name, operator, status,
                            discom, ownership, category, location_class, district,
                            latitude, longitude,
                            seed_avg_consumption_kwh_month, seed_footfall
                        ) values (
                            %s, 'UNKNOWN', %s, %s, %s,
                            %s, %s, %s, %s, %s,
                            %s, %s,
                            %s, %s
                        )
                        on conflict (unique_scno) do update set
                            name = excluded.name,
                            operator = excluded.operator,
                            status = excluded.status,
                            discom = excluded.discom,
                            ownership = excluded.ownership,
                            category = excluded.category,
                            location_class = excluded.location_class,
                            district = excluded.district,
                            latitude = excluded.latitude,
                            longitude = excluded.longitude,
                            seed_avg_consumption_kwh_month = excluded.seed_avg_consumption_kwh_month,
                            seed_footfall = excluded.seed_footfall,
                            updated_at = now()
                        """,
                        (
                            scno,
                            row[col["Name"]],
                            row[col["Operator"]],
                            row[col["Status"]],
                            row[col["DISCOM"]],
                            row[col["Ownership"]],
                            row[col["Category"]],
                            row[col["Location Class"]],
                            row[col["District"]],
                            row[col["Latitude"]],
                            row[col["Longitude"]],
                            row[col["Avg Consumption (kWh/month)"]],
                            row[col["Footfall"]],
                        ),
                    )

                    # Replace any previously-seeded charger rows for this
                    # station (idempotent re-run), keep places_enrichment/manual rows.
                    cur.execute(
                        """
                        delete from station_chargers
                        where station_id = %s and source = 'excel_parsed'
                        """,
                        (scno,),
                    )
                    chargers = parse_charger_details(row[col["Charger Details"]] or "")
                    for i, c in enumerate(chargers):
                        cur.execute(
                            """
                            insert into station_chargers (
                                station_id, charger_type, power_kw, count,
                                source, raw_label, is_primary
                            ) values (%s, %s, %s, %s, 'excel_parsed', %s, %s)
                            """,
                            (
                                scno, c["charger_type"], c["power_kw"], c["count"],
                                str(row[col["Charger Details"]]),
                                i == 0,
                            ),
                        )

                    cur.execute(
                        """
                        insert into station_audit (
                            station_id, is_valid, parser_used, source_file,
                            ingestion_batch_id
                        ) values (%s, true, 'excel_seed_v1', %s, %s)
                        """,
                        (scno, os.path.basename(XLSX_PATH), str(batch_id)),
                    )

                    processed += 1
                except Exception as exc:  # noqa: BLE001
                    errors += 1
                    print(f"  ! error on station {scno}: {exc}", file=sys.stderr)

            cur.execute(
                """
                update ingestion_batches
                set finished_at = now(), status = 'completed',
                    stations_processed = %s, errors_count = %s
                where id = %s
                """,
                (processed, errors, str(batch_id)),
            )

        conn.commit()

    print(f"Seed complete: {processed} stations processed, {errors} errors.")


if __name__ == "__main__":
    main()
