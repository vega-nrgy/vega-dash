"""
CLI: bulk-populates station_nearest_highway (extends the existing on-demand
cache from apps/web/src/lib/geo/overpass.ts to cover every station) and
station_geo_features (POI/land-use density — the free traffic/footfall
proxy) via the public OSM Overpass API.

Groups stations by district and issues ONE bulk bbox query per district
(a first per-station `around` design measured ~40s/station against the
public instance — impractical at 979 stations), then computes each
station's features locally from that district's bulk result. Two stations
are known to have corrupted latitude (missing a leading digit — see
2026-09-04 investigation) and are excluded from bbox sizing so they don't
blow up their district's query area; they're still processed individually
against their own (wrong) coordinates, which will produce meaningless
results for those two rows specifically — a pre-existing data-quality issue
in `stations.latitude`, not something this script silently corrects.

Usage:
    python scripts/build_geo_features.py                # all districts
    python scripts/build_geo_features.py --district "NALGONDA"

Run from apps/predict-service/, e.g.:
    cd apps/predict-service && python scripts/build_geo_features.py
"""

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from psycopg.types.json import Jsonb  # noqa: E402

from app.db import get_connection  # noqa: E402
from app.features.overpass_features import (  # noqa: E402
    BBox,
    compute_station_features,
    fetch_bulk_elements,
    new_overpass_client,
)

FEATURE_SET_VERSION = "overpass_v1"
BBOX_PAD_DEG = 0.15
# Loose sanity box for Telangana — anything outside this is a known bad
# coordinate (see module docstring) and is excluded from bbox sizing only.
SANE_LAT = (14.5, 20.5)
SANE_LON = (76.0, 82.0)


def _stations_by_district(conn) -> dict[str, list[tuple[str, float, float]]]:
    query = "select unique_scno, district, latitude, longitude from stations order by district, unique_scno"
    with conn.cursor() as cur:
        cur.execute(query)
        rows = cur.fetchall()
    grouped: dict[str, list[tuple[str, float, float]]] = {}
    for scno, district, lat, lon in rows:
        grouped.setdefault(district or "UNKNOWN", []).append((scno, lat, lon))
    return grouped


def _district_bbox(stations: list[tuple[str, float, float]]) -> BBox | None:
    sane = [
        (lat, lon)
        for _, lat, lon in stations
        if SANE_LAT[0] <= lat <= SANE_LAT[1] and SANE_LON[0] <= lon <= SANE_LON[1]
    ]
    if not sane:
        return None
    lats = [lat for lat, _ in sane]
    lons = [lon for _, lon in sane]
    return BBox(
        min_lat=min(lats) - BBOX_PAD_DEG,
        min_lon=min(lons) - BBOX_PAD_DEG,
        max_lat=max(lats) + BBOX_PAD_DEG,
        max_lon=max(lons) + BBOX_PAD_DEG,
    )


def _upsert_highway(conn, scno: str, lat: float, lon: float, result) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into station_nearest_highway (
                station_id, highway_ref, highway_name, distance_m,
                nearest_lat, nearest_lon, source, fetched_at
            ) values (%s, %s, %s, %s, %s, %s, 'osm_overpass', now())
            on conflict (station_id) do update set
                highway_ref = excluded.highway_ref,
                highway_name = excluded.highway_name,
                distance_m = excluded.distance_m,
                nearest_lat = excluded.nearest_lat,
                nearest_lon = excluded.nearest_lon,
                fetched_at = now()
            """,
            (scno, result.highway_ref, result.highway_name, result.highway_distance_m, lat, lon),
        )


def _upsert_geo_features(conn, scno: str, result) -> None:
    features = {f"poi_{k}_count": v for k, v in result.poi_counts.items()}
    features.update({f"landuse_{k}_count": v for k, v in result.landuse_counts.items()})
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into station_geo_features (station_id, feature_set_version, features, computed_at)
            values (%s, %s, %s, now())
            on conflict (station_id, feature_set_version) do update set
                features = excluded.features,
                computed_at = now()
            """,
            (scno, FEATURE_SET_VERSION, Jsonb(features)),
        )


def run(district_filter: str | None = None) -> dict:
    conn = get_connection()
    conn.autocommit = False

    grouped = _stations_by_district(conn)
    if district_filter:
        grouped = {k: v for k, v in grouped.items() if k == district_filter}

    total_stations = sum(len(v) for v in grouped.values())
    print(f"{len(grouped)} district(s), {total_stations} station(s)")

    session, limiter = new_overpass_client()
    ok = failed = districts_failed = 0
    started_at = time.monotonic()

    for i, (district, stations) in enumerate(grouped.items()):
        bbox = _district_bbox(stations)
        if bbox is None:
            print(f"  {district}: no sane coordinates, skipping ({len(stations)} station(s))")
            failed += len(stations)
            districts_failed += 1
            continue

        elements = fetch_bulk_elements(session, limiter, bbox)
        if elements is None:
            print(f"  {district}: bulk fetch FAILED, skipping ({len(stations)} station(s))")
            failed += len(stations)
            districts_failed += 1
            continue

        for scno, lat, lon in stations:
            result = compute_station_features(elements, lat, lon)
            try:
                _upsert_highway(conn, scno, lat, lon, result)
                _upsert_geo_features(conn, scno, result)
                conn.commit()
                ok += 1
            except Exception as exc:
                conn.rollback()
                failed += 1
                print(f"  {scno}: DB write failed ({exc})")

        elapsed = time.monotonic() - started_at
        print(
            f"  [{i + 1}/{len(grouped)}] {district}: {len(stations)} station(s), "
            f"{len(elements)} element(s), elapsed={elapsed:.0f}s"
        )

    conn.close()
    summary = {
        "total_stations": total_stations,
        "ok": ok,
        "failed": failed,
        "districts_failed": districts_failed,
    }
    print(f"Done: {summary}")
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--district", type=str, default=None, help="Only process one district")
    args = parser.parse_args()
    run(district_filter=args.district)
