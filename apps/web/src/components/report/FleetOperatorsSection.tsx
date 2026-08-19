"use client";

import { useState } from "react";
import type { FleetOperator } from "@/lib/types";
import { Tooltip } from "@/components/ui/Tooltip";

type FleetDraft = {
  operator_name: string;
  vehicle_class: string;
  fleet_size: string;
  contact_name: string;
  contact_info: string;
  notes: string;
};

const toDraft = (f?: FleetOperator): FleetDraft => ({
  operator_name: f?.operator_name ?? "",
  vehicle_class: f?.vehicle_class ?? "",
  fleet_size: f?.fleet_size != null ? String(f.fleet_size) : "",
  contact_name: f?.contact_name ?? "",
  contact_info: f?.contact_info ?? "",
  notes: f?.notes ?? "",
});

const draftToBody = (d: FleetDraft) => ({
  operator_name: d.operator_name.trim(),
  vehicle_class: d.vehicle_class.trim() || null,
  fleet_size: d.fleet_size ? Number(d.fleet_size) : null,
  contact_name: d.contact_name.trim() || null,
  contact_info: d.contact_info.trim() || null,
  notes: d.notes.trim() || null,
});

/** Fleet operators signed up with this station's CPO — entirely user-entered
 * (no data source exists), editable add/edit/delete, same interaction pattern
 * as the amenities editor in the map side panel. */
export function FleetOperatorsSection({
  scno,
  initialFleetOperators,
}: {
  scno: string;
  initialFleetOperators: FleetOperator[];
}) {
  const [operators, setOperators] = useState<FleetOperator[]>(initialFleetOperators);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const addOperator = async (draft: FleetDraft) => {
    if (!draft.operator_name.trim()) return;
    const res = await fetch(`/api/stations/${scno}/fleet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draftToBody(draft)),
    });
    if (res.ok) {
      const created = await res.json();
      setOperators((prev) => [...prev, created]);
      setAdding(false);
    }
  };

  const updateOperator = async (id: number, draft: FleetDraft) => {
    const res = await fetch(`/api/stations/${scno}/fleet/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draftToBody(draft)),
    });
    if (res.ok) {
      const updated = await res.json();
      setOperators((prev) => prev.map((o) => (o.id === id ? updated : o)));
      setEditingId(null);
    }
  };

  const deleteOperator = async (id: number) => {
    const res = await fetch(`/api/stations/${scno}/fleet/${id}`, { method: "DELETE" });
    if (res.ok) setOperators((prev) => prev.filter((o) => o.id !== id));
  };

  return (
    <div>
      <div className="chapter-label mb-2">Fleet Operators</div>
      <p className="mb-3 font-mono text-[9.5px] text-muted-onink">
        Fleets signed up with this station&apos;s CPO — entered manually as they&apos;re found.
      </p>

      {operators.length === 0 && !adding && (
        <p className="text-sm text-muted">No fleet operators entered yet.</p>
      )}

      <ul className="space-y-2">
        {operators.map((o) =>
          editingId === o.id ? (
            <FleetForm
              key={o.id}
              initial={toDraft(o)}
              onCancel={() => setEditingId(null)}
              onSubmit={(draft) => updateOperator(o.id, draft)}
            />
          ) : (
            <li
              key={o.id}
              className="flex items-center justify-between rounded-input border border-hairline px-3 py-2 text-sm"
            >
              <div>
                <span className="text-ink">{o.operator_name}</span>
                <span className="ml-1.5 font-mono text-[10px] text-muted">
                  {[
                    o.vehicle_class,
                    o.fleet_size != null ? `${o.fleet_size} vehicles` : null,
                    o.contact_name,
                    o.contact_info,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Tooltip label="Edit">
                  <button
                    onClick={() => setEditingId(o.id)}
                    aria-label="Edit fleet operator"
                    className="rounded-full p-1 text-muted hover:bg-grey-soft"
                  >
                    ✎
                  </button>
                </Tooltip>
                <Tooltip label="Remove">
                  <button
                    onClick={() => deleteOperator(o.id)}
                    aria-label="Remove fleet operator"
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
        <FleetForm onCancel={() => setAdding(false)} onSubmit={addOperator} />
      ) : (
        <Tooltip label="Add a fleet operator signed up at this station" side="right">
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-2 rounded-input border border-dashed border-border px-3 py-1.5 text-xs font-medium text-mint-deep hover:bg-grey-soft"
          >
            + Add fleet operator
          </button>
        </Tooltip>
      )}
    </div>
  );
}

function FleetForm({
  initial,
  onCancel,
  onSubmit,
}: {
  initial?: FleetDraft;
  onCancel: () => void;
  onSubmit: (draft: FleetDraft) => void;
}) {
  const [draft, setDraft] = useState<FleetDraft>(initial ?? toDraft());
  const set = (patch: Partial<FleetDraft>) => setDraft((prev) => ({ ...prev, ...patch }));

  return (
    <div className="mt-2 space-y-1.5 rounded-input border border-border bg-white p-2.5">
      <input
        type="text"
        value={draft.operator_name}
        onChange={(e) => set({ operator_name: e.target.value })}
        placeholder="Fleet operator name"
        aria-label="Fleet operator name"
        className="w-full rounded-input border border-border bg-white px-2 py-1.5 text-sm"
      />
      <div className="flex gap-1.5">
        <input
          type="text"
          value={draft.vehicle_class}
          onChange={(e) => set({ vehicle_class: e.target.value })}
          placeholder="Vehicle class (e.g. 4-wheeler)"
          aria-label="Vehicle class"
          className="min-w-0 flex-1 rounded-input border border-border bg-white px-2 py-1.5 text-sm"
        />
        <input
          type="number"
          min={0}
          value={draft.fleet_size}
          onChange={(e) => set({ fleet_size: e.target.value })}
          placeholder="Fleet size"
          aria-label="Fleet size"
          className="w-24 rounded-input border border-border bg-white px-2 py-1.5 text-sm"
        />
      </div>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={draft.contact_name}
          onChange={(e) => set({ contact_name: e.target.value })}
          placeholder="Contact name"
          aria-label="Contact name"
          className="min-w-0 flex-1 rounded-input border border-border bg-white px-2 py-1.5 text-sm"
        />
        <input
          type="text"
          value={draft.contact_info}
          onChange={(e) => set({ contact_info: e.target.value })}
          placeholder="Contact info"
          aria-label="Contact info"
          className="min-w-0 flex-1 rounded-input border border-border bg-white px-2 py-1.5 text-sm"
        />
      </div>
      <textarea
        value={draft.notes}
        onChange={(e) => set({ notes: e.target.value })}
        placeholder="Notes"
        aria-label="Notes"
        rows={2}
        className="w-full rounded-input border border-border bg-white px-2 py-1.5 text-sm"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSubmit(draft)}
          disabled={!draft.operator_name.trim()}
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
