"use client";

import { useEffect, useState } from "react";
import { Tooltip } from "@/components/ui/Tooltip";

interface Step {
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    title: "Welcome to Vega Charge",
    body: "A map of every EV charging station we track across Telangana. Here's a quick tour of what you can do.",
  },
  {
    title: "Search for a station or area",
    body: "The search bar (top-left) takes an ID, a station name, a district/area name, or a nearby landmark — try \"Suryapet\" for an area, or a station ID like \"114195145\".",
  },
  {
    title: "Filter the map",
    body: "The side nav's Filters section narrows the map by station type (LT/HT), whether billing history has been collected, and performance tier (avg. billed kWh vs. same-type peers).",
  },
  {
    title: "Click a station",
    body: "Click any marker to open its detail panel — location, charger config, and a link to its full consumption history chart.",
  },
  {
    title: "Right-click to predict a new site",
    body: "Right-click anywhere on the map to drop a candidate marker. Drag it, or type exact coordinates in the panel, then configure chargers (e.g. \"1 × 240 kW + 2 × 120 kW\") to request a performance prediction.",
  },
  {
    title: "Consumption history",
    body: "Every station with billing data has a \"View History →\" link showing a monthly kWh trend chart alongside the raw bill list.",
  },
  {
    title: "Pipeline status",
    body: "The Pipeline page (side nav) shows the state of the data-ingestion pipeline — scraping, PDF parsing, and how many stations have real billing history.",
  },
];

const SEEN_KEY = "vc_tutorial_seen";

export function TutorialTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowRight") setStep((s) => Math.min(STEPS.length - 1, s + 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const startTour = () => {
    setStep(0);
    setOpen(true);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // localStorage unavailable (private mode etc.) — non-essential, ignore.
    }
  };

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  return (
    <>
      <div className="absolute right-4 top-4 z-[999]">
        <Tooltip label="Take a tour" side="left">
          <button
            onClick={startTour}
            aria-label="Take a tour"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white text-base font-bold text-mint-deep shadow-lift hover:bg-grey-soft"
          >
            ?
          </button>
        </Tooltip>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-ink/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Vega Charge feature tour"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-card bg-paper p-6 shadow-hero-card"
          >
            <div className="flex items-start justify-between">
              <div className="chapter-label">
                Step {step + 1} of {STEPS.length}
              </div>
              <Tooltip label="Close tour">
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close tour"
                  className="rounded-full p-1 text-muted hover:bg-grey-soft"
                >
                  ✕
                </button>
              </Tooltip>
            </div>

            <h2 className="vc-name mt-2 text-xl">{current.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{current.body}</p>

            <div className="mt-6 flex items-center justify-center gap-1.5">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  aria-label={`Go to step ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? "w-5 bg-mint-deep" : "w-1.5 bg-hairline hover:bg-border"
                  }`}
                />
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={() => setOpen(false)}
                className="font-mono text-[11px] text-muted hover:text-ink hover:underline"
              >
                Skip
              </button>
              <div className="flex gap-2">
                {step > 0 && (
                  <button
                    onClick={() => setStep((s) => s - 1)}
                    className="rounded-input border border-hairline px-4 py-2 text-sm font-medium text-ink hover:bg-grey-soft"
                  >
                    ← Back
                  </button>
                )}
                <button
                  onClick={() => (isLast ? setOpen(false) : setStep((s) => s + 1))}
                  className="vc-link"
                >
                  {isLast ? "Done" : "Next →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
