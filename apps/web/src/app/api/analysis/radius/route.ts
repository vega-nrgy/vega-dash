import { NextResponse } from "next/server";
import { getNearbyStations } from "@/lib/data/stations";

/** Right-click "analyze nearby stations" radius query. Kept separate from
 * /api/search/radius (the landmark-search flow) since this one joins billing
 * data and feeds a different panel/report — see NearbyAnalysisPanel.
 *
 * `radiusM` here is the MAX radius to fetch candidates within, not necessarily the
 * slider's current value — the panel calls this once per center point at its max
 * slider value and re-filters/re-aggregates client-side as the slider moves, so a
 * radius change never re-triggers this request. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const lat = parseFloat(params.get("lat") ?? "");
  const lon = parseFloat(params.get("lon") ?? "");
  const radiusM = parseFloat(params.get("radiusM") ?? "");

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(radiusM)) {
    return NextResponse.json({ error: "lat, lon, radiusM are required" }, { status: 400 });
  }

  const result = await getNearbyStations(lat, lon, radiusM);
  return NextResponse.json(result);
}
