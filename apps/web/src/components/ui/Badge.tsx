import type { StationType } from "@/lib/types";

export function StationTypeBadge({ type }: { type: StationType }) {
  if (type === "UNKNOWN") {
    return (
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-onink">
        Type TBD
      </span>
    );
  }
  const isHt = type === "HT";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] ${
        isHt ? "bg-ink text-mint" : "bg-mint-deep text-paper"
      }`}
    >
      {type}
    </span>
  );
}

export function SeedDataNotice({ className = "" }: { className?: string }) {
  return (
    <p className={`font-mono text-[9.5px] text-muted-onink ${className}`}>
      Estimated — placeholder value, not real consumption data.
    </p>
  );
}
