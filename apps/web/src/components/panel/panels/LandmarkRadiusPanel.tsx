"use client";

import { useEffect, useState } from "react";
import type { StationMarkerRow } from "@/lib/types";
import { Tooltip } from "@/components/ui/Tooltip";

const RADIUS_MIN = 500;
const RADIUS_MAX = 10000;
const RADIUS_STEP = 250;

export function LandmarkRadiusPanel({
  query,
  lat,
  lon,
  radiusM,
  onRadiusChange,
  onClose,
  onSelectStation,
}: {
  query: string;
  lat: number;
  lon: number;
  radiusM: number;
  onRadiusChange: (radiusM: number) => void;
  onClose: () => void;
  onSelectStation: (scno: string) => void;
}) {
  const [matches, setMatches] = useState<StationMarkerRow[] | null>(null);
  // Tracks which params `matches` was resolved for, so `loading` can be
  // derived during render instead of set imperatively inside the effect.
  const [resolvedFor, setResolvedFor] = useState<string | null>(null);
  const paramsKey = `${lat},${lon},${radiusM}`;
  const loading = resolvedFor !== paramsKey;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/search/radius?lat=${lat}&lon=${lon}&radiusM=${radiusM}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setMatches(data.matches ?? []);
        setResolvedFor(paramsKey);
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lon, radiusM, paramsKey]);

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="chapter-label">Landmark</div>
          <h2 className="vc-name">{query}</h2>
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
          Radius: {(radiusM / 1000).toFixed(1)} km
        </label>
        <input
          type="range"
          min={RADIUS_MIN}
          max={RADIUS_MAX}
          step={RADIUS_STEP}
          value={radiusM}
          onChange={(e) => onRadiusChange(Number(e.target.value))}
          className="w-full accent-mint"
        />
      </div>

      <div className="mt-5 rounded-card border border-hairline bg-grey-soft p-4">
        <div className="chapter-label">Stations in range</div>
        <div className="mt-1 text-2xl font-semibold text-ink">
          {loading ? "…" : (matches?.length ?? 0)}
        </div>
      </div>

      <div className="mt-6">
        <ul className="divide-y divide-hairline">
          {matches?.map((s) => (
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
          {matches && matches.length === 0 && !loading && (
            <p className="py-4 text-sm text-muted">No stations within this radius.</p>
          )}
        </ul>
      </div>
    </div>
  );
}
