import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAreaMetrics } from "@/lib/data/stations";
import { geocodeLandmark } from "@/lib/geo/nominatim";
import type { SearchResponse } from "@/lib/types";

const MARKER_COLUMNS =
  "unique_scno, name, station_type, status, district, location_class, discom, latitude, longitude";

/**
 * Single search endpoint resolving all four search modes server-side, in
 * order: (1) ID, (2) district/area — zero external calls, (3) name
 * similarity, (4) landmark via free Nominatim. See plan §5.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json<SearchResponse>({ resolvedAs: "none" });
  }

  const supabase = getSupabaseServerClient();

  // 1. ID: exact match always tried first (SCNos are either plain numeric
  // like 115005724 or HT-style alphanumeric like SPT1326/BJH2143); prefix
  // match only for ID-shaped queries (short, no spaces) to avoid treating a
  // landmark query as an ID prefix.
  const { data: exact } = await supabase
    .from("stations")
    .select(MARKER_COLUMNS)
    .eq("unique_scno", q)
    .maybeSingle();
  if (exact) {
    return NextResponse.json<SearchResponse>({
      resolvedAs: "id",
      scno: exact.unique_scno,
      matches: [exact],
    });
  }
  if (/^[A-Za-z0-9]{3,15}$/.test(q)) {
    const { data: prefixMatches } = await supabase
      .from("stations")
      .select(MARKER_COLUMNS)
      .ilike("unique_scno", `${q}%`)
      .limit(20);
    if (prefixMatches && prefixMatches.length) {
      return NextResponse.json<SearchResponse>({
        resolvedAs: "id",
        matches: prefixMatches,
      });
    }
  }

  // 2. Area: district exact/prefix match — no external calls.
  const area = await getAreaMetrics(q);
  if (area) {
    return NextResponse.json<SearchResponse>({
      resolvedAs: "area",
      district: area.district,
      matches: area.stations,
      areaMetrics: {
        avg_seed_consumption_kwh_month: area.avg_seed_consumption_kwh_month,
        footfall_breakdown: area.footfall_breakdown,
        bounds: area.bounds,
      },
    });
  }

  // 3. Name similarity (pg_trgm).
  const { data: nameMatches } = await supabase
    .from("stations")
    .select(MARKER_COLUMNS)
    .ilike("name", `%${q}%`)
    .limit(20);
  if (nameMatches && nameMatches.length) {
    return NextResponse.json<SearchResponse>({
      resolvedAs: "name",
      matches: nameMatches,
    });
  }

  // 4. Landmark fallback via free Nominatim (see plan §1/§4 — Google Places
  // is gated behind explicit approval and not called here).
  const geocoded = await geocodeLandmark(q);
  if (geocoded) {
    return NextResponse.json<SearchResponse>({
      resolvedAs: "landmark",
      landmark: {
        query: q,
        center: { lat: geocoded.lat, lon: geocoded.lon },
        display_name: geocoded.display_name,
      },
    });
  }

  return NextResponse.json<SearchResponse>({ resolvedAs: "none" });
}
