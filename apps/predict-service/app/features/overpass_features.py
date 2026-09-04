"""
Free OSM Overpass API features — nearest National Highway (same query
family as apps/web/src/lib/geo/overpass.ts) plus POI/land-use density as a
free proxy for traffic/footfall, since no paid traffic-count or population
dataset is available (Google Places is gated behind billing approval — see
project standing rule).

A first version issued one `around:radius` query per station and measured
~40s/station against the public instance — impractical at 979 stations
(~11h). This version instead issues one BULK bbox query per group of nearby
stations (build_geo_features.py groups by district) and computes each
station's nearest-highway distance / POI-radius counts locally from the
bulk result — a handful of requests instead of ~1,000.
"""

import math
from dataclasses import dataclass, field

from app.scrapers.base import RateLimiter, new_session

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "VegaChargeDashboard/0.1 (internal tool; contact: admin@vegacharge.in)"
POI_RADIUS_M = 2000
MIN_REQUEST_INTERVAL_S = 2.0

AMENITY_TYPES = ("fuel", "restaurant", "cafe", "fast_food")
LANDUSE_TYPES = ("residential", "commercial", "industrial")


@dataclass
class BBox:
    min_lat: float
    min_lon: float
    max_lat: float
    max_lon: float


@dataclass
class StationGeoResult:
    found: bool
    highway_ref: str | None = None
    highway_name: str | None = None
    highway_distance_m: float | None = None
    poi_counts: dict[str, int] = field(default_factory=dict)
    landuse_counts: dict[str, int] = field(default_factory=dict)


def _bulk_query(bbox: BBox) -> str:
    amenity_re = "|".join(AMENITY_TYPES)
    landuse_re = "|".join(LANDUSE_TYPES)
    box = f"{bbox.min_lat},{bbox.min_lon},{bbox.max_lat},{bbox.max_lon}"
    return (
        "[out:json][timeout:90];"
        f'(way[highway][ref~"^NH"]({box}););'
        "out geom;"
        f'(node[amenity~"^({amenity_re})$"]({box});'
        f"node[shop]({box}););"
        "out;"
        f'(way[landuse~"^({landuse_re})$"]({box}););'
        "out center;"
    )


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def fetch_bulk_elements(session, limiter: RateLimiter, bbox: BBox) -> list[dict] | None:
    limiter.wait()
    try:
        resp = session.post(
            OVERPASS_URL,
            data={"data": _bulk_query(bbox)},
            headers={"User-Agent": USER_AGENT},
            timeout=100,
        )
        resp.raise_for_status()
    except Exception:
        return None
    try:
        return resp.json().get("elements", [])
    except ValueError:
        return None


def _nearest_way_distance(lat: float, lon: float, way: dict) -> float | None:
    vertices = way.get("geometry") or []
    best = None
    for v in vertices:
        d = _haversine_m(lat, lon, v["lat"], v["lon"])
        if best is None or d < best:
            best = d
    return best


def compute_station_features(
    elements: list[dict], lat: float, lon: float, poi_radius_m: float = POI_RADIUS_M
) -> StationGeoResult:
    """Pure local computation — no I/O — over a bulk-fetched element list."""
    best_ref = best_name = None
    best_distance: float | None = None
    for e in elements:
        if e.get("type") != "way" or not e.get("tags", {}).get("highway") or not e.get("geometry"):
            continue
        d = _nearest_way_distance(lat, lon, e)
        if d is not None and (best_distance is None or d < best_distance):
            best_distance = d
            tags = e.get("tags", {})
            best_ref = tags.get("ref") or tags.get("int_ref")
            best_name = tags.get("name")

    poi_counts = {t: 0 for t in AMENITY_TYPES}
    poi_counts["shop"] = 0
    landuse_counts = {t: 0 for t in LANDUSE_TYPES}

    for e in elements:
        tags = e.get("tags", {})
        if e.get("type") == "node":
            point = e
        elif e.get("type") == "way" and "center" in e:
            point = e["center"]
        else:
            continue

        d = _haversine_m(lat, lon, point["lat"], point["lon"])
        if d > poi_radius_m:
            continue

        amenity = tags.get("amenity")
        if amenity in poi_counts:
            poi_counts[amenity] += 1
        elif "shop" in tags:
            poi_counts["shop"] += 1
        landuse = tags.get("landuse")
        if landuse in landuse_counts:
            landuse_counts[landuse] += 1

    return StationGeoResult(
        found=True,
        highway_ref=best_ref,
        highway_name=best_name,
        highway_distance_m=best_distance,
        poi_counts=poi_counts,
        landuse_counts=landuse_counts,
    )


def new_overpass_client() -> tuple:
    return new_session(), RateLimiter(MIN_REQUEST_INTERVAL_S)
