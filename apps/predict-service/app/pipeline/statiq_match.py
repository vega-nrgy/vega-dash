"""
Cross-references Statiq's public station-markers API against our `stations` table
by proximity, to surface real CPO brand names (e.g. "Statiq") distinct from the raw
TSPDCL registration name already in `stations.operator` (e.g. "SHARIFY SERVICES PVT
LTD" -- both are true facts about the same station, not a correction of one by the
other -- see supabase/migrations/0012_cpo_match_review.sql).

Statiq's endpoint (https://backend.statiq.co.in/station/v1/markers) is free, public,
unauthenticated, and CORS-open (`Access-Control-Allow-Origin: *`) -- it's what their
own website's map widget calls. No API key, no billing account.

This pipeline only ever PROPOSES matches (station_cpo_match_proposals, status=
'pending'); nothing on `stations` is written here. A human reviews and approves/
rejects each one via the /admin/cpo-matches page before stations.cpo_brand is set --
necessary because co-located-but-different-operator false positives are common
(multiple CPOs' chargers sharing one petrol-bunk forecourt).
"""

from __future__ import annotations

import dataclasses
import math

import requests
from psycopg.types.json import Jsonb  # noqa: F401  (kept for parity with pdf_ingest's raw-jsonb pattern, unused here)

from app.db import get_connection

STATIQ_MARKERS_URL = "https://backend.statiq.co.in/station/v1/markers"
STATIQ_HEADERS = {
    "Content-Type": "application/json",
    "company-id": "90",
    "Referer": "https://www.statiq.in/",
}
# Matches the free-Nominatim viewbox already used for landmark search
# (apps/web/src/lib/geo/nominatim.ts) -- our dataset is Telangana-only.
TELANGANA_VERTICES = [
    [77.2, 15.8],
    [81.3, 15.8],
    [81.3, 19.9],
    [77.2, 19.9],
    [77.2, 15.8],
]
TELANGANA_CENTER = {"latitude": 17.9784, "longitude": 79.5941}

# Beyond this, a "nearest" candidate is almost certainly not the same physical
# station -- not worth proposing at all (the reviewer would just reject it).
MAX_PROPOSE_DISTANCE_M = 200


@dataclasses.dataclass
class StatiqStation:
    external_id: str
    name: str
    address: str | None
    latitude: float
    longitude: float


def fetch_statiq_stations() -> list[StatiqStation]:
    body = {
        **TELANGANA_CENTER,
        "all_chargers": 0,
        "connector_id": [],
        "vertices": TELANGANA_VERTICES,
    }
    resp = requests.post(STATIQ_MARKERS_URL, json=body, headers=STATIQ_HEADERS, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    if not data.get("meta", {}).get("success"):
        raise RuntimeError(f"Statiq API returned an error: {data.get('meta')}")

    return [
        StatiqStation(
            external_id=str(s["station_id"]),
            name=s["station_name"],
            address=s.get("address"),
            latitude=s["latitude"],
            longitude=s["longitude"],
        )
        for s in data["data"]["stations"]
    ]


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def run(dry_run: bool = False) -> dict:
    statiq_stations = fetch_statiq_stations()

    conn = get_connection()
    conn.autocommit = False

    cached_ids: dict[str, int] = {}
    if not dry_run:
        with conn.cursor() as cur:
            for s in statiq_stations:
                cur.execute(
                    """
                    insert into external_cpo_stations (source, external_id, name, address, latitude, longitude, fetched_at)
                    values ('statiq', %s, %s, %s, %s, %s, now())
                    on conflict (source, external_id) do update set
                        name = excluded.name,
                        address = excluded.address,
                        latitude = excluded.latitude,
                        longitude = excluded.longitude,
                        fetched_at = now()
                    returning id
                    """,
                    (s.external_id, s.name, s.address, s.latitude, s.longitude),
                )
                cached_ids[s.external_id] = cur.fetchone()[0]
        conn.commit()

    with conn.cursor() as cur:
        cur.execute("select unique_scno, latitude, longitude from stations")
        our_stations = cur.fetchall()
        # Never recompute for a station that already has a proposal -- a human
        # decision (approved or rejected) must stick even after a re-fetch.
        cur.execute("select station_id from station_cpo_match_proposals")
        already_proposed = {row[0] for row in cur.fetchall()}

    proposed = 0
    for scno, lat, lon in our_stations:
        if scno in already_proposed:
            continue
        best: tuple[float, StatiqStation] | None = None
        for s in statiq_stations:
            d = _haversine_m(lat, lon, s.latitude, s.longitude)
            if best is None or d < best[0]:
                best = (d, s)
        if best is None or best[0] > MAX_PROPOSE_DISTANCE_M:
            continue

        distance_m, match = best
        if dry_run:
            proposed += 1
            continue

        external_row_id = cached_ids[match.external_id]
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into station_cpo_match_proposals (station_id, external_station_id, distance_m, status)
                values (%s, %s, %s, 'pending')
                on conflict (station_id) do nothing
                """,
                (scno, external_row_id, round(distance_m, 1)),
            )
        proposed += 1

    if not dry_run:
        conn.commit()
    conn.close()

    summary = {
        "statiq_stations_fetched": len(statiq_stations),
        "our_stations_total": len(our_stations),
        "already_had_proposal": len(already_proposed),
        "new_proposals": proposed,
        "max_propose_distance_m": MAX_PROPOSE_DISTANCE_M,
        "dry_run": dry_run,
    }
    print(f"Done: {summary}")
    return summary
