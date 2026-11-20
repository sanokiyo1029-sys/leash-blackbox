"use client";

import { useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { dur, ease } from "@/lib/motion";

export type TickStatus = "INTACT" | "MODIFIED" | "DELETED" | "INJECTED" | "UNVERIFIED";

export interface SealRecord {
  seq: number;
  status: TickStatus;
  msg?: string;
  source?: string;
}

/** Status → colour + label. Shape carries the same meaning (see TickMark) so colour is never alone. */
export const TICK_META: Record<TickStatus, { color: string; label: string; legend: string }> = {
  INTACT: { color: "var(--d-ok)", label: "intact", legend: "matches the chain" },
  MODIFIED: { color: "var(--d-warn)", label: "altered", legend: "changed on the host" },
  DELETED: { color: "var(--d-red)", label: "erased", legend: "missing on the host, original recovered" },
  INJECTED: { color: "var(--d-info)", label: "fabricated", legend: "never committed" },
  UNVERIFIED: { color: "color-mix(in oklch, var(--d-ink) 28%, transparent)", label: "not verified yet", legend: "arrived after the last run" },
};

const VIEW = 400;
const C = VIEW / 2;
const R_PLATE = 192;
const R_OUT = 178;
const R_IN = 150;
const R_INJ_OUT = 140;
const R_INJ_IN = 122;
const R_CORE = 108;

function polar(r: number, a: number) {
  return [C + r * Math.sin(a), C - r * Math.cos(a)] as const;
}

/**
 * The integrity seal: one tick per record around a white plate. Status comes from the last verification run;
 * records newer than that run are drawn as "not verified yet". Colours change with a clockwise sweep.
 */
export function IntegritySeal({
  records,
  centerTop,
  centerBottom,
  tone,
  loading,
}: {
  records: SealRecord[];
  centerTop: React.ReactNode;
  centerBottom: React.ReactNode;
  tone: "ink" | "red" | "muted";
  loading?: boolean;
}) {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const n = records.length;
  const step = n ? (2 * Math.PI) / n : 0;
  const width = Math.max(0.6, Math.min(5, ((2 * Math.PI * R_IN) / Math.max(n, 1)) * 0.55));

  const ticks = useMemo(
    () =>
      records.map((r, i) => {
        const a = i * step;
        const inj = r.status === "INJECTED";
        const [x1, y1] = polar(inj ? R_INJ_IN : R_IN, a);
        const [x2, y2] = polar(inj ? R_INJ_OUT : R_OUT, a);
        return { r, i, x1, y1, x2, y2, a };
      }),
    [records, step],
  );

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = ref.current;
    if (!svg || !n) return;
    const box = svg.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * VIEW - C;
    const y = ((e.clientY - box.top) / box.height) * VIEW - C;
    const dist = Math.hypot(x, y);
    if (dist < R_INJ_IN - 12 || dist > R_PLATE) return setHover(null);
    let a = Math.atan2(x, -y);
    if (a < 0) a += 2 * Math.PI;
    const i = Math.round(a / step) % n;
    setHover({ i, x: e.clientX - box.left, y: e.clientY - box.top });
  };

  const core = tone === "red" ? "var(--d-red)" : tone === "muted" ? "color-mix(in oklch, var(--d-night) 62%, var(--d-plate))" : "var(--d-night)";
  const hovered = hover ? records[hover.i] : null;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[460px]">
      <motion.svg
        ref={ref}
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="h-full w-full touch-none"
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: dur.slow, ease: ease.out }}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Integrity seal: ${n} records`}
      >
        <circle cx={C} cy={C} r={R_PLATE} fill="var(--d-plate)" stroke="var(--d-ink)" strokeWidth={1.5} />
        <circle cx={C} cy={C} r={(R_IN + R_INJ_OUT) / 2} fill="none" stroke="var(--d-ink)" strokeOpacity={0.12} strokeWidth={1} />
        {loading && (
          <circle cx={C} cy={C} r={(R_IN + R_OUT) / 2} fill="none" stroke="var(--d-ink)" strokeOpacity={0.18} strokeWidth={R_OUT - R_IN} strokeDasharray="2 6" />
        )}
        {ticks.map(({ r, i, x1, y1, x2, y2 }) => {
          const color = TICK_META[r.status].color;
          const delay = `${((i / Math.max(n, 1)) * 0.6).toFixed(3)}s`;
          const active = hover?.i === i;
          if (r.status === "DELETED") {
            // Erased: hollow (outline only), so it reads without colour.
            return (
              <line
                key={r.seq}
                className="seal-tick"
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={color}
                strokeWidth={Math.max(width, 1.4)}
                strokeLinecap="butt"
                strokeDasharray="3 3"
                style={{ transitionDelay: delay, animationDelay: delay }}
                opacity={active ? 1 : 0.95}
              />
            );
          }
          return (
            <line
              key={r.seq}
              className="seal-tick"
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={color}
              strokeWidth={active ? width + 2 : width}
              strokeLinecap="round"
              style={{ transitionDelay: delay, animationDelay: delay }}
            />
          );
        })}
        {/* Altered records also get a dot inside the ring (second encoding). */}
        {ticks
          .filter((t) => t.r.status === "MODIFIED")
          .map(({ r, a }) => {
            const [cx, cy] = polar(R_IN - 9, a);
            return <circle key={`m${r.seq}`} cx={cx} cy={cy} r={2.6} fill="var(--d-warn)" stroke="var(--d-night)" strokeWidth={0.6} />;
          })}
        <circle cx={C} cy={C} r={R_CORE} fill={core} style={{ transition: "fill 0.45s cubic-bezier(.22,1,.36,1)" }} />
        <foreignObject x={C - R_CORE} y={C - R_CORE} width={R_CORE * 2} height={R_CORE * 2}>
          <div className="flex h-full w-full flex-col items-center justify-center px-4 text-center text-white">
            <div className="font-display text-[54px] leading-none font-semibold tabular">{centerTop}</div>
            <div className="mt-1.5 text-[10.5px] font-semibold tracking-[0.16em] uppercase opacity-85">{centerBottom}</div>
          </div>
        </foreignObject>
      </motion.svg>

      {hovered && hover && (
        <div
          className="caption pointer-events-none absolute z-10 w-60 px-3 py-2 text-xs shadow-[var(--shadow-pop)]"
          style={{ left: Math.min(Math.max(hover.x + 14, 0), 220), top: Math.max(hover.y - 70, 0) }}
          role="tooltip"
        >
          <div className="flex items-center gap-2">
            <span className="inline-block size-2.5 rounded-full" style={{ background: TICK_META[hovered.status].color }} />
            <span className="font-hash">#{hovered.seq}</span>
            <span className="label !text-[10px]">{TICK_META[hovered.status].label}</span>
          </div>
          {hovered.msg && <div className="mt-1 line-clamp-2 text-[12px] leading-snug">{hovered.msg}</div>}
        </div>
      )}
    </div>
  );
}
