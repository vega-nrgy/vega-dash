"use client";

/** Small choice menu shown at the cursor on map right-click — lets the user pick
 * between the two right-click actions instead of one always winning. See
 * DashboardShell's contextMenu state and StationMap's onContextMenu prop. */
export function RightClickMenu({
  x,
  y,
  onPredictNewSite,
  onAnalyzeNearby,
}: {
  x: number;
  y: number;
  onPredictNewSite: () => void;
  onAnalyzeNearby: () => void;
}) {
  return (
    <div
      className="absolute z-[1100] w-56 rounded-card border border-hairline bg-paper py-1 shadow-lift"
      style={{ left: x, top: y }}
    >
      <button
        type="button"
        onClick={onPredictNewSite}
        className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-grey-soft"
      >
        Predict new site
      </button>
      <button
        type="button"
        onClick={onAnalyzeNearby}
        className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-grey-soft"
      >
        Analyze nearby stations
      </button>
    </div>
  );
}
