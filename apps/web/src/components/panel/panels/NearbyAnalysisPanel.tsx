"use client";

import { useEffect, useMemo, useState } from "react";
import type { NearbyStationWithBilling } from "@/lib/types";
import { computeNearbyAggregates } from "@/lib/analysis";
import { Tooltip } from "@/components/ui/Tooltip";

const RADIUS_MIN = 500;
const RADIUS_MAX = 10000;
const RADIUS_STEP = 250;

export function NearbyAnalysisPanel({
  lat,
  lon,
  radiusM,
  onRadiusPreview,
  onRadiusCommit,
  onClose,
  onSelectStation,
}: {
  lat: number;
  lon: number;
  /** Committed radius — the one the URL/report link and the station list/aggregates key
   * off. Only changes on slider release, not on every drag tick (see onRadiusCommit). */
  radiusM: number;
  /** Fires on every drag tick — cheap, local-only feedback (drives the map circle and this
   * panel's own slider position/label), never touches the URL so dragging can't trigger a
   * router.push (and the app re-render that comes with it) on every pixel of movement. */
  onRadiusPreview: (radiusM: number) => void;
  /** Fires once on release — this is what actually updates the URL/panel state, which is
   * what the station list below and the "Detailed Report" link are keyed on. */
  onRadiusCommit: (radiusM: number) => void;
  onClose: () => void;
  onSelectStation: (scno: string) => void;
}) {
  // Fetched once per center point at RADIUS_MAX — every candidate the slider could ever
  // reach. Moving the slider afterward is a pure client-side filter/aggregate (see
  // useMemo below), not a new request, so it's instant instead of re-fetching on every tick.
  const [allNearby, setAllNearby] = useState<NearbyStationWithBilling[] | null>(null);
  // Tracks which center point `allNearby` was resolved for, so `loading` can be derived
  // during render instead of set imperatively inside the effect — same pattern as
  // LandmarkRadiusPanel/StationDetailPanel.
  const [resolvedFor, setResolvedFor] = useState<string | null>(null);
  const centerKey = `${lat},${lon}`;
  const loading = resolvedFor !== centerKey;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/analysis/radius?lat=${lat}&lon=${lon}&radiusM=${RADIUS_MAX}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setAllNearby(data.stations ?? []);
        setResolvedFor(centerKey);
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lon, centerKey]);

  // The slider's own displayed position/label track every drag tick locally (smooth, no
  // lag). Adjusted during render (not an effect — avoids an extra cascading render) when
  // the committed radiusM changes from something other than this component's own commit,
  // e.g. browser back/forward navigation.
  const [sliderValue, setSliderValue] = useState(radiusM);
  const [lastCommittedRadiusM, setLastCommittedRadiusM] = useState(radiusM);
  if (radiusM !== lastCommittedRadiusM) {
    setLastCommittedRadiusM(radiusM);
    setSliderValue(radiusM);
  }

  const commit = () => onRadiusCommit(sliderValue);

  // Station list/aggregates deliberately key off the COMMITTED radiusM, not sliderValue —
  // "in range" and the totals only update once the drag settles, per the same reasoning
  // as the circle-vs-list split above.
  const stations = useMemo(
    () => (allNearby ?? []).filter((s) => s.distance_m <= radiusM),
    [allNearby, radiusM]
  );
  const aggregates = useMemo(() => computeNearbyAggregates(stations), [stations]);

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="chapter-label">Nearby Station Analysis</div>
          <h2 className="vc-name">
            {lat.toFixed(4)}, {lon.toFixed(4)}
          </h2>
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

      <div className="mt-5">
        <label className="chapter-label mb-2 block">
          Radius: {(sliderValue / 1000).toFixed(1)} km
        </label>
        <input
          type="range"
          min={RADIUS_MIN}
          max={RADIUS_MAX}
          step={RADIUS_STEP}
          value={sliderValue}
          onChange={(e) => {
            const v = Number(e.target.value);
            setSliderValue(v);
            onRadiusPreview(v);
          }}
          onMouseUp={commit}
          onTouchEnd={commit}
          onKeyUp={commit}
          className="w-full accent-mint"
        />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-card border border-hairline bg-grey-soft p-4">
          <div className="chapter-label">Stations in range</div>
          <div className="mt-1 text-2xl font-semibold text-ink">
            {loading ? "…" : stations.length}
          </div>
        </div>
        <div className="rounded-card border border-hairline bg-grey-soft p-4">
          <div className="chapter-label">Total last month</div>
          <div className="mt-1 text-xl font-semibold text-ink">
            {loading ? "…" : `${Math.round(aggregates.total_last_month_units_kwh).toLocaleString()} kWh`}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <ul className="divide-y divide-hairline">
          {stations.map((s) => (
            <li key={s.unique_scno}>
              <button
                onClick={() => onSelectStation(s.unique_scno)}
                className="flex w-full items-center justify-between py-2.5 text-left hover:bg-grey-soft"
              >
                <div>
                  <div className="vc-id">{s.unique_scno}</div>
                  <div className="text-sm font-medium text-ink">{s.name}</div>
                </div>
                <div className="text-right font-mono text-[10px] text-muted">
                  <div>
                    {s.last_month_units_kwh != null
                      ? `${Math.round(s.last_month_units_kwh).toLocaleString()} kWh last mo.`
                      : "—"}
                  </div>
                  <div>
                    {s.avg_units_kwh != null
                      ? `${Math.round(s.avg_units_kwh).toLocaleString()} kWh avg.`
                      : "—"}
                  </div>
                </div>
              </button>
            </li>
          ))}
          {!loading && stations.length === 0 && (
            <p className="py-4 text-sm text-muted">No stations within this radius.</p>
          )}
        </ul>
      </div>

      <a
        href={`/analysis/report?lat=${lat}&lon=${lon}&radiusM=${radiusM}`}
        target="_blank"
        rel="noopener noreferrer"
        className="vc-link mt-6 text-center"
      >
        Detailed Report ↗
      </a>
    </div>
  );
}
