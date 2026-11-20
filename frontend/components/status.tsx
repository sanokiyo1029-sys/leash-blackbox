"use client";

import { useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Copy, HelpCircle, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { short } from "@/lib/api";
import type { EventStatus, Protection, Verdict } from "@/lib/types";

const EVENT_STYLE: Record<EventStatus, string> = {
  INTACT: "border-ok/30 bg-ok/10 text-ok",
  MODIFIED: "border-warn/30 bg-warn/10 text-warn",
  DELETED: "border-bad/30 bg-bad/10 text-bad",
  INJECTED: "border-chart-5/40 bg-chart-5/10 text-chart-5",
};

export function StatusBadge({ status }: { status: EventStatus | string }) {
  const style = EVENT_STYLE[status as EventStatus] ?? "border-border bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold tracking-wide", style)}>
      {status}
    </span>
  );
}

export function ProtectionBadge({ protection }: { protection: Protection }) {
  const map: Record<Protection, [string, string]> = {
    anchored: ["on-chain", "text-info border-info/30 bg-info/10"],
    vault_only: ["vault only", "text-warn border-warn/30 bg-warn/10"],
    unverifiable: ["unverifiable", "text-bad border-bad/30 bg-bad/10"],
    none: ["no commitment", "text-muted-foreground border-border bg-muted"],
  };
  const [label, style] = map[protection];
  return <span className={cn("inline-flex rounded-md border px-1.5 py-0.5 text-[11px]", style)}>{label}</span>;
}

export function SeverityDot({ severity }: { severity?: string }) {
  const color =
    severity === "critical" ? "bg-bad" : severity === "high" ? "bg-warn" : severity === "medium" ? "bg-chart-5" : severity === "low" ? "bg-info" : "bg-muted-foreground/50";
  return <span className={cn("inline-block size-2 rounded-full", color)} title={severity} />;
}

export function VerdictBanner({ verdict, subtitle }: { verdict: Verdict | null | undefined; subtitle?: React.ReactNode }) {
  if (!verdict) {
    return (
      <div className="flex items-center gap-4 rounded-xl border bg-card/60 p-5">
        <HelpCircle className="size-9 text-muted-foreground" />
        <div>
          <div className="text-lg font-semibold">Not verified yet</div>
          <div className="text-sm text-muted-foreground">{subtitle ?? "Run a verification to attest the host's logs."}</div>
        </div>
      </div>
    );
  }
  const cfg = {
    CLEAN: { icon: CheckCircle2, cls: "border-ok/30 bg-ok/10 text-ok", title: "CLEAN — host logs match the on-chain proof" },
    TAMPERING_DETECTED: { icon: ShieldAlert, cls: "border-bad/40 bg-bad/10 text-bad", title: "TAMPERING DETECTED" },
    INCONCLUSIVE: { icon: AlertTriangle, cls: "border-warn/30 bg-warn/10 text-warn", title: "INCONCLUSIVE — chain unreachable" },
  }[verdict];
  const Icon = cfg.icon;
  return (
    <div className={cn("flex items-center gap-4 rounded-xl border p-5", cfg.cls)}>
      <Icon className="size-9 shrink-0" />
      <div className="min-w-0">
        <div className="text-lg font-semibold tracking-wide">{cfg.title}</div>
        {subtitle && <div className="text-sm text-foreground/80">{subtitle}</div>}
      </div>
    </div>
  );
}

export function Hash({ value, n = 8, className }: { value: string | null | undefined; n?: number; className?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <button
      type="button"
      title={value}
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className={cn("font-hash inline-flex items-center gap-1 text-xs text-foreground/85 hover:text-primary", className)}
    >
      {short(value, n)}
      {copied ? <Check className="size-3 text-ok" /> : <Copy className="size-3 opacity-40" />}
    </button>
  );
}

export function Stat({ label, value, hint, accent }: { label: string; value: React.ReactNode; hint?: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-xl border bg-card/70 p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", accent)}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function ErrorNote({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return (
    <div className="rounded-lg border border-bad/30 bg-bad/10 px-4 py-2 text-sm text-bad">
      {error}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
