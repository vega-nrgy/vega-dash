import type { StationAmenity } from "@/lib/types";

/** Read-only — editing lives in the map side panel (StationDetailPanel) to avoid
 * duplicating the same add/edit/delete UI in two places. */
export function AmenitiesRatingsList({
  amenities,
  rating,
}: {
  amenities: StationAmenity[];
  rating: number | null;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <div className="chapter-label">Station Rating</div>
        <span className="text-sm font-medium text-ink">
          {rating != null ? `★ ${rating.toFixed(1)} / 5` : "Not rated yet"}
        </span>
      </div>
      <p className="mb-4 font-mono text-[9.5px] text-muted-onink">
        Manually entered — not sourced from Google Places.
      </p>

      <div className="chapter-label mb-2">Amenities Nearby</div>
      {amenities.length === 0 ? (
        <p className="text-sm text-muted">No amenities entered yet.</p>
      ) : (
        <ul className="divide-y divide-hairline rounded-card border border-hairline">
          {amenities.map((a) => (
            <li key={a.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="text-ink">{a.name}</span>
              <span className="font-mono text-[10px] text-muted">
                {[a.category, a.distance_m != null ? `${a.distance_m}m` : null, a.rating != null ? `★${a.rating}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 font-mono text-[9.5px] text-muted-onink">
        Edit amenities from the station&apos;s map panel.
      </p>
    </div>
  );
}
