import type { ExportableStation } from "@/lib/types";

/** Deliberately NOT server-only — the /admin/export page filters and re-filters
 * this client-side over an already-fetched dataset (see the API route's comment),
 * so this needs to run in the browser. */

export type FilterOperator = "<" | ">" | "=" | "!=";

export type AttributeValueType = "number" | "string";

export interface ExportAttribute {
  key: keyof ExportableStation;
  label: string;
  type: AttributeValueType;
}

export const EXPORT_ATTRIBUTES: ExportAttribute[] = [
  { key: "unique_scno", label: "Unique SCNO", type: "string" },
  { key: "name", label: "Name", type: "string" },
  { key: "station_type", label: "Station Type (LT/HT)", type: "string" },
  { key: "status", label: "Status", type: "string" },
  { key: "district", label: "District", type: "string" },
  { key: "location_class", label: "Location Class", type: "string" },
  { key: "discom", label: "Discom", type: "string" },
  { key: "operator", label: "Operator (TSPDCL registrant)", type: "string" },
  { key: "cpo_brand", label: "CPO Brand", type: "string" },
  { key: "category_bucket", label: "Category", type: "string" },
  { key: "contracted_load_kva", label: "Contracted Load (CMD, kVA)", type: "number" },
  { key: "avg_units_kwh", label: "Average kWh/month", type: "number" },
  { key: "last_month_units_kwh", label: "Last Month Consumption (kWh)", type: "number" },
  { key: "bill_count", label: "Months of Billing History", type: "number" },
  { key: "rating", label: "Station Rating", type: "number" },
  { key: "latitude", label: "Latitude", type: "number" },
  { key: "longitude", label: "Longitude", type: "number" },
];

export function attributeByKey(key: string): ExportAttribute | undefined {
  return EXPORT_ATTRIBUTES.find((a) => a.key === key);
}

export interface FilterRow {
  id: string;
  attribute: keyof ExportableStation;
  operator: FilterOperator;
  value: string;
}

/** A filter row with an empty value never excludes anything -- lets a freshly
 * added row sit inert until the user actually types a value. */
function rowMatches(station: ExportableStation, row: FilterRow): boolean {
  if (row.value.trim() === "") return true;

  const attr = attributeByKey(row.attribute);
  const stationValue = station[row.attribute];

  if (attr?.type === "number") {
    const filterNum = Number(row.value);
    if (Number.isNaN(filterNum)) return true; // not-yet-valid input -- don't exclude everything
    if (stationValue == null) return false; // can't compare null against a number
    const num = Number(stationValue);
    switch (row.operator) {
      case "<":
        return num < filterNum;
      case ">":
        return num > filterNum;
      case "=":
        return num === filterNum;
      case "!=":
        return num !== filterNum;
    }
  }

  const filterStr = row.value.trim().toLowerCase();
  const str = stationValue == null ? "" : String(stationValue).toLowerCase();
  switch (row.operator) {
    case "<":
      return str < filterStr;
    case ">":
      return str > filterStr;
    case "=":
      return str === filterStr;
    case "!=":
      return str !== filterStr;
  }
}

/** All rows must match (AND) -- matches the user's own example
 * ("Average KWH > 10000 and last month consumption > 8000"). */
export function applyFilters(stations: ExportableStation[], rows: FilterRow[]): ExportableStation[] {
  if (rows.length === 0) return stations;
  return stations.filter((s) => rows.every((row) => rowMatches(s, row)));
}
