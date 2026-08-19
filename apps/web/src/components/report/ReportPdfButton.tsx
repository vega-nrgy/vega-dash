"use client";

import { useState } from "react";
import { exportElementToPdf } from "@/lib/pdf/exportReport";

export function ReportPdfButton({ elementId, filename }: { elementId: string; filename: string }) {
  const [exporting, setExporting] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        setExporting(true);
        try {
          await exportElementToPdf(elementId, filename);
        } finally {
          setExporting(false);
        }
      }}
      disabled={exporting}
      className="rounded-input border border-mint-deep bg-mint-deep px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {exporting ? "Generating PDF…" : "Download PDF ↓"}
    </button>
  );
}
