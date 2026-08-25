import L from "leaflet";
import type { StationMarkerRow } from "@/lib/types";

/** Brand marker icon — ports `.vc-marker`/`.vc-dot` from web-styles.css directly.
 * `selected` highlights the station whose side panel is currently open (see
 * DashboardShell's selectedScno) — bigger + a distinct ring, layered on top of
 * whatever base state class (ht/pending/default) already applies. */
export function stationDivIcon(station: StationMarkerRow, selected = false): L.DivIcon {
  const dotClass =
    station.status !== "EXISTING"
      ? "vc-dot pending"
      : station.station_type === "HT"
        ? "vc-dot ht"
        : "vc-dot";
  const className = selected ? `${dotClass} selected` : dotClass;
  const size = selected ? 26 : 18;
  const anchor = size / 2;

  return L.divIcon({
    className: "vc-marker",
    html: `<div class="${className}"></div>`,
    iconSize: [size, size],
    iconAnchor: [anchor, anchor],
    popupAnchor: [0, -anchor],
  });
}

export function stationPopupHtml(station: StationMarkerRow): string {
  const badge = station.station_type !== "UNKNOWN" ? ` · ${station.station_type}` : "";
  const meta = [station.district, station.location_class, station.discom]
    .filter(Boolean)
    .join(" · ");
  return `
    <div class="vc-id">${station.unique_scno}${badge}</div>
    <div class="vc-name">${escapeHtml(station.name)}</div>
    <div class="vc-meta">${escapeHtml(meta)}</div>
    <a class="vc-link" href="/?panel=station&scno=${station.unique_scno}">View details →</a>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
