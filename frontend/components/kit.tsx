"use client";

/**
 * LEASH design-system primitives. Every page composes these so spacing,
 * surfaces, motion and status semantics stay consistent.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { AlertTriangle, CheckCircle2, Info, Inbox, Loader2, ShieldAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { dur, ease, fadeUp } from "@/lib/motion";

// ------------------------------------------------------------------ surfaces
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  tone,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  tone?: "danger" | "safe" | "neutral";
}) {
  return (
    <motion.section
      {...fadeUp}
      className={cn(
        "surface relative flex min-w-0 flex-col rounded-sm",
        tone === "danger" && "border-t-[3px] border-t-[var(--bad)]",
        tone === "safe" && "border-t-[3px] border-t-[var(--ok)]",
        className,
      )}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0">
            {title && <h2 className="label-caps text-foreground">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("min-w-0 flex-1 px-5 pb-5", !title && !actions && "pt-5", bodyClassName)}>{children}</div>
    </motion.section>
  );
}

/**
 * Page header in the v2 language (docs/design/REFERENCE_SPEC.md): small caps label, one display title, a short line,
 * actions in a row. No frame or band; the page's own content is the focal subject. "action" adds a red rule.
 */
export function PageTitle({
  eyebrow,
  title,
  description,
  actions,
  variant = "scene",
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  variant?: "scene" | "action";
}) {
  return (
    <motion.header {...fadeUp} className="mb-7 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="min-w-0">
        {eyebrow && (
          <div className="label-caps mb-3 flex items-center gap-2 text-ink/70">
            {variant === "action" && <span className="inline-block h-[3px] w-6 bg-primary" aria-hidden />}
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-[clamp(1.75rem,4.2vw,3rem)] leading-[0.98] font-black tracking-[-0.01em] text-balance uppercase">{title}</h1>
        {description && <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink/75">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </motion.header>
  );
}

// ------------------------------------------------------------------- numbers
/** Smoothly tweens to the new value whenever it changes (no RAF loop when idle). */
const defaultFormat = (n: number) => Math.round(n).toLocaleString();

export function AnimatedNumber({ value, format = defaultFormat, className }: { value: number | null | undefined; format?: (n: number) => string; className?: string }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => format(v));
  const reduce = useReducedMotion();
  useEffect(() => {
    if (value === null || value === undefined) return;
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: dur.slow, ease: ease.out });
    return () => controls.stop();
  }, [value, reduce, mv]);
  if (value === null || value === undefined) return <span className={cn("tabular", className)}>—</span>;
  return <motion.span className={cn("tabular", className)}>{text}</motion.span>;
}

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  format,
}: {
  label: string;
  value: number | null | undefined;
  hint?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "ok" | "bad" | "warn" | "info" | "violet";
  format?: (n: number) => string;
}) {
  const toneCls = { ok: "text-ok", bad: "text-bad", warn: "text-warn", info: "text-info", violet: "text-violet" };
  return (
    <motion.div {...fadeUp} className="surface surface-hover rounded-sm p-4">
      <div className="label-caps flex items-center justify-between gap-2 text-muted-foreground">
        {label}
        {Icon && <Icon className={cn("size-4 shrink-0", tone ? toneCls[tone] : "text-ink")} />}
      </div>
      <div className={cn("mt-2 font-display text-[clamp(1.6rem,4.2vw,2.6rem)] leading-none font-black tracking-tight", tone && toneCls[tone])}>
        <AnimatedNumber value={value} format={format} />
      </div>
      {hint && <div className="mt-2 text-xs text-muted-foreground">{hint}</div>}
    </motion.div>
  );
}

// -------------------------------------------------------------------- status
export function LiveDot({ tone = "ok", pulse = true, className }: { tone?: "ok" | "bad" | "warn" | "info" | "muted"; pulse?: boolean; className?: string }) {
  const bg = { ok: "bg-ok", bad: "bg-bad", warn: "bg-warn", info: "bg-info", muted: "bg-muted-foreground" }[tone];
  return (
    <span className={cn("relative inline-flex size-2", className)}>
      {pulse && <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60 [animation-duration:1.8s]", bg)} />}
      <span className={cn("relative inline-flex size-2 rounded-full", bg)} />
    </span>
  );
}

// Print blocks: tampering is a solid red block; the other tones are paper with a spot colour.
const ALERT = {
  success: { icon: CheckCircle2, cls: "border-ok/40 bg-card text-ok", body: "text-foreground/80" },
  danger: { icon: ShieldAlert, cls: "border-transparent bg-primary text-primary-foreground", body: "text-primary-foreground/90" },
  warn: { icon: AlertTriangle, cls: "border-transparent bg-[#f4c542] text-ink", body: "text-ink/80" },
  info: { icon: Info, cls: "border-info/35 bg-card text-info", body: "text-foreground/80" },
};

export function AlertBanner({
  tone,
  title,
  children,
  onDismiss,
  className,
}: {
  tone: keyof typeof ALERT;
  title: React.ReactNode;
  children?: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  const { icon: Icon, cls, body } = ALERT[tone];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: dur.base, ease: ease.out }}
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-sm border px-4 py-3.5", cls, className)}
    >
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold tracking-tight">{title}</div>
        {children && <div className={cn("mt-0.5 text-sm", body)}>{children}</div>}
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="rounded-md p-1 text-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground" aria-label="Dismiss">
          <X className="size-4" />
        </button>
      )}
    </motion.div>
  );
}

// ------------------------------------------------------------ empty/loading
export function EmptyState({ icon: Icon = Inbox, title, hint, action }: { icon?: React.ComponentType<{ className?: string }>; title: string; hint?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <motion.div {...fadeUp} className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="grid size-10 place-items-center rounded-sm border-2 border-ink bg-card text-ink">
        <Icon className="size-5" />
      </div>
      <div className="text-sm font-medium">{title}</div>
      {hint && <div className="max-w-sm text-xs text-muted-foreground">{hint}</div>}
      {action && <div className="mt-2">{action}</div>}
    </motion.div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted/70", className)} />;
}

export function LoadingRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin", className)} />;
}

// -------------------------------------------------------------------- modal
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-ink/60" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: dur.base, ease: ease.out }}
            className="relative w-full max-w-md rounded-sm border-2 border-ink bg-popover p-5 shadow-[var(--shadow-pop)]"
          >
            <div className="label-caps mb-3">{title}</div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------- reveal on scroll
export function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  return (
    <motion.div ref={ref} className={className} initial={{ opacity: 0, y: 14 }} animate={inView ? { opacity: 1, y: 0 } : undefined} transition={{ duration: dur.slow, ease: ease.out, delay }}>
      {children}
    </motion.div>
  );
}

/** Copyable hash in monospace with an optional highlight state. */
export function HashChip({ value, n = 8, tone }: { value: string | null | undefined; n?: number; tone?: "ok" | "bad" | "warn" }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-muted-foreground">—</span>;
  const v = value.startsWith("0x") ? value.slice(2) : value;
  const text = v.length > n * 2 + 1 ? `${v.slice(0, n)}…${v.slice(-n)}` : v;
  const toneCls = tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-foreground/80";
  return (
    <button
      type="button"
      title={`${value} (click to copy)`}
      onClick={() => navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1100); })}
      className={cn("font-hash rounded px-1 text-[11.5px] transition-colors hover:bg-foreground/5", toneCls)}
    >
      {copied ? "copied" : text}
    </button>
  );
}
