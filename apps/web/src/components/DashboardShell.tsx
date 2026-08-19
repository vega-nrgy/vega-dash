"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SideNav } from "@/components/nav/SideNav";
import { SearchBar } from "@/components/search/SearchBar";
import { SidePanel } from "@/components/panel/SidePanel";
import { RightClickMenu } from "@/components/map/RightClickMenu";
import { TutorialTour } from "@/components/tutorial/TutorialTour";
import { DEFAULT_MAP_FILTERS, type MapFilters, type PanelState, type SearchResponse, type StationMarkerRow } from "@/lib/types";
import type { MapFocus } from "@/components/map/StationMap";

// Leaflet touches `window` at import time — must be client-only, no SSR.
const StationMap = dynamic(() => import("@/components/map/StationMap"), { ssr: false });

const DEFAULT_RADIUS_M = 2000;
// Deliberately different from DEFAULT_RADIUS_M (landmark search) — the user asked
// for nearby-station-analysis to default to a wider 5km radius.
const NEARBY_DEFAULT_RADIUS_M = 5000;

export function DashboardShell({ stations }: { stations: StationMarkerRow[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<MapFilters>(DEFAULT_MAP_FILTERS);

  const panel = useMemo<PanelState>(() => parsePanelState(searchParams), [searchParams]);

  const filteredStations = useMemo(
    () =>
      stations.filter((s) => {
        if (filters.stationType !== "all" && s.station_type !== filters.stationType) return false;
        if (filters.history === "has" && !s.has_history) return false;
        if (filters.history === "none" && s.has_history) return false;
        if (filters.tier !== "all" && s.performance_tier !== filters.tier) return false;
        if (filters.categoryBucket !== "all" && s.category_bucket !== filters.categoryBucket) return false;
        return true;
      }),
    [stations, filters]
  );

  const setPanel = useCallback(
    (next: PanelState) => {
      const params = new URLSearchParams();
      if (next.type === "station") {
        params.set("panel", "station");
        params.set("scno", next.scno);
      } else if (next.type === "area") {
        params.set("panel", "area");
        params.set("district", next.district);
        if (next.bounds) {
          params.set(
            "bounds",
            `${next.bounds[0][0]},${next.bounds[0][1]},${next.bounds[1][0]},${next.bounds[1][1]}`
          );
        }
      } else if (next.type === "landmark") {
        params.set("panel", "landmark");
        params.set("q", next.query);
        params.set("lat", String(next.lat));
        params.set("lon", String(next.lon));
        params.set("radiusM", String(next.radiusM));
      } else if (next.type === "predict-new-site") {
        params.set("panel", "predict-new-site");
        params.set("lat", String(next.lat));
        params.set("lon", String(next.lon));
      } else if (next.type === "nearby-analysis") {
        params.set("panel", "nearby-analysis");
        params.set("lat", String(next.lat));
        params.set("lon", String(next.lon));
        params.set("radiusM", String(next.radiusM));
      }
      const qs = params.toString();
      router.push(qs ? `/?${qs}` : "/", { scroll: false });
    },
    [router]
  );

  // predictCoords is deliberately NOT URL state — it's the live, editable candidate
  // point (drag the marker or type into the panel's lat/lon inputs). panel.lat/lon
  // (URL-backed) only records where the right-click that opened this session
  // happened, and `focus` below is derived from panel/URL only — so editing
  // coordinates never re-triggers a map fly-to, and panning the map never changes
  // the coordinates. See StationMap's predictMarker effect for the other half.
  const [predictCoords, setPredictCoords] = useState<{ lat: number; lon: number } | null>(null);

  // Live drag value for the nearby-analysis radius slider — deliberately NOT URL state,
  // same rationale as predictCoords above: the slider fires on every drag tick, and
  // routing that straight into router.push (URL update -> full app re-render) is what
  // caused the drag lag. This drives the map's radius circle live; the committed
  // panel.radiusM (which the station list/aggregates and report link key off) only
  // updates once, on release — see handleNearbyRadiusCommit.
  const [nearbyRadiusPreview, setNearbyRadiusPreview] = useState<number | null>(null);

  const closePanel = useCallback(() => {
    setPanel({ type: "none" });
    setPredictCoords(null);
    setNearbyRadiusPreview(null);
  }, [setPanel]);

  const handleSelectStation = useCallback(
    (scno: string) => setPanel({ type: "station", scno }),
    [setPanel]
  );

  const handleRightClick = useCallback(
    (lat: number, lon: number) => {
      setPredictCoords({ lat, lon });
      setPanel({ type: "predict-new-site", lat, lon });
    },
    [setPanel]
  );

  const handleAnalyzeNearby = useCallback(
    (lat: number, lon: number) => {
      setNearbyRadiusPreview(null);
      setPanel({ type: "nearby-analysis", lat, lon, radiusM: NEARBY_DEFAULT_RADIUS_M });
    },
    [setPanel]
  );

  const handlePredictCoordsChange = useCallback((lat: number, lon: number) => {
    setPredictCoords({ lat, lon });
  }, []);

  const handleRadiusChange = useCallback(
    (radiusM: number) => {
      if (panel.type !== "landmark") return;
      setPanel({ ...panel, radiusM });
    },
    [panel, setPanel]
  );

  const handleNearbyRadiusPreview = useCallback((radiusM: number) => {
    setNearbyRadiusPreview(radiusM);
  }, []);

  const handleNearbyRadiusCommit = useCallback(
    (radiusM: number) => {
      setNearbyRadiusPreview(null);
      if (panel.type !== "nearby-analysis") return;
      setPanel({ ...panel, radiusM });
    },
    [panel, setPanel]
  );

  // Right-click choice menu — set on every map right-click; picking an option (or
  // dismissing) clears it. Deliberately NOT auto-wired to Predict New Site anymore —
  // that only happens once the user explicitly picks it from the menu.
  const [contextMenu, setContextMenu] = useState<{ lat: number; lon: number; x: number; y: number } | null>(
    null
  );

  const handleContextMenu = useCallback(
    (lat: number, lon: number, containerPoint: { x: number; y: number }) => {
      setContextMenu({ lat, lon, x: containerPoint.x, y: containerPoint.y });
    },
    []
  );

  useEffect(() => {
    if (!contextMenu) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [contextMenu]);

  const handleSearchResolved = useCallback(
    (result: SearchResponse) => {
      if (result.resolvedAs === "id" && (result.scno || result.matches?.length === 1)) {
        setPanel({ type: "station", scno: result.scno ?? result.matches![0].unique_scno });
        return;
      }
      if (result.resolvedAs === "area" && result.district) {
        setPanel({
          type: "area",
          district: result.district,
          bounds: result.areaMetrics?.bounds ?? undefined,
        });
        return;
      }
      if (result.resolvedAs === "name" && result.matches?.length === 1) {
        setPanel({ type: "station", scno: result.matches[0].unique_scno });
        return;
      }
      if (result.resolvedAs === "landmark" && result.landmark) {
        setPanel({
          type: "landmark",
          query: result.landmark.query,
          lat: result.landmark.center.lat,
          lon: result.landmark.center.lon,
          radiusM: DEFAULT_RADIUS_M,
        });
        return;
      }
      // Multiple ID/name matches with no single obvious target: leave the
      // panel closed, the matches are already visible/clustered on the map.
    },
    [setPanel]
  );

  const focus = useMemo((): MapFocus | null => {
    if (panel.type === "landmark" || panel.type === "predict-new-site" || panel.type === "nearby-analysis") {
      return { kind: "point", lat: panel.lat, lon: panel.lon, zoom: 14 };
    }
    if (panel.type === "station") {
      const s = stations.find((st) => st.unique_scno === panel.scno);
      // No forced zoom — just re-center at whatever zoom the map is already at
      // (see StationMap's flyTo effect, which falls back to map.getZoom()).
      if (s) return { kind: "point", lat: s.latitude, lon: s.longitude };
    }
    if (panel.type === "area" && panel.bounds) {
      return { kind: "bounds", bounds: panel.bounds };
    }
    return null;
  }, [panel, stations]);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <SideNav
        filters={filters}
        onFiltersChange={setFilters}
        visibleCount={filteredStations.length}
        totalCount={stations.length}
      />
      <div className="relative flex-1">
        <StationMap
          stations={filteredStations}
          onSelectStation={handleSelectStation}
          onContextMenu={handleContextMenu}
          focus={focus}
          panel={panel}
          predictMarker={panel.type === "predict-new-site" ? predictCoords : null}
          onPredictMarkerDrag={handlePredictCoordsChange}
          radiusCircle={
            panel.type === "nearby-analysis"
              ? { lat: panel.lat, lon: panel.lon, radiusM: nearbyRadiusPreview ?? panel.radiusM }
              : null
          }
        />
        <div className="absolute left-4 top-4 z-[999] w-full max-w-md">
          <SearchBar onResolved={handleSearchResolved} />
        </div>
        <TutorialTour />
        {contextMenu && (
          <>
            <div
              className="absolute inset-0 z-[1099]"
              onClick={() => setContextMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu(null);
              }}
            />
            <RightClickMenu
              x={contextMenu.x}
              y={contextMenu.y}
              onPredictNewSite={() => {
                handleRightClick(contextMenu.lat, contextMenu.lon);
                setContextMenu(null);
              }}
              onAnalyzeNearby={() => {
                handleAnalyzeNearby(contextMenu.lat, contextMenu.lon);
                setContextMenu(null);
              }}
            />
          </>
        )}
        <SidePanel
          panel={panel}
          onClose={closePanel}
          onSelectStation={handleSelectStation}
          onRadiusChange={handleRadiusChange}
          onNearbyRadiusPreview={handleNearbyRadiusPreview}
          onNearbyRadiusCommit={handleNearbyRadiusCommit}
          predictCoords={predictCoords}
          onPredictCoordsChange={handlePredictCoordsChange}
        />
      </div>
    </div>
  );
}

function parsePanelState(params: URLSearchParams): PanelState {
  const type = params.get("panel");
  if (type === "station") {
    const scno = params.get("scno");
    if (scno) return { type: "station", scno };
  }
  if (type === "area") {
    const district = params.get("district");
    const boundsRaw = params.get("bounds");
    let bounds: [[number, number], [number, number]] | undefined;
    if (boundsRaw) {
      const parts = boundsRaw.split(",").map(Number);
      if (parts.length === 4 && parts.every(Number.isFinite)) {
        bounds = [
          [parts[0], parts[1]],
          [parts[2], parts[3]],
        ];
      }
    }
    if (district) return { type: "area", district, bounds };
  }
  if (type === "landmark") {
    const q = params.get("q");
    const lat = parseFloat(params.get("lat") ?? "");
    const lon = parseFloat(params.get("lon") ?? "");
    const radiusM = parseFloat(params.get("radiusM") ?? String(DEFAULT_RADIUS_M));
    if (q && Number.isFinite(lat) && Number.isFinite(lon)) {
      return { type: "landmark", query: q, lat, lon, radiusM };
    }
  }
  if (type === "predict-new-site") {
    const lat = parseFloat(params.get("lat") ?? "");
    const lon = parseFloat(params.get("lon") ?? "");
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return { type: "predict-new-site", lat, lon };
    }
  }
  if (type === "nearby-analysis") {
    const lat = parseFloat(params.get("lat") ?? "");
    const lon = parseFloat(params.get("lon") ?? "");
    const radiusM = parseFloat(params.get("radiusM") ?? String(NEARBY_DEFAULT_RADIUS_M));
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return { type: "nearby-analysis", lat, lon, radiusM };
    }
  }
  return { type: "none" };
}
