"use client";

import { useEffect, useState } from "react";
import type { AreaMetrics } from "@/lib/types";
import { SeedDataNotice } from "@/components/ui/Badge";
import { Tooltip } from "@/components/ui/Tooltip";

export function AreaMetricsPanel({
  district,
  onClose,
  onSelectStation,
}: {
  district: string;
  onClose: () => void;
  onSelectStation: (scno: string) => void;
}) {
  const [metrics, setMetrics] = useState<AreaMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // district is this component's `key` upstream (see SidePanel), so a
    // change always remounts with fresh initial state.
    let cancelled = false;
    fetch(`/api/search?q=${encodeURIComponent(district)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.resolvedAs === "area" && data.matches) {
          setMetrics({
            district: data.district,
            station_count: data.matches.length,
            avg_seed_consumption_kwh_month:
              data.areaMetrics?.avg_seed_consumption_kwh_month ?? null,
            footfall_breakdown: data.areaMetrics?.footfall_breakdown ?? {},
            bounds: data.areaMetrics?.bounds ?? null,
            stations: data.matches,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [district]);

  if (loading) {
    return <div className="p-6 font-mono text-xs text-muted">Loading area…</div>;
  }

  if (!metrics) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted">No stations found for “{district}”.</p>
        <button onClick={onClose} className="mt-3 text-xs text-mint-deep underline">
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="chapter-label">Area</div>
          <h2 className="vc-name">{metrics.district}</h2>
        </div>
        <Tooltip label="Close panel">
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="rounded-full p-1 text-muted hover:bg-grey-soft"
          >
            ✕
          </button>
        </Tooltip>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <StatTile label="Stations" value={metrics.station_count.toString()} />
        <StatTile
          label="Avg. Consumption"
          value={
            metrics.avg_seed_consumption_kwh_month != null
              ? `${Math.round(metrics.avg_seed_consumption_kwh_month).toLocaleString()} kWh/mo`
              : "—"
          }
        />
      </div>
      <SeedDataNotice className="mt-2" />

      <div className="mt-6">
        <div className="chapter-label mb-2">Stations in {metrics.district}</div>
        <ul className="divide-y divide-hairline">
          {metrics.stations.map((s) => (
            <li key={s.unique_scno}>
              <button
                onClick={() => onSelectStation(s.unique_scno)}
                className="w-full py-2.5 text-left hover:bg-grey-soft"
              >
                <div className="vc-id">{s.unique_scno}</div>
                <div className="text-sm font-medium text-ink">{s.name}</div>
              </button>
            </li>
          ))}
        </ul>
      </div>
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
