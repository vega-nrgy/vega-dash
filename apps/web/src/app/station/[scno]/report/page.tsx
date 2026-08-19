import Link from "next/link";
import { notFound } from "next/navigation";
import { getStationDetail, getStationFleetOperators } from "@/lib/data/stations";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { findNearestNationalHighway } from "@/lib/geo/overpass";
import { StationTypeBadge, SeedDataNotice } from "@/components/ui/Badge";
import RollingConsumptionChart from "@/components/report/RollingConsumptionChart";
import { AmenitiesRatingsList } from "@/components/report/AmenitiesRatingsList";
import { FleetOperatorsSection } from "@/components/report/FleetOperatorsSection";
import { ReportPdfButton } from "@/components/report/ReportPdfButton";

export const dynamic = "force-dynamic";

export default async function StationReportPage(props: PageProps<"/station/[scno]/report">) {
  const { scno } = await props.params;
  const station = await getStationDetail(scno);
  if (!station) notFound();

  const supabase = getSupabaseServerClient();
  const [{ data: bills }, fleetOperators, highway] = await Promise.all([
    supabase
      .from("monthly_bills")
      .select("bill_month, units_kwh")
      .eq("station_id", scno)
      .order("bill_month", { ascending: false }),
    getStationFleetOperators(scno),
    findNearestNationalHighway(scno, station.latitude, station.longitude),
  ]);

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-paper px-6 py-10">
      <div className="flex items-center justify-between">
        <Link href="/" className="font-mono text-xs text-mint-deep hover:underline">
          ← Back to map
        </Link>
        <ReportPdfButton elementId="report-content" filename={`${station.unique_scno}-report.pdf`} />
      </div>

      <div id="report-content" className="mt-4 bg-paper">
        <div className="flex items-start justify-between">
          <div>
            <div className="vc-id flex items-center gap-2">
              {station.unique_scno}
              <StationTypeBadge type={station.station_type} />
            </div>
            <h1 className="vc-name text-2xl">{station.name}</h1>
            <p className="vc-meta">
              {[station.district, station.location_class, station.discom].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>

        <section className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <ReportStat label="Nearest highway" value={formatHighway(highway)} />
          <ReportStat label="Nearest city / area" value={station.district ?? "—"} />
          <ReportStat label="Charge point operator" value={station.cpo_brand ?? station.operator ?? "—"} />
          <ReportStat
            label="Contracted Load (CMD)"
            value={station.contracted_load_kva != null ? `${station.contracted_load_kva} kVA` : "—"}
          />
        </section>

        <section className="mt-8">
          <div className="chapter-label mb-2">Consumption History</div>
          {!bills || bills.length === 0 ? (
            <div className="rounded-card border border-hairline bg-grey-soft p-5">
              <p className="text-sm text-ink">
                No billing history has been ingested for this station yet.
              </p>
              <div className="mt-4 border-t border-hairline pt-4">
                <div className="text-sm text-muted">
                  Estimated consumption (placeholder, from station listing):{" "}
                  <span className="font-medium text-ink">
                    {station.seed_avg_consumption_kwh_month != null
                      ? `${Math.round(station.seed_avg_consumption_kwh_month).toLocaleString()} kWh/mo`
                      : "—"}
                  </span>
                </div>
                <SeedDataNotice className="mt-1" />
              </div>
            </div>
          ) : (
            <div className="rounded-card border border-hairline bg-white p-4">
              <RollingConsumptionChart bills={bills} />
            </div>
          )}
        </section>

        <section className="mt-8">
          <div className="chapter-label mb-2">Charger Configuration</div>
          {station.chargers.length === 0 ? (
            <p className="text-sm text-muted">No charger data parsed yet.</p>
          ) : (
            <ul className="space-y-2">
              {station.chargers.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-input border border-hairline px-3 py-2 text-sm"
                >
                  <span>{c.charger_type}</span>
                  <span className="font-mono text-xs text-muted">
                    {c.power_kw ? `${c.power_kw} kW` : ""} × {c.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <AmenitiesRatingsList amenities={station.amenities} rating={station.rating} />
        </section>

        <section className="mt-8">
          <FleetOperatorsSection scno={station.unique_scno} initialFleetOperators={fleetOperators} />
        </section>
      </div>
    </div>
  );
}

function formatHighway(highway: { ref: string | null; name: string | null; distance_m: number } | null): string {
  if (!highway || (!highway.ref && !highway.name)) return "No National Highway found nearby";
  const label = [highway.ref, highway.name].filter(Boolean).join(" — ");
  return `${label} (${(highway.distance_m / 1000).toFixed(1)} km)`;
}

function ReportStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-hairline bg-grey-soft p-3">
      <div className="chapter-label">{label}</div>
      <div className="mt-1 text-sm font-medium text-ink">{value}</div>
    </div>
  );
}
