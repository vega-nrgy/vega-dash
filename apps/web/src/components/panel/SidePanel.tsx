"use client";

import type { PanelState } from "@/lib/types";
import { StationDetailPanel } from "./panels/StationDetailPanel";
import { AreaMetricsPanel } from "./panels/AreaMetricsPanel";
import { LandmarkRadiusPanel } from "./panels/LandmarkRadiusPanel";
import { PredictNewSitePanel } from "./panels/PredictNewSitePanel";
import { NearbyAnalysisPanel } from "./panels/NearbyAnalysisPanel";

interface SidePanelProps {
  panel: PanelState;
  onClose: () => void;
  onSelectStation: (scno: string) => void;
  onRadiusChange: (radiusM: number) => void;
  onNearbyRadiusPreview: (radiusM: number) => void;
  onNearbyRadiusCommit: (radiusM: number) => void;
  predictCoords: { lat: number; lon: number } | null;
  onPredictCoordsChange: (lat: number, lon: number) => void;
  /** Single-level "came from" panel — set only when a station was opened from within
   * a list-bearing panel (area/landmark/nearby-analysis). See DashboardShell. */
  previousPanel: PanelState | null;
  onBack: () => void;
}

export function SidePanel({
  panel,
  onClose,
  onSelectStation,
  onRadiusChange,
  onNearbyRadiusPreview,
  onNearbyRadiusCommit,
  predictCoords,
  onPredictCoordsChange,
  previousPanel,
  onBack,
}: SidePanelProps) {
  const open = panel.type !== "none";

  return (
    <aside
      className={`absolute right-0 top-0 z-[1000] h-full w-full max-w-md transform border-l border-hairline bg-paper shadow-lift transition-transform duration-200 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {panel.type === "station" && (
        <StationDetailPanel
          key={panel.scno}
          scno={panel.scno}
          onClose={onClose}
          previousPanel={previousPanel}
          onBack={onBack}
        />
      )}
      {panel.type === "area" && (
        <AreaMetricsPanel
          key={panel.district}
          district={panel.district}
          onClose={onClose}
          onSelectStation={onSelectStation}
        />
      )}
      {panel.type === "landmark" && (
        <LandmarkRadiusPanel
          key={panel.query}
          query={panel.query}
          lat={panel.lat}
          lon={panel.lon}
          radiusM={panel.radiusM}
          onRadiusChange={onRadiusChange}
          onClose={onClose}
          onSelectStation={onSelectStation}
        />
      )}
      {panel.type === "predict-new-site" && (
        <PredictNewSitePanel
          key={`${panel.lat}-${panel.lon}`}
          lat={predictCoords?.lat ?? panel.lat}
          lon={predictCoords?.lon ?? panel.lon}
          onCoordsChange={onPredictCoordsChange}
          onClose={onClose}
        />
      )}
      {panel.type === "nearby-analysis" && (
        <NearbyAnalysisPanel
          key={`${panel.lat}-${panel.lon}`}
          lat={panel.lat}
          lon={panel.lon}
          radiusM={panel.radiusM}
          onRadiusPreview={onNearbyRadiusPreview}
          onRadiusCommit={onNearbyRadiusCommit}
          onClose={onClose}
          onSelectStation={onSelectStation}
        />
      )}
    </aside>
  );
}
