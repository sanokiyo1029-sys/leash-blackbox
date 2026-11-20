"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  Activity,
  Blocks,
  FileSearch,
  FlaskConical,
  Gauge,
  Menu,
  Network,
  Presentation,
  ShieldCheck,
  Swords,
  X,
} from "lucide-react";
import { LiveDot } from "@/components/kit";
import { useApi } from "@/lib/api";
import { dur, ease, spring } from "@/lib/motion";
import type { Status } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/attack", label: "Attack Lab", icon: Swords, featured: true },
  { href: "/", label: "Security Dashboard", icon: Gauge },
  { href: "/evidence", label: "Evidence Explorer", icon: FileSearch },
  { href: "/auditor", label: "Auditor", icon: ShieldCheck },
  { href: "/proofs", label: "Blockchain Proofs", icon: Blocks },
  { href: "/demo", label: "Guided Demo", icon: Presentation },
  { href: "/validation", label: "Validation", icon: FlaskConical },
  { href: "/architecture", label: "Architecture", icon: Network },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function ChainStatus({ compact = false }: { compact?: boolean }) {
  const { data, error } = useApi<Status>("/api/status", 5000);
  const ok = !!data?.chain.connected && data.chain.contract_present !== false && !error;
  const label = error
    ? "API offline"
    : !data
      ? "Connecting…"
      : ok
        ? compact
          ? `Block ${data.chain.latest_block}`
          : `Chain ${data.chain.chain_id} · block ${data.chain.latest_block}`
        : data.chain.connected
          ? "Contract missing — reset lab"
          : "Chain unreachable";
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1 text-xs whitespace-nowrap transition-colors",
        ok ? "border-ok/25 bg-ok/[0.07] text-ok" : data || error ? "border-bad/30 bg-bad/[0.08] text-bad" : "border-border text-muted-foreground",
      )}
      title={error ?? data?.chain.error ?? data?.chain.rpc_url}
      aria-live="polite"
    >
      <LiveDot tone={ok ? "ok" : data || error ? "bad" : "muted"} pulse={ok} />
      <span className="tabular">{label}</span>
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Primary">
      {NAV.map(({ href, label, icon: Icon, featured }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId="nav-active"
                transition={spring.snappy}
                className="absolute inset-0 rounded-xl bg-sidebar-accent ring-1 ring-primary/25"
              />
            )}
            <Icon className={cn("relative size-4 transition-colors", active ? "text-primary" : "group-hover:text-foreground", featured && !active && "text-bad/80")} />
            <span className="relative">{label}</span>
            {featured && (
              <span className="relative ml-auto rounded-md border border-bad/30 bg-bad/10 px-1.5 py-px text-[10px] font-semibold tracking-wide text-bad">LIVE</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="relative grid size-9 place-items-center rounded-xl bg-gradient-to-br from-primary/25 to-violet/20 text-primary ring-1 ring-primary/30">
        <Activity className="size-[18px]" />
      </div>
      <div className="leading-tight">
        <div className="text-[13px] font-semibold tracking-[0.12em]">LEASH BLACKBOX</div>
        <div className="text-[11px] text-muted-foreground">tamper-evident evidence</div>
      </div>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: dur.base, ease: ease.out }}>
      <div className="app-backdrop flex min-h-screen">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar/70 px-3 backdrop-blur-xl lg:flex">
          <div className="px-2 py-5">
            <Brand />
          </div>
          <NavLinks />
          <div className="mt-auto space-y-3 px-2 py-5">
            <ChainStatus />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              The attacker can erase the logs.
              <br />
              <span className="text-foreground/85">They cannot erase the proof.</span>
            </p>
          </div>
        </aside>

        {/* Mobile drawer */}
        <AnimatePresence>
          {open && (
            <motion.div className="fixed inset-0 z-40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
              <motion.aside
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={spring.soft}
                className="absolute inset-y-0 left-0 flex w-[280px] flex-col border-r bg-sidebar px-3 shadow-[var(--shadow-pop)]"
              >
                <div className="flex items-center justify-between px-2 py-5">
                  <Brand />
                  <button className="rounded-lg p-2 text-muted-foreground hover:bg-muted" onClick={() => setOpen(false)} aria-label="Close menu">
                    <X className="size-5" />
                  </button>
                </div>
                <NavLinks onNavigate={() => setOpen(false)} />
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border/70 bg-background/65 px-4 backdrop-blur-xl sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
                <Menu className="size-5" />
              </button>
              <div className="lg:hidden">
                <Brand />
              </div>
              <div className="hidden truncate text-xs text-muted-foreground lg:block">
                The Big Hack 2.0 · Cybersecurity &amp; Blockchain · B3 — Logs the attacker can&apos;t erase
              </div>
            </div>
            <div className="hidden sm:block">
              <ChainStatus />
            </div>
            <div className="sm:hidden">
              <ChainStatus compact />
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </MotionConfig>
  );
}
