import { NextResponse } from "next/server";
import { getStationMarkers, stationsWithinRadius } from "@/lib/data/stations";

/** Radius slider re-query for landmark search — stays server-side, no external calls. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const lat = parseFloat(params.get("lat") ?? "");
  const lon = parseFloat(params.get("lon") ?? "");
  const radiusM = parseFloat(params.get("radiusM") ?? "");

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(radiusM)) {
    return NextResponse.json({ error: "lat, lon, radiusM are required" }, { status: 400 });
  }

  const all = await getStationMarkers();
  const matches = stationsWithinRadius(all, { lat, lon }, radiusM);
  return NextResponse.json({ matches });
}
