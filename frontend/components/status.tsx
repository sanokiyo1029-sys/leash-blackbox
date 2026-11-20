"use client";

import { AlertBanner } from "@/components/kit";
import { cn } from "@/lib/utils";
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

const VERDICT = {
  CLEAN: ["success", "CLEAN — host logs match the on-chain proof"],
  TAMPERING_DETECTED: ["danger", "TAMPERING DETECTED"],
  OBSERVED_OMISSION: ["warn", "OBSERVED OMISSION — a witnessed session the host never reported"],
  INCONCLUSIVE: ["warn", "INCONCLUSIVE — chain unreachable"],
} as const;

export function VerdictBanner({ verdict, subtitle }: { verdict: Verdict | null | undefined; subtitle?: React.ReactNode }) {
  if (!verdict) return <AlertBanner tone="info" title="Not verified yet">{subtitle ?? "Run a verification to attest the host's logs."}</AlertBanner>;
  const [tone, title] = VERDICT[verdict];
  return (
    <AlertBanner tone={tone} title={title}>
      {subtitle}
    </AlertBanner>
  );
}
