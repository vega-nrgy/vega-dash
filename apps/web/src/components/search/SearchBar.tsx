"use client";

import { useState } from "react";
import type { SearchResponse } from "@/lib/types";

interface SearchBarProps {
  onResolved: (result: SearchResponse) => void;
}

/**
 * A single input covering all four search modes (ID/name/area/landmark).
 * No mode-branching logic here — /api/search resolves it server-side and
 * returns a `resolvedAs` field the caller switches on. See plan §5.
 */
export function SearchBar({ onResolved }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setNotFound(false);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data: SearchResponse = await res.json();
      if (data.resolvedAs === "none") {
        setNotFound(true);
      } else {
        onResolved(data);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={runSearch} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setNotFound(false);
        }}
        placeholder="Search by ID, name, area, or landmark…"
        className="w-full rounded-input border border-border bg-white px-4 py-2.5 text-sm shadow-lift placeholder:text-muted-onink focus:border-mint"
      />
      <button
        type="submit"
        disabled={loading}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-mint px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-ink hover:bg-mint-bright disabled:opacity-60"
      >
        {loading ? "…" : "Go"}
      </button>
      {notFound && (
        <p className="mt-1.5 font-mono text-[10px] text-muted-onink">
          No match. Try an ID, station name, district, or nearby landmark.
        </p>
      )}
    </form>
  );
}
