import type { NearbyStationWithBilling } from "@/lib/types";

/**
 * Pure aggregate math over an already-fetched station subset — deliberately NOT
 * server-only, so the nearby-analysis panel can recompute this client-side on every
 * radius-slider tick (over a superset fetched once) instead of refetching from the
 * server on every change. See NearbyAnalysisPanel and /station/report's analysis page.
 */
export interface NearbyAggregates {
  total_last_month_units_kwh: number;
  avg_last_month_units_kwh: number | null;
  avg_units_kwh: number | null;
}

export function computeNearbyAggregates(stations: NearbyStationWithBilling[]): NearbyAggregates {
  const lastMonthValues = stations
    .map((s) => s.last_month_units_kwh)
    .filter((v): v is number => v != null);
  const avgValues = stations.map((s) => s.avg_units_kwh).filter((v): v is number => v != null);
  const totalLastMonth = lastMonthValues.reduce((a, b) => a + b, 0);

  return {
    total_last_month_units_kwh: totalLastMonth,
    avg_last_month_units_kwh: lastMonthValues.length ? totalLastMonth / lastMonthValues.length : null,
    avg_units_kwh: avgValues.length ? avgValues.reduce((a, b) => a + b, 0) / avgValues.length : null,
  };
}
