import { NextResponse } from "next/server";
import { getExportableStations } from "@/lib/data/stations";

/** Full station dataset for the /admin/export tool. Fetched once by the page;
 * all filtering happens client-side over this array (see lib/export/attributes.ts) —
 * same "load once, filter live" pattern as the map's own filters and the
 * nearby-analysis panel, rather than a request per filter change. */
export async function GET() {
  const stations = await getExportableStations();
  return NextResponse.json({ stations });
}
