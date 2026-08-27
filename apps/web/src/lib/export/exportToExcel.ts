"use client";

import type { ExportableStation } from "@/lib/types";
import { EXPORT_ATTRIBUTES } from "./attributes";

/** Client-side only, same reasoning as lib/pdf/exportReport.ts's dynamic import --
 * no server round-trip, and xlsx's parser (the part with known CVEs) never runs
 * here since we only ever write, never read, a spreadsheet. */
export async function exportStationsToExcel(
  stations: ExportableStation[],
  filename = "vega-charge-stations.xlsx"
): Promise<void> {
  const XLSX = await import("xlsx");

  const rows = stations.map((s) => {
    const row: Record<string, unknown> = {};
    for (const attr of EXPORT_ATTRIBUTES) {
      // null (common for sparsely-populated fields like cpo_brand/rating) must become
      // "" here -- json_to_sheet silently drops a column from the header entirely if
      // the FIRST row's value for that key is null/undefined, which would otherwise
      // make columns disappear or shift depending on which rows happen to be filtered in.
      row[attr.label] = s[attr.key] ?? "";
    }
    return row;
  });

  // Explicit header list, not inferred from row shape -- guarantees every column
  // always appears, in a fixed order, regardless of which rows are present.
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: EXPORT_ATTRIBUTES.map((a) => a.label) });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Stations");
  XLSX.writeFile(workbook, filename);
}
