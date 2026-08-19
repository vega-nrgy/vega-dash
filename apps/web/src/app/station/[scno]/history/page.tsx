import Link from "next/link";
import { notFound } from "next/navigation";
import { getStationDetail } from "@/lib/data/stations";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { StationTypeBadge, SeedDataNotice } from "@/components/ui/Badge";
import ConsumptionChart from "@/components/history/ConsumptionChart";

export const dynamic = "force-dynamic";

export default async function StationHistoryPage(props: PageProps<"/station/[scno]/history">) {
  const { scno } = await props.params;
  const station = await getStationDetail(scno);
  if (!station) notFound();

  const supabase = getSupabaseServerClient();
  const { data: bills } = await supabase
    .from("monthly_bills")
    .select("bill_month, units_kwh, source")
    .eq("station_id", scno)
    .order("bill_month", { ascending: false });

  const { data: nearby } = await supabase
    .from("station_nearby_places")
    .select("name, category, distance_m")
    .eq("station_id", scno)
    .order("distance_m");

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-paper px-6 py-10">
      <Link href="/" className="font-mono text-xs text-mint-deep hover:underline">
        ← Back to map
      </Link>

      <div className="mt-4 flex items-start justify-between">
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

      <section className="mt-8">
        <div className="chapter-label mb-2">Consumption History</div>
        {!bills || bills.length === 0 ? (
          <div className="rounded-card border border-hairline bg-grey-soft p-5">
            <p className="text-sm text-ink">
              No billing history has been ingested for this station yet.
            </p>
            <p className="mt-2 text-sm text-muted">
              This depends on the scraping/PDF-parsing pipeline (Phase 2 of the build), which
              hasn&apos;t run for this station yet. Once bills are ingested, this section shows
              a monthly consumption chart instead of the estimate below.
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
          <>
            <div className="rounded-card border border-hairline bg-white p-4">
              <ConsumptionChart bills={bills} />
            </div>
            <ul className="mt-4 divide-y divide-hairline rounded-card border border-hairline">
              {bills.map((b) => (
                <li key={b.bill_month} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-ink">{b.bill_month}</span>
                  <span className="font-mono text-xs text-muted">
                    {b.units_kwh != null ? `${b.units_kwh} kWh` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </>
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
        <div className="chapter-label mb-2">Nearby Landmarks &amp; Restaurants</div>
        {!nearby || nearby.length === 0 ? (
          <p className="text-sm text-muted">
            No Places enrichment data yet — this feature is gated behind Google Places API
            approval (Phase 3 of the build).
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {nearby.map((n, i) => (
              <li key={i} className="flex justify-between">
                <span>{n.name}</span>
                <span className="text-muted">{n.distance_m ? `${Math.round(n.distance_m)}m` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
