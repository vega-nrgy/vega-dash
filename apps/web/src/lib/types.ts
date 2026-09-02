export type StationType = "HT" | "LT" | "UNKNOWN";
export type LocationClass = "HIGHWAY" | "CITY";

/**
 * Fixed global thresholds on avg. real billed monthly kWh: low <5000, medium
 * [5000,10000], high >10000 — not per-station_type, so LT stations skew low and
 * HT stations skew high by construction (see computeTiers in lib/data/stations.ts).
 * "no_data" means no monthly_bills rows exist for the station yet, not zero consumption.
 */
export type PerformanceTier = "high" | "medium" | "low" | "no_data";

/**
 * Derived from stations.operator (category/ownership are constant/uninformative in
 * this dataset — see computeCategoryBucket). "other" covers unmapped/null operators.
 */
export type CategoryBucket = "govt_bus_depot" | "redco" | "petrol_bunk" | "private" | "other";

/**
 * Lightweight row used for map markers — keep this small, ~979 rows ship on every
 * load. has_history/performance_tier are optional because only getStationMarkers()
 * (the map's feed) populates them; other StationMarkerRow producers (search matches,
 * area metrics) don't need the extra billing-summary query.
 */
export interface StationMarkerRow {
  unique_scno: string;
  name: string;
  station_type: StationType;
  status: string | null;
  district: string | null;
  location_class: LocationClass | null;
  discom: string | null;
  latitude: number;
  longitude: number;
  has_history?: boolean;
  performance_tier?: PerformanceTier;
  category_bucket?: CategoryBucket;
  /** Avg. billed kWh/month — the same value performance_tier is bucketed from.
   * Shipped alongside the tier so the custom performance range filter (see
   * MapFilters) can compare against it directly instead of just the tier bucket. */
  avg_units_kwh?: number | null;
}

export interface StationCharger {
  id: number;
  charger_type: string;
  power_kw: number | null;
  count: number;
  source: "excel_parsed" | "places_enrichment" | "manual";
  is_primary: boolean;
}

/** One row of a predict-new-site charger config, e.g. "1 x 240 kW" — see PredictNewSitePanel. */
export interface PredictedCharger {
  label: string;
  count: number;
  power_kw: number;
}

export interface PredictCoords {
  lat: number;
  lon: number;
}

export interface StationAmenity {
  id: number;
  name: string;
  category: string | null;
  distance_m: number | null;
  rating: number | null;
  source: "manual" | "google_places";
}

export interface FleetOperator {
  id: number;
  operator_name: string;
  vehicle_class: string | null;
  fleet_size: number | null;
  contact_name: string | null;
  contact_info: string | null;
  notes: string | null;
}

export interface NearestHighway {
  ref: string | null;
  name: string | null;
  distance_m: number;
}

export interface StationDetail extends StationMarkerRow {
  operator: string | null;
  ownership: string | null;
  category: string | null;
  seed_avg_consumption_kwh_month: number | null;
  seed_footfall: string | null;
  chargers: StationCharger[];
  contracted_load_kva: number | null;
  avg_units_kwh: number | null;
  last_month_units_kwh: number | null;
  bill_count: number;
  rating: number | null;
  amenities: StationAmenity[];
  /** Consumer-facing CPO brand (e.g. "Statiq"), distinct from `operator` (the raw
   * TSPDCL registrant, e.g. "SHARIFY SERVICES PVT LTD") — see migration 0012.
   * Only ever set via manual approval in /admin/cpo-matches, never auto-applied. */
  cpo_brand: string | null;
}

/** A proposed CPO-brand match awaiting review — see /admin/cpo-matches. */
export interface CpoMatchProposal {
  id: number;
  distance_m: number;
  status: "pending" | "approved" | "rejected";
  stations: {
    unique_scno: string;
    name: string;
    operator: string | null;
    cpo_brand: string | null;
    district: string | null;
    latitude: number;
    longitude: number;
  };
  external_cpo_stations: {
    name: string;
    address: string | null;
    latitude: number;
    longitude: number;
    source: string;
  };
}

/** Full per-station row for the /admin/export "dump to Excel" tool — flat and
 * numeric-friendly by design so filter comparisons and the exported spreadsheet
 * columns are 1:1 with this shape. See lib/export/attributes.ts. */
export interface ExportableStation {
  unique_scno: string;
  name: string;
  station_type: StationType;
  status: string | null;
  district: string | null;
  location_class: LocationClass | null;
  discom: string | null;
  operator: string | null;
  cpo_brand: string | null;
  category_bucket: CategoryBucket;
  contracted_load_kva: number | null;
  avg_units_kwh: number | null;
  last_month_units_kwh: number | null;
  bill_count: number;
  rating: number | null;
  latitude: number;
  longitude: number;
}

export interface AreaMetrics {
  district: string;
  station_count: number;
  avg_seed_consumption_kwh_month: number | null;
  footfall_breakdown: Record<string, number>;
  bounds: [[number, number], [number, number]] | null;
  stations: StationMarkerRow[];
}

export interface NearbyStationWithBilling extends StationMarkerRow {
  avg_units_kwh: number | null;
  last_month_units_kwh: number | null;
  distance_m: number;
}

/**
 * No radius/aggregates baked in — this is the raw candidate set, fetched once at a
 * generous max radius. Callers filter by distance_m and compute aggregates on demand
 * (see lib/analysis.ts's computeNearbyAggregates) so a radius-slider change never
 * needs a new fetch.
 */
export interface NearbyStationsResult {
  center: { lat: number; lon: number };
  stations: NearbyStationWithBilling[];
}

export interface LandmarkSearchResult {
  query: string;
  center: { lat: number; lon: number };
  display_name: string;
}

export type PanelState =
  | { type: "none" }
  | { type: "station"; scno: string }
  | {
      type: "area";
      district: string;
      bounds?: [[number, number], [number, number]];
    }
  | { type: "landmark"; query: string; lat: number; lon: number; radiusM: number }
  | { type: "predict-new-site"; lat: number; lon: number }
  | { type: "nearby-analysis"; lat: number; lon: number; radiusM: number };

export interface MapFilters {
  stationType: "all" | "LT" | "HT";
  history: "all" | "has" | "none";
  tier: "all" | PerformanceTier;
  categoryBucket: "all" | CategoryBucket;
  /** Custom performance range, on top of the fixed tier chips above -- both empty
   * strings by default (no filter). String, not number, so an input can sit
   * momentarily empty/invalid while typing without forcing a value. Compared
   * against avg_units_kwh with strict > / < (not >=/<=), per how it was asked for. */
  performanceMin: string;
  performanceMax: string;
}

export const DEFAULT_MAP_FILTERS: MapFilters = {
  stationType: "all",
  history: "all",
  tier: "all",
  categoryBucket: "all",
  performanceMin: "",
  performanceMax: "",
};

export type SearchResolvedAs = "id" | "area" | "name" | "landmark" | "none";

export interface SearchResponse {
  resolvedAs: SearchResolvedAs;
  scno?: string;
  district?: string;
  matches?: StationMarkerRow[];
  landmark?: LandmarkSearchResult;
  areaMetrics?: {
    avg_seed_consumption_kwh_month: number | null;
    footfall_breakdown: Record<string, number>;
    bounds: AreaMetrics["bounds"];
  };
}
