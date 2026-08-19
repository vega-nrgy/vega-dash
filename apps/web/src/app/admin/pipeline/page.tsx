import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PipelineStatusPage() {
  const supabase = getSupabaseServerClient();

  const { data: batches } = await supabase
    .from("ingestion_batches")
    .select("id, started_at, finished_at, stations_processed, errors_count, status")
    .order("started_at", { ascending: false })
    .limit(20);

  const { count: stationCount } = await supabase
    .from("stations")
    .select("*", { count: "exact", head: true });

  const { count: billCount } = await supabase
    .from("monthly_bills")
    .select("*", { count: "exact", head: true });

  const { count: predictionCount } = await supabase
    .from("site_predictions")
    .select("*", { count: "exact", head: true });

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-paper px-6 py-10">
      <Link href="/" className="font-mono text-xs text-mint-deep hover:underline">
        ← Back to map
      </Link>

      <h1 className="vc-name mt-4 text-2xl">Pipeline Status</h1>
      <p className="vc-meta">Data-as-of visibility into ingestion and prediction activity.</p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <StatTile label="Stations" value={(stationCount ?? 0).toString()} />
        <StatTile label="Bill Records" value={(billCount ?? 0).toString()} />
        <StatTile label="Site Predictions" value={(predictionCount ?? 0).toString()} />
      </div>

      <section className="mt-8">
        <div className="chapter-label mb-2">Ingestion Batches</div>
        {!batches || batches.length === 0 ? (
          <p className="text-sm text-muted">No ingestion batches recorded yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-hairline text-muted-onink">
                <th className="py-2 font-mono text-[10px] uppercase tracking-[0.1em]">Started</th>
                <th className="py-2 font-mono text-[10px] uppercase tracking-[0.1em]">Status</th>
                <th className="py-2 font-mono text-[10px] uppercase tracking-[0.1em]">Processed</th>
                <th className="py-2 font-mono text-[10px] uppercase tracking-[0.1em]">Errors</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-b border-hairline">
                  <td className="py-2">{new Date(b.started_at).toLocaleString()}</td>
                  <td className="py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${
                        b.status === "completed"
                          ? "bg-mint-deep text-paper"
                          : b.status === "failed"
                            ? "bg-ink text-mint"
                            : "bg-grey-soft text-muted"
                      }`}
                    >
                      {b.status}
                    </span>
                  </td>
                  <td className="py-2 font-mono text-xs">{b.stations_processed}</td>
                  <td className="py-2 font-mono text-xs">{b.errors_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-hairline bg-grey-soft p-4">
      <div className="chapter-label">{label}</div>
      <div className="mt-1 text-xl font-semibold text-ink">{value}</div>
    </div>
  );
}
