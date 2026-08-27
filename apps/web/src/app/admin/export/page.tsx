"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ExportableStation } from "@/lib/types";
import {
  EXPORT_ATTRIBUTES,
  applyFilters,
  type FilterOperator,
  type FilterRow,
} from "@/lib/export/attributes";
import { exportStationsToExcel } from "@/lib/export/exportToExcel";

const OPERATORS: FilterOperator[] = ["<", ">", "=", "!="];

let nextRowId = 0;
function newRow(): FilterRow {
  return { id: `r${nextRowId++}`, attribute: "avg_units_kwh", operator: ">", value: "" };
}

export default function ExportPage() {
  const [stations, setStations] = useState<ExportableStation[] | null>(null);
  const [rows, setRows] = useState<FilterRow[]>([newRow()]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetch("/api/export/stations")
      .then((res) => res.json())
      .then((data) => setStations(data.stations ?? []));
  }, []);

  const filtered = useMemo(() => applyFilters(stations ?? [], rows), [stations, rows]);

  const updateRow = (id: string, patch: Partial<FilterRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="mx-auto min-h-screen max-w-6xl bg-paper px-6 py-10">
      <Link href="/" className="font-mono text-xs text-mint-deep hover:underline">
        ← Back to map
      </Link>

      <h1 className="vc-name mt-4 text-2xl">Dump to Excel</h1>
      <p className="vc-meta">
        Filter stations by any attribute, then export the resulting table as a real .xlsx file.
      </p>

      <div className="mt-6 space-y-2">
        {rows.map((row) => {
          const attr = EXPORT_ATTRIBUTES.find((a) => a.key === row.attribute)!;
          return (
            <div key={row.id} className="flex items-center gap-2">
              <select
                value={row.attribute}
                onChange={(e) => updateRow(row.id, { attribute: e.target.value as FilterRow["attribute"] })}
                className="rounded-input border border-border bg-white px-2 py-1.5 text-sm"
              >
                {EXPORT_ATTRIBUTES.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
              </select>
              <select
                value={row.operator}
                onChange={(e) => updateRow(row.id, { operator: e.target.value as FilterOperator })}
                className="rounded-input border border-border bg-white px-2 py-1.5 text-sm font-mono"
              >
                {OPERATORS.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
              <input
                type={attr.type === "number" ? "number" : "text"}
                value={row.value}
                onChange={(e) => updateRow(row.id, { value: e.target.value })}
                placeholder="Value"
                className="w-40 rounded-input border border-border bg-white px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                aria-label="Remove filter"
                className="rounded-full p-1 text-muted hover:bg-grey-soft"
              >
                ✕
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, newRow()])}
          className="rounded-input border border-dashed border-border px-3 py-1.5 text-xs font-medium text-mint-deep hover:bg-grey-soft"
        >
          + Add filter
        </button>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div className="font-mono text-[10px] text-muted">
          {stations == null
            ? "Loading stations…"
            : `Showing ${filtered.length.toLocaleString()} of ${stations.length.toLocaleString()} stations`}
        </div>
        <button
          type="button"
          onClick={async () => {
            setExporting(true);
            try {
              await exportStationsToExcel(filtered);
            } finally {
              setExporting(false);
            }
          }}
          disabled={exporting || filtered.length === 0}
          className="rounded-input border border-mint-deep bg-mint-deep px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {exporting ? "Generating…" : "Download Excel ↓"}
        </button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-card border border-hairline">
        <table className="w-full min-w-max text-left text-xs">
          <thead>
            <tr className="border-b border-hairline bg-grey-soft">
              {EXPORT_ATTRIBUTES.map((a) => (
                <th key={a.key} className="whitespace-nowrap px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-onink">
                  {a.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.unique_scno} className="border-b border-hairline hover:bg-grey-soft">
                {EXPORT_ATTRIBUTES.map((a) => (
                  <td key={a.key} className="whitespace-nowrap px-3 py-2 text-ink">
                    {formatCell(s[a.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {stations != null && filtered.length === 0 && (
          <p className="p-4 text-sm text-muted">No stations match these filters.</p>
        )}
      </div>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}
