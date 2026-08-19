import { NextResponse } from "next/server";
import { getStationDetail } from "@/lib/data/stations";

export async function GET(_req: Request, ctx: RouteContext<"/api/stations/[scno]">) {
  const { scno } = await ctx.params;
  const station = await getStationDetail(scno);
  if (!station) {
    return NextResponse.json({ error: "Station not found" }, { status: 404 });
  }
  return NextResponse.json(station);
}
