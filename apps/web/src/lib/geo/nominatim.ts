import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Free OSM Nominatim geocoder — used for landmark search until Google Places
 * is explicitly approved (see plan §1 "API call rule" and §8 Phase 3).
 * Rate-limited to ~1 req/sec per Nominatim's usage policy; geocode_cache
 * absorbs repeat lookups so we rarely hit the live endpoint twice for the
 * same query.
 */

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
// Nominatim's usage policy requires a real identifying User-Agent.
const USER_AGENT = "VegaChargeDashboard/0.1 (internal tool; contact: admin@vegacharge.in)";
// Bias results toward Telangana without hard-excluding everything else.
const TELANGANA_VIEWBOX = "77.2,19.9,81.3,15.8"; // left,top,right,bottom

export interface GeocodeResult {
  lat: number;
  lon: number;
  display_name: string;
}

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function geocodeLandmark(query: string): Promise<GeocodeResult | null> {
  const normalized = normalizeQuery(query);
  const supabase = getSupabaseServerClient();

  const { data: cached } = await supabase
    .from("geocode_cache")
    .select("resolved_lat, resolved_lon, bounds")
    .eq("query_text_normalized", normalized)
    .eq("source", "nominatim")
    .maybeSingle();

  if (cached && cached.resolved_lat != null && cached.resolved_lon != null) {
    return {
      lat: cached.resolved_lat,
      lon: cached.resolved_lon,
      display_name: query,
    };
  }

  const url = new URL(NOMINATIM_BASE);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("viewbox", TELANGANA_VIEWBOX);
  url.searchParams.set("bounded", "0");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!res.ok) return null;

  const results = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
  }>;

  if (!results.length) return null;

  const result: GeocodeResult = {
    lat: parseFloat(results[0].lat),
    lon: parseFloat(results[0].lon),
    display_name: results[0].display_name,
  };

  await supabase.from("geocode_cache").upsert({
    query_text_normalized: normalized,
    source: "nominatim",
    resolved_lat: result.lat,
    resolved_lon: result.lon,
  });

  return result;
}
