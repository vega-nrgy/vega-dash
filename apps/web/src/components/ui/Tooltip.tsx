"use client";

import type { ReactNode } from "react";

const SIDE_CLASSES: Record<string, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
  left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
  right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
};

interface TooltipProps {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

/**
 * Lightweight hover/focus tooltip — no positioning library, CSS-only via a
 * `group`-hover wrapper. Shows on focus-within too, so icon-only buttons stay
 * reachable by keyboard, not just mouse hover.
 */
export function Tooltip({ label, children, side = "bottom", className = "" }: TooltipProps) {
  return (
    <span className={`group/tooltip relative inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-[1200] whitespace-nowrap rounded-input bg-ink px-2 py-1 font-mono text-[10px] text-white opacity-0 shadow-lift transition-opacity duration-150 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100 ${SIDE_CLASSES[side]}`}
      >
        {label}
      </span>
    </span>
  );
}
