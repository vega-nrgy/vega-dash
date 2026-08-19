"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CpoMatchProposal } from "@/lib/types";

export default function CpoMatchReviewPage() {
  const [proposals, setProposals] = useState<CpoMatchProposal[] | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/admin/cpo-matches?status=pending")
      .then((res) => res.json())
      .then((data) => {
        const list: CpoMatchProposal[] = data.proposals ?? [];
        setProposals(list);
        setDrafts(Object.fromEntries(list.map((p) => [p.id, p.external_cpo_stations.name])));
      });
  }, []);

  const review = async (id: number, action: "approve" | "reject") => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/cpo-matches/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, cpoBrand: drafts[id] }),
      });
      if (res.ok) {
        setProposals((prev) => (prev ?? []).filter((p) => p.id !== id));
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-paper px-6 py-10">
      <Link href="/" className="font-mono text-xs text-mint-deep hover:underline">
        ← Back to map
      </Link>

      <h1 className="vc-name mt-4 text-2xl">CPO Match Review</h1>
      <p className="vc-meta">
        Proposed matches against Statiq&apos;s public station directory, by proximity. Approving
        sets a station&apos;s CPO brand — it never overwrites the station&apos;s TSPDCL operator
        registration.
      </p>

      <div className="mt-6 rounded-card border border-hairline bg-grey-soft p-4">
        <div className="chapter-label">Pending review</div>
        <div className="mt-1 text-2xl font-semibold text-ink">
          {proposals == null ? "…" : proposals.length}
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {proposals?.map((p) => (
          <div key={p.id} className="rounded-card border border-hairline p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="vc-id">{p.stations.unique_scno}</div>
                <div className="text-sm font-medium text-ink">{p.stations.name}</div>
                <div className="mt-1 font-mono text-[10px] text-muted">
                  Operator: {p.stations.operator ?? "—"} · {p.stations.district ?? "—"}
                </div>
              </div>
              <div className="shrink-0 text-right font-mono text-[10px] text-muted">
                {p.distance_m}m away
              </div>
            </div>

            <div className="mt-3 rounded-input border border-hairline bg-grey-soft p-3">
              <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-onink">
                Statiq candidate
              </div>
              <div className="mt-0.5 text-sm text-ink">{p.external_cpo_stations.name}</div>
              {p.external_cpo_stations.address && (
                <div className="mt-0.5 text-xs text-muted">{p.external_cpo_stations.address}</div>
              )}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <label className="flex-1">
                <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-muted-onink">
                  CPO brand to apply
                </span>
                <input
                  type="text"
                  value={drafts[p.id] ?? ""}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  className="w-full rounded-input border border-border bg-white px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => review(p.id, "approve")}
                disabled={busyId === p.id || !drafts[p.id]?.trim()}
                className="rounded-input bg-mint-deep px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => review(p.id, "reject")}
                disabled={busyId === p.id}
                className="rounded-input border border-hairline px-3 py-1.5 text-xs text-muted hover:bg-grey-soft disabled:opacity-50"
              >
                Reject
              </button>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${p.stations.latitude},${p.stations.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto self-center font-mono text-[10px] text-mint-deep underline"
              >
                View on map ↗
              </a>
            </div>
          </div>
        ))}
        {proposals && proposals.length === 0 && (
          <p className="text-sm text-muted">No pending proposals — nothing left to review.</p>
        )}
      </div>
    </div>
  );
}
