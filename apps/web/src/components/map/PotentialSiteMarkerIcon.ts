import L from "leaflet";
import type { PotentialSite } from "@/lib/types";

/** Diamond marker, distinct in shape (not just color) from the round `.vc-dot` used
 * for live stations — see globals.css `.vc-tender-marker`. Color is per-cluster
 * (`.cluster-N`) so the left panel's cluster filter and the map read consistently. */
export function potentialSiteDivIcon(site: PotentialSite): L.DivIcon {
  return L.divIcon({
    className: "vc-marker",
    html: `<div class="vc-tender-marker cluster-${site.cluster}" title="Cluster ${site.cluster}"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
  });
}

function predictedValueHtml(site: PotentialSite): string {
  if (site.predicted_score == null) {
    return `<span class="vc-tender-pending">Pending — model training in progress</span>`;
  }
  return `<span class="vc-tender-score">${site.predicted_score.toLocaleString()}</span>`;
}

export function potentialSitePopupHtml(site: PotentialSite): string {
  const totalChargers = site.chargers_2w3w + site.chargers_4w_count;
  return `
    <div class="vc-id">${site.id} · Tender Candidate</div>
    <div class="vc-name">${escapeHtml(site.name)}</div>
    <div class="vc-meta">${escapeHtml(`Cluster ${site.cluster} · Category ${site.category} · ${site.department}`)}</div>
    <div class="vc-tender-chargers">
      ${site.chargers_2w3w} × 2W/3W (12 kW) + ${site.chargers_4w_count} × 4W (${site.chargers_4w_kw} kW)
      — ${totalChargers} charger${totalChargers === 1 ? "" : "s"} total
    </div>
    <div class="vc-tender-predicted">
      <span class="chapter-label">Predicted performance</span><br />
      ${predictedValueHtml(site)}
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
