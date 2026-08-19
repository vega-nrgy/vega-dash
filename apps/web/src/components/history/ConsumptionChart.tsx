"use client";

import { useMemo, useState } from "react";

export interface ConsumptionPoint {
  bill_month: string;
  units_kwh: number | null;
}

interface ConsumptionChartProps {
  bills: ConsumptionPoint[]; // any order — sorted ascending internally
}

const VIEW_W = 760;
const VIEW_H = 220;
const PAD = { top: 16, right: 12, bottom: 26, left: 52 };
const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;

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

export default function ConsumptionChart({ bills }: ConsumptionChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const points = useMemo(
    () =>
      bills
        .filter((b): b is { bill_month: string; units_kwh: number } => b.units_kwh != null)
        .slice()
        .sort((a, b) => a.bill_month.localeCompare(b.bill_month)),
    [bills],
  );

  if (points.length === 0) return null;

  const maxVal = niceCeil(Math.max(...points.map((p) => p.units_kwh)));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * maxVal));

  const xStep = points.length > 1 ? PLOT_W / (points.length - 1) : 0;
  const xAt = (i: number) => PAD.left + i * xStep;
  const yAt = (v: number) => PAD.top + PLOT_H * (1 - v / maxVal);

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(p.units_kwh)}`).join(" ");
  const areaPath =
    points.length > 1
      ? `${linePath} L${xAt(points.length - 1)},${PAD.top + PLOT_H} L${xAt(0)},${PAD.top + PLOT_H} Z`
      : "";

  // Sparse x labels: a fixed tick count spread by even fractional index (not modulo), so the
  // last tick never lands a couple of indices after the previous one and collides with it.
  const tickCount = Math.min(6, points.length);
  const xLabelIdxs = Array.from(
    new Set(
      Array.from({ length: tickCount }, (_, k) =>
        Math.round((k * (points.length - 1)) / Math.max(1, tickCount - 1)),
      ),
    ),
  );

  const last = points[points.length - 1];
  const hovered = hoverIdx != null ? points[hoverIdx] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full touch-none"
        role="img"
        aria-label="Monthly consumption in kWh"
        onPointerMove={(e) => {
          if (points.length < 2) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * VIEW_W;
          const idx = Math.round((px - PAD.left) / xStep);
          setHoverIdx(Math.min(points.length - 1, Math.max(0, idx)));
        }}
        onPointerLeave={() => setHoverIdx(null)}
      >
        {/* gridlines + y labels */}
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

        {/* x labels — edge ticks anchor inward so they never clip past the viewBox */}
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

        {/* area wash */}
        {areaPath && <path d={areaPath} className="fill-mint/10" stroke="none" />}

        {/* line */}
        <path d={linePath} className="stroke-mint-deep" strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />

        {/* end marker + direct label */}
        <circle cx={xAt(points.length - 1)} cy={yAt(last.units_kwh)} r={4} className="fill-mint-deep stroke-paper" strokeWidth={2} />
        <text
          x={xAt(points.length - 1)}
          y={yAt(last.units_kwh) - 10}
          textAnchor="end"
          className="fill-ink font-mono text-[10px] font-medium"
        >
          {last.units_kwh.toLocaleString()} kWh
        </text>

        {/* hover crosshair + dot */}
        {hovered && (
          <g>
            <line
              x1={xAt(hoverIdx!)}
              x2={xAt(hoverIdx!)}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
              className="stroke-hairline"
              strokeWidth={1}
            />
            <circle
              cx={xAt(hoverIdx!)}
              cy={yAt(hovered.units_kwh)}
              r={5}
              className="fill-mint-deep stroke-paper"
              strokeWidth={2}
            />
          </g>
        )}

        {/* full-width hit area for pointer tracking */}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={PLOT_W}
          height={PLOT_H}
          fill="transparent"
          style={{ cursor: points.length > 1 ? "crosshair" : "default" }}
        />
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute top-2 -translate-x-1/2 rounded-input border border-hairline bg-paper px-2.5 py-1.5 text-xs shadow-lift"
          style={{ left: `${(xAt(hoverIdx!) / VIEW_W) * 100}%` }}
        >
          <div className="font-mono text-[9px] text-muted">{formatMonth(hovered.bill_month)}</div>
          <div className="font-medium text-ink">{hovered.units_kwh.toLocaleString()} kWh</div>
        </div>
      )}
    </div>
  );
}
