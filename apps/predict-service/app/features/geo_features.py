"""
Pure-SQL PostGIS geo features — nearby-EV-station density and spatial
autocorrelation (nearby stations' own steady-state consumption). Zero
external calls; uses the `stations.geom` column already indexed with GIST
(supabase/migrations/0001_init_schema.sql).
"""

import pandas as pd

MAX_RADIUS_M = 5000.0
DENSITY_RADII_M = (1000.0, 3000.0, 5000.0)


def fetch_station_pairs(conn, max_radius_m: float = MAX_RADIUS_M) -> pd.DataFrame:
    """All (station_id, neighbor_id, distance_m) pairs within max_radius_m,
    excluding self-pairs. The ST_DWithin join condition uses the GIST index;
    tighter radii are derived from `distance_m` in pandas rather than issuing
    a separate indexed query per radius."""
    query = """
        select a.unique_scno as station_id, b.unique_scno as neighbor_id,
               st_distance(a.geom, b.geom) as distance_m
        from stations a
        join stations b
          on a.unique_scno <> b.unique_scno
         and st_dwithin(a.geom, b.geom, %s)
    """
    with conn.cursor() as cur:
        cur.execute(query, (max_radius_m,))
        rows = cur.fetchall()
    return pd.DataFrame(rows, columns=["station_id", "neighbor_id", "distance_m"])


def build_density_features(pairs: pd.DataFrame, steady_state: dict[str, float]) -> pd.DataFrame:
    """From the pair list, derive per-station density counts at each radius
    in DENSITY_RADII_M plus the average steady-state kWh of neighbors within
    the largest radius (only neighbors with a known — i.e. mature — target
    contribute to the average; NaN if none do)."""
    if pairs.empty:
        return pd.DataFrame(columns=["station_id"])

    out = pairs[["station_id"]].drop_duplicates().set_index("station_id")

    for radius in DENSITY_RADII_M:
        within = pairs[pairs["distance_m"] <= radius]
        counts = within.groupby("station_id").size()
        out[f"n_stations_within_{int(radius)}m"] = counts
    out = out.fillna(0)
    for radius in DENSITY_RADII_M:
        col = f"n_stations_within_{int(radius)}m"
        out[col] = out[col].astype(int)

    neighbor_targets = pairs.copy()
    neighbor_targets["neighbor_kwh"] = neighbor_targets["neighbor_id"].map(steady_state)
    mature = neighbor_targets.dropna(subset=["neighbor_kwh"])
    neighbor_avg = mature.groupby("station_id")["neighbor_kwh"].mean()
    out["neighbor_avg_steady_kwh"] = neighbor_avg

    return out.reset_index()
