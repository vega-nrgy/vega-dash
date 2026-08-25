"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PanelState, StationAmenity, StationDetail } from "@/lib/types";
import { StationTypeBadge, SeedDataNotice } from "@/components/ui/Badge";
import { Tooltip } from "@/components/ui/Tooltip";

function backLabel(previousPanel: PanelState): string {
  if (previousPanel.type === "area") return `Back to ${previousPanel.district}`;
  if (previousPanel.type === "landmark") return `Back to ${previousPanel.query}`;
  if (previousPanel.type === "nearby-analysis") return "Back to Nearby Analysis";
  return "Back";
}

export function StationDetailPanel({
  scno,
  onClose,
  previousPanel,
  onBack,
}: {
  scno: string;
  onClose: () => void;
  previousPanel: PanelState | null;
  onBack: () => void;
}) {
  const [station, setStation] = useState<StationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    // scno is this component's `key` upstream (see SidePanel), so a change
    // always remounts with fresh initial state — no need to reset here.
    let cancelled = false;
    fetch(`/api/stations/${scno}`)
      .then((res) => {
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!cancelled && data) setStation(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scno]);

  if (loading) {
    return <div className="p-6 font-mono text-xs text-muted">Loading station…</div>;
  }

  if (notFound || !station) {
    return (
      <div className="p-6">
        <p className="font-mono text-xs text-muted">Station {scno} not found.</p>
        <button onClick={onClose} className="mt-3 text-xs text-mint-deep underline">
          Close
        </button>
      </div>
    );
  }

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${station.latitude},${station.longitude}`;

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      {previousPanel && (
        <button
          onClick={onBack}
          className="mb-3 self-start font-mono text-[10px] text-mint-deep hover:underline"
        >
          ← {backLabel(previousPanel)}
        </button>
      )}
      <div className="flex items-start justify-between">
        <div>
          <div className="vc-id flex items-center gap-2">
            {station.unique_scno}
            <StationTypeBadge type={station.station_type} />
          </div>
          <h2 className="vc-name">{station.name}</h2>
        </div>
        <Tooltip label="Close panel">
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="rounded-full p-1 text-muted hover:bg-grey-soft"
          >
            ✕
          </button>
        </Tooltip>
      </div>

      <p className="vc-meta">
        {[station.district, station.location_class, station.discom].filter(Boolean).join(" · ")}
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Field label="Operator (TSPDCL registrant)" value={station.operator} />
        <Field label="CPO Brand" value={station.cpo_brand} />
        <Field label="Ownership" value={station.ownership} />
        <Field label="Category" value={station.category} />
        <Field label="Status" value={station.status} />
        <Field
          label="Contracted Load (CMD)"
          value={station.contracted_load_kva != null ? `${station.contracted_load_kva} kVA` : null}
        />
        <div>
          <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-onink">
            Location
          </dt>
          <dd className="text-ink">
            {station.latitude.toFixed(5)}, {station.longitude.toFixed(5)}
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 text-mint-deep underline"
            >
              Maps ↗
            </a>
          </dd>
        </div>
      </dl>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <StatTile
          label="Last month"
          value={
            station.last_month_units_kwh != null
              ? `${Math.round(station.last_month_units_kwh).toLocaleString()} kWh`
              : "—"
          }
        />
        <StatTile
          label="Avg./month"
          value={
            station.avg_units_kwh != null
              ? `${Math.round(station.avg_units_kwh).toLocaleString()} kWh`
              : "—"
          }
        />
      </div>
      <p className="mt-1.5 font-mono text-[10px] text-muted">
        {station.bill_count > 0
          ? `${station.bill_count} month${station.bill_count === 1 ? "" : "s"} of billing history`
          : "No billing history ingested yet"}
      </p>

      <div className="mt-6 rounded-card border border-hairline bg-grey-soft p-4">
        <div className="chapter-label">Estimated Consumption</div>
        <div className="mt-1 text-2xl font-semibold text-ink">
          {station.seed_avg_consumption_kwh_month != null
            ? `${Math.round(station.seed_avg_consumption_kwh_month).toLocaleString()} kWh/mo`
            : "—"}
        </div>
        <div className="mt-1 text-sm text-muted">Footfall: {station.seed_footfall ?? "—"}</div>
        <SeedDataNotice className="mt-2" />
      </div>

      <RatingWidget scno={station.unique_scno} initialRating={station.rating} />

      <div className="mt-6">
        <div className="chapter-label mb-2">Charger Configuration</div>
        {station.chargers.length === 0 ? (
          <p className="text-sm text-muted">No charger data parsed yet.</p>
        ) : (
          <ul className="space-y-2">
            {station.chargers.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-input border border-hairline px-3 py-2 text-sm"
              >
                <span>{c.charger_type}</span>
                <span className="font-mono text-xs text-muted">
                  {c.power_kw ? `${c.power_kw} kW` : ""} × {c.count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AmenitiesEditor scno={station.unique_scno} initialAmenities={station.amenities} />

      <div className="mt-6 flex flex-col gap-2">
        <Link href={`/station/${station.unique_scno}/history`} className="vc-link text-center">
          View History →
        </Link>
        <Link
          href={`/station/${station.unique_scno}/report`}
          target="_blank"
          rel="noopener noreferrer"
          className="vc-link text-center"
        >
          Detailed Report ↗
        </Link>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-onink">
        {label}
      </dt>
      <dd className="text-ink">{value ?? "—"}</dd>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-hairline bg-grey-soft p-4">
      <div className="chapter-label">{label}</div>
      <div className="mt-1 text-xl font-semibold text-ink">{value}</div>
    </div>
  );
}

function RatingWidget({ scno, initialRating }: { scno: string; initialRating: number | null }) {
  const [rating, setRating] = useState<number | null>(initialRating);
  const [saving, setSaving] = useState(false);

  const save = async (next: number | null) => {
    setRating(next);
    setSaving(true);
    try {
      await fetch(`/api/stations/${scno}/rating`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: next }),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-6">
      <div className="chapter-label mb-2">Station Rating {saving && "(saving…)"}</div>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => save(rating === n ? null : n)}
            aria-label={`Rate ${n} of 5`}
            className={`text-lg leading-none ${
              rating != null && n <= rating ? "text-mint-deep" : "text-hairline"
            }`}
          >
            ★
          </button>
        ))}
        <span className="ml-2 font-mono text-xs text-muted">{rating != null ? rating.toFixed(1) : "Not rated"}</span>
      </div>
      <p className="mt-1 font-mono text-[9.5px] text-muted-onink">Manually entered — not sourced from Google Places.</p>
    </div>
  );
}

function AmenitiesEditor({
  scno,
  initialAmenities,
}: {
  scno: string;
  initialAmenities: StationAmenity[];
}) {
  const [amenities, setAmenities] = useState<StationAmenity[]>(initialAmenities);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const addAmenity = async (draft: { name: string; category: string; distance_m: string; rating: string }) => {
    if (!draft.name.trim()) return;
    const res = await fetch(`/api/stations/${scno}/amenities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name.trim(),
        category: draft.category.trim() || null,
        distance_m: draft.distance_m ? Number(draft.distance_m) : null,
        rating: draft.rating ? Number(draft.rating) : null,
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setAmenities((prev) => [...prev, created]);
      setAdding(false);
    }
  };

  const updateAmenity = async (
    id: number,
    draft: { name: string; category: string; distance_m: string; rating: string }
  ) => {
    const res = await fetch(`/api/stations/${scno}/amenities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name.trim(),
        category: draft.category.trim() || null,
        distance_m: draft.distance_m ? Number(draft.distance_m) : null,
        rating: draft.rating ? Number(draft.rating) : null,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setAmenities((prev) => prev.map((a) => (a.id === id ? updated : a)));
      setEditingId(null);
    }
  };

  const deleteAmenity = async (id: number) => {
    const res = await fetch(`/api/stations/${scno}/amenities/${id}`, { method: "DELETE" });
    if (res.ok) setAmenities((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="mt-6">
      <div className="chapter-label mb-2">Amenities Nearby</div>
      {amenities.length === 0 && !adding && (
        <p className="text-sm text-muted">No amenities entered yet.</p>
      )}
      <ul className="space-y-2">
        {amenities.map((a) =>
          editingId === a.id ? (
            <AmenityForm
              key={a.id}
              initial={a}
              onCancel={() => setEditingId(null)}
              onSubmit={(draft) => updateAmenity(a.id, draft)}
            />
          ) : (
            <li
              key={a.id}
              className="flex items-center justify-between rounded-input border border-hairline px-3 py-2 text-sm"
            >
              <div>
                <span className="text-ink">{a.name}</span>
                <span className="ml-1.5 font-mono text-[10px] text-muted">
                  {[a.category, a.distance_m != null ? `${a.distance_m}m` : null, a.rating != null ? `★${a.rating}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Tooltip label="Edit">
                  <button
                    onClick={() => setEditingId(a.id)}
                    aria-label="Edit amenity"
                    className="rounded-full p-1 text-muted hover:bg-grey-soft"
                  >
                    ✎
                  </button>
                </Tooltip>
                <Tooltip label="Remove">
                  <button
                    onClick={() => deleteAmenity(a.id)}
                    aria-label="Remove amenity"
                    className="rounded-full p-1 text-muted hover:bg-grey-soft"
                  >
                    ✕
                  </button>
                </Tooltip>
              </div>
            </li>
          )
        )}
      </ul>

      {adding ? (
        <AmenityForm onCancel={() => setAdding(false)} onSubmit={addAmenity} />
      ) : (
        <Tooltip label="Add an amenity found near this station" side="right">
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-2 rounded-input border border-dashed border-border px-3 py-1.5 text-xs font-medium text-mint-deep hover:bg-grey-soft"
          >
            + Add amenity
          </button>
        </Tooltip>
      )}
    </div>
  );
}

function AmenityForm({
  initial,
  onCancel,
  onSubmit,
}: {
  initial?: StationAmenity;
  onCancel: () => void;
  onSubmit: (draft: { name: string; category: string; distance_m: string; rating: string }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [distanceM, setDistanceM] = useState(initial?.distance_m != null ? String(initial.distance_m) : "");
  const [rating, setRating] = useState(initial?.rating != null ? String(initial.rating) : "");

  return (
    <div className="mt-2 space-y-1.5 rounded-input border border-border bg-white p-2.5">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (e.g. Hotel Sitara)"
        aria-label="Amenity name"
        className="w-full rounded-input border border-border bg-white px-2 py-1.5 text-sm"
      />
      <div className="flex gap-1.5">
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Category (e.g. Hotel)"
          aria-label="Amenity category"
          className="min-w-0 flex-1 rounded-input border border-border bg-white px-2 py-1.5 text-sm"
        />
        <input
          type="number"
          min={0}
          value={distanceM}
          onChange={(e) => setDistanceM(e.target.value)}
          placeholder="m"
          aria-label="Distance in meters"
          className="w-16 rounded-input border border-border bg-white px-2 py-1.5 text-sm"
        />
        <input
          type="number"
          min={0}
          max={5}
          step={0.1}
          value={rating}
          onChange={(e) => setRating(e.target.value)}
          placeholder="★"
          aria-label="Rating out of 5"
          className="w-16 rounded-input border border-border bg-white px-2 py-1.5 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSubmit({ name, category, distance_m: distanceM, rating })}
          disabled={!name.trim()}
          className="rounded-input bg-mint-deep px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-input border border-hairline px-3 py-1 text-xs text-muted hover:bg-grey-soft"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
