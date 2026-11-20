"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Archive, Menu, X } from "lucide-react";
import { LiveDot } from "@/components/kit";
import { ThemeControl } from "@/components/theme-control";
import { Wick } from "@/components/wick";
import { useApi } from "@/lib/api";
import { dur, ease, spring } from "@/lib/motion";
import type { Status } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/attack", label: "Attack Lab", short: "Attack Lab", featured: true },
  { href: "/dashboard", label: "Security Dashboard", short: "Dashboard" },
  { href: "/evidence", label: "Evidence Explorer", short: "Evidence" },
  { href: "/auditor", label: "Auditor", short: "Auditor" },
  { href: "/proofs", label: "Blockchain Proofs", short: "Proofs" },
  { href: "/demo", label: "Guided Demo", short: "Demo" },
  { href: "/validation", label: "Validation", short: "Validation" },
  { href: "/architecture", label: "Architecture", short: "Architecture" },
];

const isActive = (pathname: string, href: string) => pathname.startsWith(href);

/** The small white tag fixed top-right, as in the reference: live chain state. */
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
  const bad = !ok && (!!data || !!error);
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-[3px] border px-2.5 py-1 font-hash text-[11px] font-medium whitespace-nowrap",
        bad ? "border-transparent bg-bad text-paper" : "border-border bg-card text-muted-foreground",
      )}
      title={error ?? data?.chain.error ?? data?.chain.rpc_url}
      aria-live="polite"
    >
      <LiveDot tone={ok ? "ok" : "muted"} pulse={ok} />
      <span className="tabular">{label}</span>
    </div>
  );
}

function TopNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden self-stretch xl:flex" aria-label="Primary">
      {NAV.map(({ href, short, featured }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-1.5 px-2.5 text-[13px] font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && <motion.span layoutId="nav-active" transition={spring.snappy} className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-primary" />}
            <span className="relative">{short}</span>
            {featured && <span className="relative size-1.5 rounded-full bg-primary" aria-hidden />}
          </Link>
        );
      })}
    </nav>
  );
}

function DrawerNav({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col" aria-label="Primary">
      {NAV.map(({ href, label }, i) => {
        const active = isActive(pathname, href);
        return (
          <motion.div key={href} initial={{ x: -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ ...spring.soft, delay: 0.04 * i }}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "block border-b border-border px-5 py-3 text-[15px] font-medium outline-none focus-visible:bg-muted",
                active ? "bg-card text-primary" : "hover:bg-muted",
              )}
            >
              {label}
            </Link>
          </motion.div>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="grid size-8 place-items-center rounded-[3px] border border-primary/60 text-primary">
        <Archive className="size-4" />
      </div>
      <div className="leading-none">
        <div className="font-display text-[20px] font-semibold tracking-[0.01em]">Leash Blackbox</div>
        <div className="mt-0.5 hidden text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase sm:block">tamper-evident evidence</div>
      </div>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // The homepage and the Dashboard use full-bleed scenes; the Dashboard has no footer.
  const dashboard = pathname.startsWith("/dashboard");
  const scene = pathname === "/" || dashboard;
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: dur.base, ease: ease.out }}>
      <div className="app-backdrop flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button className="-ml-1 rounded-[3px] p-1.5 text-foreground hover:bg-muted xl:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu className="size-5" />
            </button>
            <Brand />
            <div className="mx-2 hidden h-6 w-px bg-border xl:block" aria-hidden />
            <TopNav />
            <div className="ml-auto hidden sm:block">
              <ChainStatus />
            </div>
            <div className="ml-auto sm:hidden">
              <ChainStatus compact />
            </div>
            <div className="hidden xl:block">
              <ThemeControl name="theme-desktop" />
            </div>
          </div>
        </header>

        {/* Menu below xl: a paper panel with big serif entries */}
        <AnimatePresence>
          {open && (
            <motion.div className="fixed inset-0 z-40 xl:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="absolute inset-0 bg-black/55" onClick={() => setOpen(false)} />
              <motion.aside
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={spring.soft}
                className="absolute inset-y-0 left-0 flex w-[min(320px,88vw)] flex-col overflow-y-auto border-r border-border bg-background"
              >
                <div className="flex h-14 items-center justify-between border-b border-border px-4">
                  <Brand />
                  <button className="rounded-[3px] p-1.5 hover:bg-muted" onClick={() => setOpen(false)} aria-label="Close menu">
                    <X className="size-5" />
                  </button>
                </div>
                <DrawerNav onNavigate={() => setOpen(false)} />
                <div className="mt-auto border-t border-border px-5 py-4">
                  <div className="mb-2 text-xs font-medium text-muted-foreground">Appearance</div>
                  <ThemeControl name="theme-mobile" labels />
                </div>
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>

        <main className={cn("flex-1", scene ? "w-full" : "mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8")}>{children}</main>

        {!dashboard && (
          <footer className="border-t border-border bg-card">
            <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-5 pr-28 sm:px-6 sm:pr-32 lg:px-8 lg:pr-36">
              <p className="font-display text-lg font-semibold sm:text-xl">
                The attacker can erase the logs. <span className="text-primary">They cannot erase the proof.</span>
              </p>
              <p className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">The Big Hack 2.0 · Cybersecurity &amp; Blockchain · B3</p>
            </div>
          </footer>
        )}
        <Wick />
      </div>
    </MotionConfig>
  );
}
