import { NextResponse } from "next/server";
import { getStationMarkers } from "@/lib/data/stations";

export async function GET() {
  const stations = await getStationMarkers();
  return NextResponse.json(stations);
}
