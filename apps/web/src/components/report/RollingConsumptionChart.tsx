"use client";

import { useMemo, useState } from "react";

export interface ConsumptionPoint {
  bill_month: string;
  units_kwh: number | null;
}

interface RollingConsumptionChartProps {
  bills: ConsumptionPoint[]; // any order — sorted ascending internally
}

const VIEW_W = 760;
const VIEW_H = 240;
const PAD = { top: 16, right: 12, bottom: 26, left: 52 };
const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;

const SERIES = [
  { key: "raw", label: "Monthly units", className: "stroke-mint-deep", fill: "fill-mint-deep" },
  { key: "ma3", label: "3-mo rolling avg", className: "stroke-ink", fill: "fill-ink" },
  { key: "ma6", label: "6-mo rolling avg", className: "stroke-muted", fill: "fill-muted" },
] as const;

function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 2, 2.5, 5, 10];
  for (const step of steps) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

function formatMonth(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

/** Trailing rolling average ending at index i — null until `window` leading points exist. */
function rollingAverage(values: number[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    let sum = 0;
    for (let j = i - window + 1; j <= i; j++) sum += values[j];
    return sum / window;
  });
}

export default function RollingConsumptionChart({ bills }: RollingConsumptionChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const points = useMemo(
    () =>
      bills
        .filter((b): b is { bill_month: string; units_kwh: number } => b.units_kwh != null)
        .slice()
        .sort((a, b) => a.bill_month.localeCompare(b.bill_month)),
    [bills],
  );

  const { ma3, ma6 } = useMemo(() => {
    const raw = points.map((p) => p.units_kwh);
    return { ma3: rollingAverage(raw, 3), ma6: rollingAverage(raw, 6) };
  }, [points]);

  if (points.length === 0) return null;

  const allValues = [
    ...points.map((p) => p.units_kwh),
    ...ma3.filter((v): v is number => v != null),
    ...ma6.filter((v): v is number => v != null),
  ];
  const maxVal = niceCeil(Math.max(...allValues));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * maxVal));

  const xStep = points.length > 1 ? PLOT_W / (points.length - 1) : 0;
  const xAt = (i: number) => PAD.left + i * xStep;
  const yAt = (v: number) => PAD.top + PLOT_H * (1 - v / maxVal);

  const pathFor = (values: (number | null)[]) => {
    let d = "";
    let started = false;
    values.forEach((v, i) => {
      if (v == null) {
        started = false;
        return;
      }
      d += `${started ? "L" : "M"}${xAt(i)},${yAt(v)} `;
      started = true;
    });
    return d.trim();
  };

  const rawPath = pathFor(points.map((p) => p.units_kwh));
  const ma3Path = pathFor(ma3);
  const ma6Path = pathFor(ma6);

  const tickCount = Math.min(6, points.length);
  const xLabelIdxs = Array.from(
    new Set(
      Array.from({ length: tickCount }, (_, k) =>
        Math.round((k * (points.length - 1)) / Math.max(1, tickCount - 1)),
      ),
    ),
  );

  const hoveredIdx = hoverIdx;

  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap gap-3">
        {SERIES.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
            <span className={`inline-block h-2 w-2 rounded-full ${s.fill}`} />
            {s.label}
          </div>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full touch-none"
        role="img"
        aria-label="Monthly consumption with 3- and 6-month rolling averages"
        onPointerMove={(e) => {
          if (points.length < 2) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * VIEW_W;
          const idx = Math.round((px - PAD.left) / xStep);
          setHoverIdx(Math.min(points.length - 1, Math.max(0, idx)));
        }}
        onPointerLeave={() => setHoverIdx(null)}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={VIEW_W - PAD.right}
              y1={yAt(t)}
              y2={yAt(t)}
              className="stroke-hairline"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={yAt(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted font-mono text-[9px]"
            >
              {t.toLocaleString()}
            </text>
          </g>
        ))}

        {xLabelIdxs.map((i) => (
          <text
            key={i}
            x={xAt(i)}
            y={VIEW_H - 8}
            textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
            className="fill-muted font-mono text-[9px]"
          >
            {formatMonth(points[i].bill_month)}
          </text>
        ))}

        <path d={ma6Path} className="stroke-muted" strokeWidth={1.5} fill="none" strokeDasharray="3 3" />
        <path d={ma3Path} className="stroke-ink" strokeWidth={1.5} fill="none" strokeDasharray="5 2" />
        <path d={rawPath} className="stroke-mint-deep" strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />

        {hoveredIdx != null && (
          <g>
            <line
              x1={xAt(hoveredIdx)}
              x2={xAt(hoveredIdx)}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
              className="stroke-hairline"
              strokeWidth={1}
            />
            {points[hoveredIdx].units_kwh != null && (
              <circle cx={xAt(hoveredIdx)} cy={yAt(points[hoveredIdx].units_kwh)} r={4} className="fill-mint-deep stroke-paper" strokeWidth={2} />
            )}
            {ma3[hoveredIdx] != null && (
              <circle cx={xAt(hoveredIdx)} cy={yAt(ma3[hoveredIdx]!)} r={3.5} className="fill-ink stroke-paper" strokeWidth={2} />
            )}
            {ma6[hoveredIdx] != null && (
              <circle cx={xAt(hoveredIdx)} cy={yAt(ma6[hoveredIdx]!)} r={3.5} className="fill-muted stroke-paper" strokeWidth={2} />
            )}
          </g>
        )}

        <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H} fill="transparent" style={{ cursor: points.length > 1 ? "crosshair" : "default" }} />
      </svg>

      {hoveredIdx != null && (
        <div
          className="pointer-events-none absolute top-2 -translate-x-1/2 rounded-input border border-hairline bg-paper px-2.5 py-1.5 text-xs shadow-lift"
          style={{ left: `${(xAt(hoveredIdx) / VIEW_W) * 100}%` }}
        >
          <div className="font-mono text-[9px] text-muted">{formatMonth(points[hoveredIdx].bill_month)}</div>
          <div className="font-medium text-ink">{points[hoveredIdx].units_kwh.toLocaleString()} kWh</div>
          {ma3[hoveredIdx] != null && (
            <div className="text-ink">3mo avg: {Math.round(ma3[hoveredIdx]!).toLocaleString()} kWh</div>
          )}
          {ma6[hoveredIdx] != null && (
            <div className="text-muted">6mo avg: {Math.round(ma6[hoveredIdx]!).toLocaleString()} kWh</div>
          )}
        </div>
      )}
    </div>
  );
}
