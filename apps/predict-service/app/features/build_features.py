"""
Assembles the training frame: target (maturity-aware steady-state kWh/month)
+ full feature matrix, one row per station. Shared by train (now) and infer
(later), so train/serve never drift apart.

Target definition: for stations with >=MIN_MATURE_MONTHS of real billed
months, the median of their last STEADY_STATE_WINDOW months. A 2026-09-04
data check found a ~3x ramp-up between a station's first 3 and last 3 real
months (avg 5,427 -> 17,590 kWh), so a lifetime average would understate
mature demand — "last N months" approximates the post-ramp-up steady state,
and the median (not mean) absorbs occasional real billed-zero months.

station_type (HT/LT) is deliberately excluded as an input feature — it's a
consequence of consumption scale (HT median ~26k kWh vs LT ~563 kWh at
last-3-months), not something a prospective new site would know in advance.
"""

import pandas as pd

from app.features.geo_features import build_density_features, fetch_station_pairs

MIN_MATURE_MONTHS = 6
STEADY_STATE_WINDOW = 3


def compute_steady_state_kwh(conn) -> dict[str, float]:
    """Median of the last STEADY_STATE_WINDOW real-billed months, for every
    station with >= MIN_MATURE_MONTHS of real (non-null units_kwh) history."""
    query = """
        with ranked as (
            select station_id, units_kwh, bill_month,
                   row_number() over (partition by station_id order by bill_month desc) as rn,
                   count(*) over (partition by station_id) as n_months
            from monthly_bills
            where units_kwh is not null
        )
        select station_id, units_kwh
        from ranked
        where n_months >= %s and rn <= %s
        order by station_id
    """
    with conn.cursor() as cur:
        cur.execute(query, (MIN_MATURE_MONTHS, STEADY_STATE_WINDOW))
        rows = cur.fetchall()
    df = pd.DataFrame(rows, columns=["station_id", "units_kwh"])
    if df.empty:
        return {}
    medians = df.groupby("station_id")["units_kwh"].median()
    return medians.to_dict()


def fetch_station_base(conn) -> pd.DataFrame:
    query = """
        select unique_scno as station_id, district, location_class,
               latitude, longitude, contracted_load_kva
        from stations
    """
    with conn.cursor() as cur:
        cur.execute(query)
        rows = cur.fetchall()
        cols = [d.name for d in cur.description]
    return pd.DataFrame(rows, columns=cols)


def fetch_charger_summary(conn) -> pd.DataFrame:
    query = """
        select station_id, charger_type, power_kw, count
        from station_chargers
    """
    with conn.cursor() as cur:
        cur.execute(query)
        rows = cur.fetchall()
    df = pd.DataFrame(rows, columns=["station_id", "charger_type", "power_kw", "count"])
    if df.empty:
        return pd.DataFrame(columns=["station_id"])

    total_count = df.groupby("station_id")["count"].sum().rename("total_charger_count")
    max_power = df.groupby("station_id")["power_kw"].max().rename("max_charger_power_kw")
    has_4w_fast = (
        df.assign(is_4w_fast=df["charger_type"].eq("4W Fast"))
        .groupby("station_id")["is_4w_fast"]
        .any()
        .rename("has_4w_fast")
    )
    dominant_type = (
        df.sort_values("count", ascending=False)
        .groupby("station_id")["charger_type"]
        .first()
        .rename("dominant_charger_type")
    )
    return pd.concat([total_count, max_power, has_4w_fast, dominant_type], axis=1).reset_index()


def fetch_overpass_features(conn) -> pd.DataFrame:
    query = """
        select station_id, distance_m as highway_distance_m
        from station_nearest_highway
    """
    with conn.cursor() as cur:
        cur.execute(query)
        rows = cur.fetchall()
    highway = pd.DataFrame(rows, columns=["station_id", "highway_distance_m"])

    query2 = """
        select distinct on (station_id) station_id, features
        from station_geo_features
        order by station_id, computed_at desc
    """
    with conn.cursor() as cur:
        cur.execute(query2)
        rows2 = cur.fetchall()
    if rows2:
        geo_df = pd.DataFrame(rows2, columns=["station_id", "features"])
        expanded = pd.json_normalize(geo_df["features"])
        geo_df = pd.concat([geo_df[["station_id"]], expanded], axis=1)
    else:
        geo_df = pd.DataFrame(columns=["station_id"])

    if highway.empty:
        return geo_df
    if geo_df.empty:
        return highway
    return highway.merge(geo_df, on="station_id", how="outer")


def build_training_frame(conn) -> tuple[pd.DataFrame, pd.Series]:
    """Returns (X, y) — one row per station with >= MIN_MATURE_MONTHS of
    real billing history. X's categorical columns are pandas 'category'
    dtype so HistGradientBoostingRegressor(categorical_features='from_dtype')
    can use them natively."""
    steady_state = compute_steady_state_kwh(conn)

    base = fetch_station_base(conn)
    chargers = fetch_charger_summary(conn)
    pairs = fetch_station_pairs(conn)
    density = build_density_features(pairs, steady_state)
    overpass = fetch_overpass_features(conn)

    df = base.merge(chargers, on="station_id", how="left")
    df = df.merge(density, on="station_id", how="left")
    df = df.merge(overpass, on="station_id", how="left")

    df["steady_state_kwh"] = df["station_id"].map(steady_state)
    train_df = df[df["steady_state_kwh"].notna()].copy()

    # psycopg returns Postgres `numeric` as Decimal, which pandas keeps as
    # dtype 'object' rather than float64 — HistGradientBoostingRegressor
    # needs real floats.
    numeric_cols = (
        "contracted_load_kva",
        "max_charger_power_kw",
        "highway_distance_m",
        "steady_state_kwh",
    )
    for col in numeric_cols:
        if col in train_df.columns:
            train_df[col] = pd.to_numeric(train_df[col], errors="coerce")

    for col in ("district", "location_class", "dominant_charger_type"):
        if col in train_df.columns:
            train_df[col] = train_df[col].astype("category")

    if "has_4w_fast" not in train_df.columns:
        train_df["has_4w_fast"] = False
    train_df["has_4w_fast"] = train_df["has_4w_fast"].fillna(False).astype(bool)

    train_df = train_df.set_index("station_id", drop=False)
    y = train_df["steady_state_kwh"]
    drop_cols = ["steady_state_kwh", "station_id", "latitude", "longitude"]
    X = train_df.drop(columns=[c for c in drop_cols if c in train_df.columns])

    return X, y
