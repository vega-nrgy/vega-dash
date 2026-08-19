import { Suspense } from "react";
import { getStationMarkers } from "@/lib/data/stations";
import { DashboardShell } from "@/components/DashboardShell";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const stations = await getStationMarkers();

  return (
    <Suspense fallback={null}>
      <DashboardShell stations={stations} />
    </Suspense>
  );
}
