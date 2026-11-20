"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Blocks,
  FileSearch,
  FlaskConical,
  Gauge,
  Network,
  Presentation,
  ShieldCheck,
  Skull,
} from "lucide-react";
import { useApi } from "@/lib/api";
import type { Status } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/demo", label: "Live Demo", icon: Presentation },
  { href: "/", label: "Security Dashboard", icon: Gauge },
  { href: "/evidence", label: "Evidence Explorer", icon: FileSearch },
  { href: "/proofs", label: "Blockchain Proofs", icon: Blocks },
  { href: "/attack", label: "Attack Simulation", icon: Skull },
  { href: "/auditor", label: "Auditor Portal", icon: ShieldCheck },
  { href: "/validation", label: "Validation", icon: FlaskConical },
  { href: "/architecture", label: "Architecture", icon: Network },
];

function ChainPill() {
  const { data, error } = useApi<Status>("/api/status", 5000);
  const ok = !!data?.chain.connected && data.chain.contract_present !== false && !error;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1 text-xs",
        ok ? "border-ok/30 bg-ok/10 text-ok" : "border-bad/30 bg-bad/10 text-bad",
      )}
      title={error ?? data?.chain.error ?? undefined}
    >
      <span className={cn("size-1.5 rounded-full", ok ? "bg-ok animate-pulse" : "bg-bad")} />
      {error
        ? "API offline"
        : !data
          ? "connecting…"
          : ok
            ? `Chain ${data.chain.chain_id} · block ${data.chain.latest_block}`
            : data.chain.connected
              ? "Contract missing — reset demo"
              : "Chain unreachable"}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="grid-glow flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/80 backdrop-blur md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="grid size-9 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
            <Activity className="size-5" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-wide">LEASH BLACKBOX</div>
            <div className="text-[11px] text-muted-foreground">tamper-evident evidence</div>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 px-3">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-foreground ring-1 ring-primary/20"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                <Icon className={cn("size-4", active && "text-primary")} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-5 py-5 text-[11px] leading-relaxed text-muted-foreground">
          The attacker can erase the logs.
          <br />
          <span className="text-foreground/80">They cannot erase the proof.</span>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-background/70 px-6 py-3 backdrop-blur">
          <nav className="flex gap-1 overflow-x-auto md:hidden">
            {NAV.map(({ href, icon: Icon, label }) => (
              <Link key={href} href={href} title={label} className="rounded-md p-2 text-muted-foreground hover:text-foreground">
                <Icon className="size-4" />
              </Link>
            ))}
          </nav>
          <div className="hidden text-xs text-muted-foreground md:block">
            The Big Hack 2.0 · Cybersecurity &amp; Blockchain · B3 — Logs the attacker can&apos;t erase
          </div>
          <ChainPill />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
