"use client";

import { useState } from "react";
import type { PredictedCharger } from "@/lib/types";
import { Tooltip } from "@/components/ui/Tooltip";

const DEFAULT_CHARGERS: PredictedCharger[] = [{ label: "", count: 1, power_kw: 60 }];

function summarizeChargers(chargers: PredictedCharger[]): string {
  return chargers
    .filter((c) => c.count > 0 && c.power_kw > 0)
    .map((c) => `${c.count} × ${c.power_kw} kW${c.label ? ` ${c.label}` : ""}`)
    .join(" + ");
}

/**
 * Right-click "predict new site" panel. The UI/form ships now; submission is
 * an honest stub until Phase 4 (real training data + model) — see plan §4
 * `site_predictions.status='stub_no_model'` and §8 Phase 4.
 *
 * lat/lon are editable and stay in sync with the draggable map marker
 * (StationMap's predictMarker) via onCoordsChange — both write into
 * DashboardShell's local predictCoords state, never the URL, so editing here
 * never re-triggers a map fly-to (see DashboardShell for the full rationale).
 */
export function PredictNewSitePanel({
  lat,
  lon,
  onCoordsChange,
  onClose,
}: {
  lat: number;
  lon: number;
  onCoordsChange: (lat: number, lon: number) => void;
  onClose: () => void;
}) {
  const [chargers, setChargers] = useState<PredictedCharger[]>(DEFAULT_CHARGERS);
  const [contractedLoad, setContractedLoad] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const updateCharger = (i: number, patch: Partial<PredictedCharger>) => {
    setChargers((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  };

  const totalKw = chargers.reduce((sum, c) => sum + c.count * c.power_kw, 0);
  const totalCount = chargers.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="chapter-label">Predict New Site</div>
          <h2 className="vc-name">Candidate location</h2>
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

      {!submitted ? (
        <form
          className="mt-6 space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setSubmitting(true);
            try {
              await fetch("/api/predict", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  lat,
                  lon,
                  chargers: chargers.filter((c) => c.count > 0 && c.power_kw > 0),
                  contractedLoadKva: contractedLoad ? Number(contractedLoad) : undefined,
                }),
              });
            } finally {
              setSubmitting(false);
              setSubmitted(true);
            }
          }}
        >
          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <label className="chapter-label">Coordinates</label>
              <Tooltip label="Or drag the marker on the map">
                <span className="cursor-help text-[10px] text-muted-onink" aria-hidden>
                  ⓘ
                </span>
              </Tooltip>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-muted">
                Latitude
                <input
                  type="number"
                  step="0.00001"
                  value={lat}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (Number.isFinite(v)) onCoordsChange(v, lon);
                  }}
                  className="mt-0.5 w-full rounded-input border border-border bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="text-[11px] text-muted">
                Longitude
                <input
                  type="number"
                  step="0.00001"
                  value={lon}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (Number.isFinite(v)) onCoordsChange(lat, v);
                  }}
                  className="mt-0.5 w-full rounded-input border border-border bg-white px-3 py-2 text-sm"
                />
              </label>
            </div>
          </div>

          <div>
            <label className="chapter-label mb-1 block">Charger Configuration</label>
            <div className="space-y-2">
              {chargers.map((c, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    value={c.count}
                    onChange={(e) => updateCharger(i, { count: Math.max(1, Number(e.target.value)) })}
                    aria-label="Charger count"
                    className="w-14 rounded-input border border-border bg-white px-2 py-1.5 text-sm"
                  />
                  <span className="text-xs text-muted">×</span>
                  <input
                    type="number"
                    min={1}
                    value={c.power_kw}
                    onChange={(e) => updateCharger(i, { power_kw: Math.max(1, Number(e.target.value)) })}
                    aria-label="Charger power in kW"
                    className="w-20 rounded-input border border-border bg-white px-2 py-1.5 text-sm"
                  />
                  <span className="text-xs text-muted">kW</span>
                  <input
                    type="text"
                    value={c.label}
                    onChange={(e) => updateCharger(i, { label: e.target.value })}
                    placeholder="type (optional)"
                    aria-label="Charger type label"
                    className="min-w-0 flex-1 rounded-input border border-border bg-white px-2 py-1.5 text-sm placeholder:text-muted-onink"
                  />
                  <Tooltip label="Remove charger">
                    <button
                      type="button"
                      onClick={() => setChargers((prev) => prev.filter((_, idx) => idx !== i))}
                      disabled={chargers.length === 1}
                      aria-label="Remove charger"
                      className="rounded-full p-1 text-muted hover:bg-grey-soft disabled:opacity-30"
                    >
                      ✕
                    </button>
                  </Tooltip>
                </div>
              ))}
            </div>
            <Tooltip label="Add another charger row" side="right">
              <button
                type="button"
                onClick={() =>
                  setChargers((prev) => [...prev, { label: "", count: 1, power_kw: 60 }])
                }
                className="mt-2 rounded-input border border-dashed border-border px-3 py-1.5 text-xs font-medium text-mint-deep hover:bg-grey-soft"
              >
                + Add charger
              </button>
            </Tooltip>
            {totalCount > 0 && (
              <p className="mt-2 font-mono text-[10px] text-muted">
                {summarizeChargers(chargers)} — {totalCount} charger{totalCount === 1 ? "" : "s"}, {totalKw.toLocaleString()} kW total
              </p>
            )}
          </div>

          <div>
            <label className="chapter-label mb-1 block">Contracted Load (kVA)</label>
            <input
              type="number"
              value={contractedLoad}
              onChange={(e) => setContractedLoad(e.target.value)}
              placeholder="e.g. 60"
              className="w-full rounded-input border border-border bg-white px-3 py-2 text-sm"
            />
          </div>

          <button type="submit" disabled={submitting} className="vc-link w-full text-center disabled:opacity-60">
            {submitting ? "Submitting…" : "Predict Performance →"}
          </button>
        </form>
      ) : (
        <div className="mt-6 rounded-card border border-hairline bg-grey-soft p-4">
          <p className="text-sm font-medium text-ink">Prediction service not yet available</p>
          <p className="mt-2 text-sm text-muted">
            This feature depends on real consumption history that hasn&apos;t been collected
            yet (Phase 2/4 of the build). Your request has been recorded — once a model is
            trained, this panel will return a predicted performance estimate for this location
            with the configuration you entered.
          </p>
        </div>
      )}
    </div>
  );
}
