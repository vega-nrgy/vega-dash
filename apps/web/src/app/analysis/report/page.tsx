import Link from "next/link";
import { getNearbyStations } from "@/lib/data/stations";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { computeNearbyAggregates } from "@/lib/analysis";
import { SeedDataNotice } from "@/components/ui/Badge";
import { ReportPdfButton } from "@/components/report/ReportPdfButton";

export const dynamic = "force-dynamic";

export default async function AnalysisReportPage({
  searchParams,
}: {
  searchParams: Promise<{ lat?: string; lon?: string; radiusM?: string }>;
}) {
  const params = await searchParams;
  const lat = parseFloat(params.lat ?? "");
  const lon = parseFloat(params.lon ?? "");
  const radiusM = parseFloat(params.radiusM ?? "");

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(radiusM)) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-muted">Missing or invalid lat/lon/radiusM.</p>
      </div>
    );
  }

  const { stations } = await getNearbyStations(lat, lon, radiusM);
  const aggregates = computeNearbyAggregates(stations);
  const scnos = stations.map((s) => s.unique_scno);

  const supabase = getSupabaseServerClient();
  const [{ data: amenities }, { data: seedFootfall }] = await Promise.all([
    scnos.length
      ? supabase
          .from("station_nearby_places")
          .select("station_id, name, category, rating")
          .in("station_id", scnos)
      : Promise.resolve({ data: [] as { station_id: string; name: string; category: string | null; rating: number | null }[] }),
    scnos.length
      ? supabase.from("stations").select("unique_scno, seed_footfall").in("unique_scno", scnos)
      : Promise.resolve({ data: [] as { unique_scno: string; seed_footfall: string | null }[] }),
  ]);

  const amenitiesByStation = new Map<string, { name: string; category: string | null; rating: number | null }[]>();
  for (const a of amenities ?? []) {
    const list = amenitiesByStation.get(a.station_id) ?? [];
    list.push({ name: a.name, category: a.category, rating: a.rating });
    amenitiesByStation.set(a.station_id, list);
  }
  const footfallByStation = new Map((seedFootfall ?? []).map((s) => [s.unique_scno, s.seed_footfall]));

  const totalLastMonth = aggregates.total_last_month_units_kwh;

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-paper px-6 py-10">
      <div className="flex items-center justify-between">
        <Link href="/" className="font-mono text-xs text-mint-deep hover:underline">
          ← Back to map
        </Link>
        <ReportPdfButton elementId="report-content" filename="nearby-station-analysis.pdf" />
      </div>

      <div id="report-content" className="mt-4 bg-paper">
        <div className="chapter-label">Nearby Station Analysis</div>
        <h1 className="vc-name text-2xl">
          {lat.toFixed(4)}, {lon.toFixed(4)} — {(radiusM / 1000).toFixed(1)} km radius
        </h1>

        <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <ReportStat label="Stations" value={String(stations.length)} />
          <ReportStat label="Total last month" value={`${Math.round(totalLastMonth).toLocaleString()} kWh`} />
          <ReportStat
            label="Avg. last month/station"
            value={
              aggregates.avg_last_month_units_kwh != null
                ? `${Math.round(aggregates.avg_last_month_units_kwh).toLocaleString()} kWh`
                : "—"
            }
          />
          <ReportStat
            label="Avg. monthly (all-time)"
            value={aggregates.avg_units_kwh != null ? `${Math.round(aggregates.avg_units_kwh).toLocaleString()} kWh` : "—"}
          />
        </section>

        <section className="mt-8">
          <div className="chapter-label mb-2">Per-Station Detail</div>
          <p className="mb-3 font-mono text-[9.5px] text-muted-onink">
            Footfall is not tracked numerically yet — seed_footfall is a placeholder category
            label, not a measurable count, so no aggregate or share is computed from it.
          </p>
          <ul className="divide-y divide-hairline rounded-card border border-hairline">
            {stations.map((s) => {
              const share =
                totalLastMonth > 0 && s.last_month_units_kwh != null
                  ? (s.last_month_units_kwh / totalLastMonth) * 100
                  : null;
              const stationAmenities = amenitiesByStation.get(s.unique_scno) ?? [];
              return (
                <li key={s.unique_scno} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="vc-id">{s.unique_scno}</div>
                      <div className="font-medium text-ink">{s.name}</div>
                    </div>
                    <div className="text-right font-mono text-[10px] text-muted">
                      <div>
                        {s.last_month_units_kwh != null
                          ? `${Math.round(s.last_month_units_kwh).toLocaleString()} kWh last mo.`
                          : "—"}
                      </div>
                      <div>{share != null ? `${share.toFixed(0)}% of area consumption` : "—"}</div>
                      <div>
                        {s.avg_units_kwh != null ? `${Math.round(s.avg_units_kwh).toLocaleString()} kWh avg.` : "—"}
                      </div>
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 font-mono text-[9.5px] text-muted-onink">
                    <span>Seed footfall: {footfallByStation.get(s.unique_scno) ?? "—"}</span>
                    {stationAmenities.length > 0 && (
                      <span>
                        Amenities:{" "}
                        {stationAmenities
                          .map((a) => `${a.name}${a.rating != null ? ` (★${a.rating})` : ""}`)
                          .join(", ")}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
            {stations.length === 0 && (
              <li className="px-4 py-4 text-sm text-muted">No stations within this radius.</li>
            )}
          </ul>
        </section>
        <SeedDataNotice className="mt-3" />
      </div>
    </div>
  );
}

function ReportStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-hairline bg-grey-soft p-3">
      <div className="chapter-label">{label}</div>
      <div className="mt-1 text-sm font-medium text-ink">{value}</div>
    </div>
  );
}
