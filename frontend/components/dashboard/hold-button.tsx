"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

const HOLD_MS = 700;
const R = 44;
const CIRC = 2 * Math.PI * R;

/**
 * Press-and-hold control (the reference's "HOLD & POUR" affordance). Holding for 0.7 s fires `onComplete`;
 * releasing early cancels. Space/Enter can be held the same way. With reduced motion it acts on a plain press.
 */
export function HoldButton({
  label,
  busy,
  disabled,
  onComplete,
  tone = "ink",
}: {
  label: string;
  busy?: boolean;
  disabled?: boolean;
  onComplete: () => void;
  tone?: "ink" | "white";
}) {
  const reduce = useReducedMotion();
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  const start = () => {
    if (disabled || busy) return;
    if (reduce) return onComplete();
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onComplete();
    }, HOLD_MS);
  };
  useEffect(() => () => cancel(), []);

  const fg = tone === "white" ? "#fff" : "var(--d-ink, var(--ink))";
  return (
    <button
      type="button"
      aria-label={`Hold to ${label}`}
      aria-busy={busy}
      disabled={disabled || busy}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        start();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => (e.key === " " || e.key === "Enter") && cancel()}
      className={cn(
        "relative grid size-20 shrink-0 place-items-center rounded-full transition-transform duration-150 select-none sm:size-24",
        holding && "scale-[0.96]",
        (disabled || busy) && "opacity-60",
      )}
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={R} fill={tone === "white" ? "transparent" : "#fff"} stroke={fg} strokeWidth="1.5" />
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke={fg}
          strokeWidth="4"
          strokeDasharray={CIRC}
          strokeDashoffset={holding ? 0 : CIRC}
          className={cn("hold-ring", holding && "holding")}
        />
      </svg>
      <span className="relative px-2 text-center text-[10.5px] leading-tight font-semibold tracking-[0.14em] uppercase" style={{ color: fg }}>
        {busy ? (
          "Checking…"
        ) : (
          <>
            Hold to
            <br />
            {label}
          </>
        )}
      </span>
    </button>
  );
}
