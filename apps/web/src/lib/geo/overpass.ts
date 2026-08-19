import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { NearestHighway } from "@/lib/types";

/**
 * Free OSM Overpass API — finds the nearest National Highway way to a point.
 * No key/billing, same policy as lib/geo/nominatim.ts's free-Nominatim rule.
 * station_nearest_highway (supabase/migrations/0011) caches results the same
 * way geocode_cache caches Nominatim lookups, so a station is only looked up
 * once. Not every OSM NH way carries a `name` tag in this region — a bare ref
 * like "NH65" with no route name is expected, not a missing-data bug.
 */

const OVERPASS_BASE = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "VegaChargeDashboard/0.1 (internal tool; contact: admin@vegacharge.in)";
const INITIAL_RADIUS_M = 20000;
const RETRY_RADIUS_M = 50000;

interface OverpassWay {
  id: number;
  tags?: { ref?: string; int_ref?: string; name?: string };
  geometry?: { lat: number; lon: number }[];
}

function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function queryOverpass(lat: number, lon: number, radiusM: number): Promise<OverpassWay[]> {
  const query = `[out:json][timeout:25];way[highway][ref~"^NH"](around:${radiusM},${lat},${lon});out geom;`;
  const res = await fetch(OVERPASS_BASE, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { elements?: OverpassWay[] };
  return data.elements ?? [];
}

/** Vertex-level haversine distance from the point to each way's geometry — a documented
 * approximation of true nearest-point-on-segment distance, adequate for "nearest highway." */
function nearestWayDistance(point: { lat: number; lon: number }, way: OverpassWay): number {
  const vertices = way.geometry ?? [];
  let min = Infinity;
  for (const v of vertices) {
    const d = haversineM(point, v);
    if (d < min) min = d;
  }
  return min;
}

async function fetchNearestHighway(lat: number, lon: number): Promise<NearestHighway | null> {
  let ways = await queryOverpass(lat, lon, INITIAL_RADIUS_M);
  if (ways.length === 0) {
    ways = await queryOverpass(lat, lon, RETRY_RADIUS_M);
  }
  if (ways.length === 0) return null;

  let best: { way: OverpassWay; distanceM: number } | null = null;
  for (const way of ways) {
    const distanceM = nearestWayDistance({ lat, lon }, way);
    if (!best || distanceM < best.distanceM) best = { way, distanceM };
  }
  if (!best) return null;

  return {
    ref: best.way.tags?.ref ?? best.way.tags?.int_ref ?? null,
    name: best.way.tags?.name ?? null,
    distance_m: best.distanceM,
  };
}

export async function findNearestNationalHighway(
  scno: string,
  lat: number,
  lon: number
): Promise<NearestHighway | null> {
  const supabase = getSupabaseServerClient();

  const { data: cached } = await supabase
    .from("station_nearest_highway")
    .select("highway_ref, highway_name, distance_m")
    .eq("station_id", scno)
    .maybeSingle();

  if (cached) {
    return { ref: cached.highway_ref, name: cached.highway_name, distance_m: cached.distance_m };
  }

  const result = await fetchNearestHighway(lat, lon);

  await supabase.from("station_nearest_highway").upsert({
    station_id: scno,
    highway_ref: result?.ref ?? null,
    highway_name: result?.name ?? null,
    distance_m: result?.distance_m ?? null,
    nearest_lat: lat,
    nearest_lon: lon,
  });

  return result;
}
