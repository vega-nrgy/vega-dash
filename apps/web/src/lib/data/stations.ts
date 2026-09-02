import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type {
  AreaMetrics,
  CategoryBucket,
  ExportableStation,
  NearbyStationsResult,
  NearbyStationWithBilling,
  PerformanceTier,
  StationDetail,
  StationMarkerRow,
} from "@/lib/types";

const MARKER_COLUMNS =
  "unique_scno, name, station_type, status, district, location_class, discom, latitude, longitude, operator";

/**
 * station_billing_summary (supabase/migrations/0003) pre-aggregates monthly_bills in SQL —
 * monthly_bills itself is ~8k rows, over this instance's PostgREST max_rows=1000 cap, and
 * aggregate-in-select is disabled here (PGRST123), so a plain SELECT over the view is the
 * reliable path rather than paginating raw rows.
 */
async function getBillingSummary(): Promise<Map<string, { hasHistory: boolean; avgKwh: number | null }>> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("station_billing_summary")
    .select("station_id, bill_count, avg_units_kwh");
  if (error) throw error;

  const map = new Map<string, { hasHistory: boolean; avgKwh: number | null }>();
  for (const row of data ?? []) {
    map.set(row.station_id, { hasHistory: row.bill_count > 0, avgKwh: row.avg_units_kwh });
  }
  return map;
}

/**
 * Fixed global thresholds on avg. billed kWh — low <5000, medium [5000,10000], high
 * >10000 — NOT per-station_type. This deliberately replaces an earlier per-type-tercile
 * scheme: LT stations (avg-of-avg ~2.1k kWh/mo) mostly land "low" and HT stations
 * (avg-of-avg ~88.5k kWh/mo) mostly land "high" under these fixed cutoffs — an
 * intentional, confirmed side effect of switching to absolute thresholds, not a bug.
 * Stations with no billing history at all get "no_data", not folded into "low".
 */
function tierForAvg(avg: number): PerformanceTier {
  if (avg < 5000) return "low";
  if (avg <= 10000) return "medium";
  return "high";
}

function computeTiers(
  stations: { unique_scno: string }[],
  billing: Map<string, { hasHistory: boolean; avgKwh: number | null }>
): Map<string, PerformanceTier> {
  const tiers = new Map<string, PerformanceTier>();
  for (const s of stations) {
    const avg = billing.get(s.unique_scno)?.avgKwh;
    tiers.set(s.unique_scno, avg == null ? "no_data" : tierForAvg(avg));
  }
  return tiers;
}

/**
 * stations.category/ownership are constant across this dataset ("C" / "Private" for
 * every row — verified against live data) and carry no signal, so the station-type
 * filter (govt bus depot / Redco / private / petrol bunk) is derived from the operator
 * name instead, which has real variety. Brand-name inference, not a verified site-type
 * field — see plan's Area C risk note re: ADANI (energy) and RELIANCE BP MOBILITY
 * operators possibly being broader energy deployments rather than literal fuel-forecourt sites.
 */
function computeCategoryBucket(operator: string | null): CategoryBucket {
  if (!operator) return "other";
  const op = operator.toUpperCase();
  if (op.includes("TGRTC")) return "govt_bus_depot";
  if (op.includes("TGREDCO")) return "redco";
  if (
    op.includes("BPCL") ||
    op.includes("IOCL") ||
    op.includes("HPCL") ||
    op.includes("ADANI") ||
    op.includes("RELIANCE BP MOBILITY")
  ) {
    return "petrol_bunk";
  }
  return "private";
}

export async function getStationMarkers(): Promise<StationMarkerRow[]> {
  const supabase = getSupabaseServerClient();
  const [{ data, error }, billing] = await Promise.all([
    supabase.from("stations").select(MARKER_COLUMNS).order("unique_scno"),
    getBillingSummary(),
  ]);
  if (error) throw error;

  const rows = data ?? [];
  const tiers = computeTiers(rows, billing);
  return rows.map((r) => ({
    ...r,
    has_history: billing.get(r.unique_scno)?.hasHistory ?? false,
    performance_tier: tiers.get(r.unique_scno) ?? "no_data",
    category_bucket: computeCategoryBucket(r.operator),
    avg_units_kwh: billing.get(r.unique_scno)?.avgKwh ?? null,
  }));
}

export async function getStationDetail(scno: string): Promise<StationDetail | null> {
  const supabase = getSupabaseServerClient();
  const { data: station, error } = await supabase
    .from("stations")
    .select(
      "unique_scno, name, station_type, status, district, location_class, discom, latitude, longitude, operator, ownership, category, seed_avg_consumption_kwh_month, seed_footfall, contracted_load_kva, cpo_brand"
    )
    .eq("unique_scno", scno)
    .maybeSingle();

  if (error) throw error;
  if (!station) return null;

  const [
    { data: chargers, error: chargersError },
    { data: billing, error: billingError },
    { data: placesCache, error: placesError },
    { data: amenities, error: amenitiesError },
  ] = await Promise.all([
    supabase
      .from("station_chargers")
      .select("id, charger_type, power_kw, count, source, is_primary")
      .eq("station_id", scno)
      .order("is_primary", { ascending: false }),
    supabase
      .from("station_billing_summary")
      .select("bill_count, avg_units_kwh, last_month_units_kwh")
      .eq("station_id", scno)
      .maybeSingle(),
    supabase.from("station_places_cache").select("rating").eq("station_id", scno).maybeSingle(),
    supabase
      .from("station_nearby_places")
      .select("id, name, category, distance_m, rating, source")
      .eq("station_id", scno)
      .order("distance_m", { ascending: true, nullsFirst: false }),
  ]);

  if (chargersError) throw chargersError;
  if (billingError) throw billingError;
  if (placesError) throw placesError;
  if (amenitiesError) throw amenitiesError;

  return {
    ...station,
    chargers: chargers ?? [],
    bill_count: billing?.bill_count ?? 0,
    avg_units_kwh: billing?.avg_units_kwh ?? null,
    last_month_units_kwh: billing?.last_month_units_kwh ?? null,
    rating: placesCache?.rating ?? null,
    amenities: amenities ?? [],
  };
}

/** Zero-external-call area search: district is a controlled vocabulary already in `stations`. */
export async function getAreaMetrics(districtQuery: string): Promise<AreaMetrics | null> {
  const supabase = getSupabaseServerClient();

  // Exact match first, then prefix, so "Suryapet" matches "SURYAPET" cleanly
  // even though the sheet stores districts upper-cased.
  const { data: exact } = await supabase
    .from("stations")
    .select(
      "unique_scno, name, station_type, status, district, location_class, discom, latitude, longitude, seed_avg_consumption_kwh_month, seed_footfall"
    )
    .ilike("district", districtQuery.trim());

  let rows = exact ?? [];
  if (!rows.length) {
    const { data: prefix } = await supabase
      .from("stations")
      .select(
        "unique_scno, name, station_type, status, district, location_class, discom, latitude, longitude, seed_avg_consumption_kwh_month, seed_footfall"
      )
      .ilike("district", `${districtQuery.trim()}%`);
    rows = prefix ?? [];
  }

  if (!rows.length) return null;

  const district = rows[0].district ?? districtQuery;
  const consumptions = rows
    .map((r) => r.seed_avg_consumption_kwh_month)
    .filter((v): v is number => v != null);
  const avg = consumptions.length
    ? consumptions.reduce((a, b) => a + b, 0) / consumptions.length
    : null;

  const footfallBreakdown: Record<string, number> = {};
  for (const r of rows) {
    const key = r.seed_footfall ?? "Unknown";
    footfallBreakdown[key] = (footfallBreakdown[key] ?? 0) + 1;
  }

  const lats = rows.map((r) => r.latitude);
  const lons = rows.map((r) => r.longitude);
  const bounds: AreaMetrics["bounds"] = rows.length
    ? [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)],
      ]
    : null;

  return {
    district,
    station_count: rows.length,
    avg_seed_consumption_kwh_month: avg,
    footfall_breakdown: footfallBreakdown,
    bounds,
    stations: rows.map((r) => ({
      unique_scno: r.unique_scno,
      name: r.name,
      station_type: r.station_type,
      status: r.status,
      district: r.district,
      location_class: r.location_class,
      discom: r.discom,
      latitude: r.latitude,
      longitude: r.longitude,
    })),
  };
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

/** Haversine radius filter, done in JS over the already-loaded marker set — fine at ~979 rows. */
export function stationsWithinRadius(
  stations: StationMarkerRow[],
  center: { lat: number; lon: number },
  radiusM: number
): StationMarkerRow[] {
  return stations.filter((s) => haversineM(center, { lat: s.latitude, lon: s.longitude }) <= radiusM);
}

/** Same filter as stationsWithinRadius, but keeps each match's distance — the nearby-analysis
 * panel fetches once at a generous max radius via this, then filters/aggregates client-side
 * as the radius slider moves, instead of refetching on every change. */
function stationsWithDistance<T extends StationMarkerRow>(
  stations: T[],
  center: { lat: number; lon: number },
  radiusM: number
): (T & { distance_m: number })[] {
  return stations
    .map((s) => ({ ...s, distance_m: haversineM(center, { lat: s.latitude, lon: s.longitude }) }))
    .filter((s) => s.distance_m <= radiusM)
    .sort((a, b) => a.distance_m - b.distance_m);
}

/**
 * Right-click "analyze nearby stations" — reuses getStationMarkers() (same
 * zero-extra-DB-call-per-request pattern as the landmark radius search), then joins
 * station_billing_summary for the matched subset. No radius-specific aggregates are
 * computed here: the panel fetches this once at a generous max radius and re-filters/
 * re-aggregates client-side as the slider moves (see lib/analysis.ts), so a radius
 * change never re-triggers this DB round trip.
 */
export async function getNearbyStations(
  lat: number,
  lon: number,
  radiusM: number
): Promise<NearbyStationsResult> {
  const supabase = getSupabaseServerClient();
  const all = await getStationMarkers();
  const matches = stationsWithDistance(all, { lat, lon }, radiusM);

  const { data: billingRows, error } = await supabase
    .from("station_billing_summary")
    .select("station_id, avg_units_kwh, last_month_units_kwh")
    .in(
      "station_id",
      matches.map((s) => s.unique_scno)
    );
  if (error) throw error;

  const billing = new Map(
    (billingRows ?? []).map((r) => [r.station_id, { avg: r.avg_units_kwh, lastMonth: r.last_month_units_kwh }])
  );

  const stations: NearbyStationWithBilling[] = matches.map((s) => ({
    ...s,
    avg_units_kwh: billing.get(s.unique_scno)?.avg ?? null,
    last_month_units_kwh: billing.get(s.unique_scno)?.lastMonth ?? null,
  }));

  return { center: { lat, lon }, stations };
}

export async function getStationFleetOperators(scno: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("station_fleet_operators")
    .select("id, operator_name, vehicle_class, fleet_size, contact_name, contact_info, notes")
    .eq("station_id", scno)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getDistrictList(): Promise<string[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("stations").select("district");
  if (error) throw error;
  const set = new Set((data ?? []).map((r) => r.district).filter(Boolean) as string[]);
  return Array.from(set).sort();
}

/**
 * Full per-station dataset for the /admin/export tool. Separate from
 * getStationMarkers() (which stays deliberately lightweight for the map's
 * every-load fetch) since this needs the billing/rating joins for every one of
 * the ~979 stations, not just the map's has_history/performance_tier summary.
 */
export async function getExportableStations(): Promise<ExportableStation[]> {
  const supabase = getSupabaseServerClient();
  const [
    { data: stationRows, error: stationsError },
    { data: billingRows, error: billingError },
    { data: ratingRows, error: ratingError },
  ] = await Promise.all([
    supabase
      .from("stations")
      .select(
        "unique_scno, name, station_type, status, district, location_class, discom, operator, cpo_brand, contracted_load_kva, latitude, longitude"
      )
      .order("unique_scno"),
    supabase.from("station_billing_summary").select("station_id, avg_units_kwh, last_month_units_kwh, bill_count"),
    supabase.from("station_places_cache").select("station_id, rating"),
  ]);
  if (stationsError) throw stationsError;
  if (billingError) throw billingError;
  if (ratingError) throw ratingError;

  const billing = new Map((billingRows ?? []).map((r) => [r.station_id, r]));
  const ratings = new Map((ratingRows ?? []).map((r) => [r.station_id, r.rating]));

  return (stationRows ?? []).map((s) => ({
    unique_scno: s.unique_scno,
    name: s.name,
    station_type: s.station_type,
    status: s.status,
    district: s.district,
    location_class: s.location_class,
    discom: s.discom,
    operator: s.operator,
    cpo_brand: s.cpo_brand,
    category_bucket: computeCategoryBucket(s.operator),
    contracted_load_kva: s.contracted_load_kva,
    avg_units_kwh: billing.get(s.unique_scno)?.avg_units_kwh ?? null,
    last_month_units_kwh: billing.get(s.unique_scno)?.last_month_units_kwh ?? null,
    bill_count: billing.get(s.unique_scno)?.bill_count ?? 0,
    rating: ratings.get(s.unique_scno) ?? null,
    latitude: s.latitude,
    longitude: s.longitude,
  }));
}
