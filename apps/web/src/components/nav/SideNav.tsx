"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { MapFilters } from "@/lib/types";
import { Tooltip } from "@/components/ui/Tooltip";
import { SignOutButton } from "@/components/nav/SignOutButton";

const NAV_ITEMS = [
  { label: "Map", href: "/", icon: "🗺" },
  { label: "Pipeline", href: "/admin/pipeline", icon: "⚙" },
  { label: "CPO Matches", href: "/admin/cpo-matches", icon: "🔗" },
  { label: "Dump to Excel", href: "/admin/export", icon: "⬇" },
];

interface Chip<T extends string> {
  value: T;
  label: string;
}

const STATION_TYPE_CHIPS: Chip<MapFilters["stationType"]>[] = [
  { value: "all", label: "All" },
  { value: "LT", label: "LT" },
  { value: "HT", label: "HT" },
];

const HISTORY_CHIPS: Chip<MapFilters["history"]>[] = [
  { value: "all", label: "All" },
  { value: "has", label: "Has data" },
  { value: "none", label: "No data" },
];

const TIER_CHIPS: Chip<MapFilters["tier"]>[] = [
  { value: "all", label: "All" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "no_data", label: "No data" },
];

const CATEGORY_CHIPS: Chip<MapFilters["categoryBucket"]>[] = [
  { value: "all", label: "All" },
  { value: "govt_bus_depot", label: "Govt. Bus Depot" },
  { value: "redco", label: "Redco" },
  { value: "petrol_bunk", label: "Petrol Bunk" },
  { value: "private", label: "Private" },
  { value: "other", label: "Other" },
];

/** PM E Drive tender candidate sites (ANNEXURE-IV) shown as a separate map overlay —
 * see DashboardShell's potentialSiteFilters and StationMap's potentialSites layer.
 * Independent of MapFilters: this toggles/filters an overlay, not the live stations. */
export interface PotentialSiteFilters {
  visible: boolean;
  clusters: number[];
}

/** Matches `.vc-tender-marker.cluster-N` in globals.css, so the chip dot and the
 * marker on the map are the same color for a given cluster. */
const CLUSTER_COLORS: Record<number, string> = {
  1: "#f2994a",
  2: "#eb5757",
  3: "#2f80ed",
  4: "#9b51e0",
  5: "#d4a900",
};

const CLUSTERS = [1, 2, 3, 4, 5];

function ChipGroup<T extends string>({
  chips,
  value,
  onChange,
}: {
  chips: Chip<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((chip) => {
        const active = chip.value === value;
        return (
          <button
            key={chip.value}
            type="button"
            onClick={() => onChange(chip.value)}
            aria-pressed={active}
            className={`rounded-input border px-2 py-1 text-[11px] font-medium transition-colors ${
              active
                ? "border-mint-deep bg-mint-deep text-white"
                : "border-hairline bg-paper text-muted hover:bg-grey-soft"
            }`}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}

interface SideNavProps {
  filters: MapFilters;
  onFiltersChange: (filters: MapFilters) => void;
  visibleCount: number;
  totalCount: number;
  potentialSiteFilters: PotentialSiteFilters;
  onPotentialSiteFiltersChange: (filters: PotentialSiteFilters) => void;
  potentialSiteVisibleCount: number;
  potentialSiteTotalCount: number;
}

export function SideNav({
  filters,
  onFiltersChange,
  visibleCount,
  totalCount,
  potentialSiteFilters,
  onPotentialSiteFiltersChange,
  potentialSiteVisibleCount,
  potentialSiteTotalCount,
}: SideNavProps) {
  const [collapsed, setCollapsed] = useState(false);

  const hasActiveFilters =
    filters.stationType !== "all" ||
    filters.history !== "all" ||
    filters.tier !== "all" ||
    filters.categoryBucket !== "all" ||
    filters.performanceMin !== "" ||
    filters.performanceMax !== "";

  return (
    <nav
      className={`relative z-[1000] flex h-full flex-col overflow-y-auto border-r border-hairline bg-paper transition-[width] duration-200 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <div className="flex h-16 shrink-0 items-center justify-between px-4">
        {!collapsed && (
          <Image src="/vega-charge-logo.svg" alt="Vega Charge" width={120} height={32} priority />
        )}
        {collapsed && (
          <Image src="/vega-charge-icon.svg" alt="Vega Charge" width={24} height={24} priority />
        )}
      </div>

      <ul className="space-y-1 px-2">
        {NAV_ITEMS.map((item) => {
          const link = (
            <Link
              href={item.href}
              className="flex items-center gap-3 rounded-input px-3 py-2 text-sm font-medium text-ink hover:bg-grey-soft"
            >
              <span aria-hidden>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
          return (
            <li key={item.href}>
              {collapsed ? (
                <Tooltip label={item.label} side="right">
                  {link}
                </Tooltip>
              ) : (
                link
              )}
            </li>
          );
        })}
      </ul>

      {!collapsed && (
        <div className="mt-6 flex-1 space-y-5 px-4">
          <div className="flex items-center justify-between">
            <div className="chapter-label">Filters</div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() =>
                  onFiltersChange({
                    stationType: "all",
                    history: "all",
                    tier: "all",
                    categoryBucket: "all",
                    performanceMin: "",
                    performanceMax: "",
                  })
                }
                className="font-mono text-[10px] text-muted hover:text-ink hover:underline"
              >
                Reset
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-ink">Station type</div>
            <ChipGroup
              chips={STATION_TYPE_CHIPS}
              value={filters.stationType}
              onChange={(stationType) => onFiltersChange({ ...filters, stationType })}
            />
          </div>

          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-ink">Billing history</div>
            <ChipGroup
              chips={HISTORY_CHIPS}
              value={filters.history}
              onChange={(history) => onFiltersChange({ ...filters, history })}
            />
          </div>

          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-ink">Performance</div>
            <p className="text-[10px] leading-snug text-muted">
              Fixed thresholds: &lt;5,000 / 5,000–10,000 / &gt;10,000 kWh/mo, avg. billed.
            </p>
            <ChipGroup
              chips={TIER_CHIPS}
              value={filters.tier}
              onChange={(tier) => onFiltersChange({ ...filters, tier })}
            />
            <div className="pt-1">
              <div className="text-[10px] text-muted">Custom range (avg. kWh/mo), on top of the above</div>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="font-mono text-xs text-muted">&gt;</span>
                <input
                  type="number"
                  value={filters.performanceMin}
                  onChange={(e) => onFiltersChange({ ...filters, performanceMin: e.target.value })}
                  placeholder="empty"
                  className="w-full min-w-0 rounded-input border border-border bg-white px-2 py-1 text-xs"
                />
                <span className="font-mono text-xs text-muted">&lt;</span>
                <input
                  type="number"
                  value={filters.performanceMax}
                  onChange={(e) => onFiltersChange({ ...filters, performanceMax: e.target.value })}
                  placeholder="empty"
                  className="w-full min-w-0 rounded-input border border-border bg-white px-2 py-1 text-xs"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-ink">Category</div>
            <ChipGroup
              chips={CATEGORY_CHIPS}
              value={filters.categoryBucket}
              onChange={(categoryBucket) => onFiltersChange({ ...filters, categoryBucket })}
            />
          </div>

          <div className="border-t border-hairline pt-3 font-mono text-[10px] text-muted">
            Showing {visibleCount.toLocaleString()} of {totalCount.toLocaleString()} stations
          </div>

          <div className="space-y-2 border-t border-hairline pt-4">
            <div className="flex items-center justify-between">
              <div className="chapter-label">Potential Sites (Tender)</div>
              <button
                type="button"
                onClick={() =>
                  onPotentialSiteFiltersChange({ ...potentialSiteFilters, visible: !potentialSiteFilters.visible })
                }
                aria-pressed={potentialSiteFilters.visible}
                className={`rounded-input border px-2 py-1 text-[11px] font-medium transition-colors ${
                  potentialSiteFilters.visible
                    ? "border-mint-deep bg-mint-deep text-white"
                    : "border-hairline bg-paper text-muted hover:bg-grey-soft"
                }`}
              >
                {potentialSiteFilters.visible ? "Shown" : "Hidden"}
              </button>
            </div>
            <p className="text-[10px] leading-snug text-muted">
              PM E Drive tender candidate locations (ANNEXURE-IV), by cluster.
            </p>
            <div className="flex flex-wrap gap-1">
              {CLUSTERS.map((cluster) => {
                const active = potentialSiteFilters.clusters.includes(cluster);
                return (
                  <button
                    key={cluster}
                    type="button"
                    onClick={() =>
                      onPotentialSiteFiltersChange({
                        ...potentialSiteFilters,
                        clusters: active
                          ? potentialSiteFilters.clusters.filter((c) => c !== cluster)
                          : [...potentialSiteFilters.clusters, cluster],
                      })
                    }
                    aria-pressed={active}
                    className={`flex items-center gap-1.5 rounded-input border px-2 py-1 text-[11px] font-medium transition-colors ${
                      active
                        ? "border-hairline bg-grey-soft text-ink"
                        : "border-hairline bg-paper text-muted-onink opacity-60 hover:bg-grey-soft"
                    }`}
                  >
                    <span
                      aria-hidden
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: CLUSTER_COLORS[cluster] }}
                    />
                    Cluster {cluster}
                  </button>
                );
              })}
            </div>
            <div className="font-mono text-[10px] text-muted">
              Showing {potentialSiteVisibleCount.toLocaleString()} of {potentialSiteTotalCount.toLocaleString()} candidates
            </div>
          </div>
        </div>
      )}

      <div className="mx-2 mb-4 mt-4 space-y-2">
        <SignOutButton collapsed={collapsed} />
        {collapsed ? (
          <Tooltip label="Expand navigation" side="right" className="w-full">
            <button
              onClick={() => setCollapsed(false)}
              aria-label="Expand navigation"
              className="flex w-full items-center justify-center rounded-input border border-hairline py-2 text-xs text-muted hover:bg-grey-soft"
            >
              »
            </button>
          </Tooltip>
        ) : (
          <button
            onClick={() => setCollapsed(true)}
            aria-label="Collapse navigation"
            className="flex w-full items-center justify-center rounded-input border border-hairline py-2 text-xs text-muted hover:bg-grey-soft"
          >
            « Collapse
          </button>
        )}
      </div>
    </nav>
  );
}
