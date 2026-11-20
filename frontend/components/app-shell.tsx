"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, MotionConfig, motion, useMotionValue, useSpring } from "motion/react";
import { Activity, Menu, X } from "lucide-react";
import { LiveDot } from "@/components/kit";
import { useApi } from "@/lib/api";
import { dur, ease, spring } from "@/lib/motion";
import type { Status } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/attack", label: "Attack Lab", short: "Attack Lab", featured: true },
  { href: "/", label: "Security Dashboard", short: "Dashboard" },
  { href: "/evidence", label: "Evidence Explorer", short: "Evidence" },
  { href: "/auditor", label: "Auditor", short: "Auditor" },
  { href: "/proofs", label: "Blockchain Proofs", short: "Proofs" },
  { href: "/demo", label: "Guided Demo", short: "Demo" },
  { href: "/validation", label: "Validation", short: "Validation" },
  { href: "/architecture", label: "Architecture", short: "Architecture" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

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
        "flex items-center gap-2 border-2 border-ink px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] whitespace-nowrap uppercase",
        bad ? "bg-primary text-primary-foreground" : "bg-card text-ink",
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
              "label-caps relative flex items-center gap-1.5 px-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active ? "text-primary-foreground" : "text-ink/70 hover:text-ink",
            )}
          >
            {active && <motion.span layoutId="nav-active" transition={spring.snappy} className="absolute inset-x-0.5 inset-y-2.5 bg-primary" />}
            <span className="relative">{short}</span>
            {featured && <span className={cn("relative size-1.5 rounded-full", active ? "bg-primary-foreground" : "bg-primary")} aria-label="live" />}
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
                "block border-b-2 border-ink px-5 py-3 font-display text-2xl font-black uppercase outline-none focus-visible:bg-muted",
                active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
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
      <div className="grid size-8 place-items-center border-2 border-ink bg-primary text-primary-foreground">
        <Activity className="size-4" />
      </div>
      <div className="leading-none">
        <div className="font-display text-[17px] font-black tracking-tight uppercase">Leash Blackbox</div>
        <div className="mt-0.5 hidden text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase sm:block">tamper-evident evidence</div>
      </div>
    </Link>
  );
}

const CURSOR_QUERY = "(pointer: fine) and (prefers-reduced-motion: no-preference)";
const subscribeCursor = (cb: () => void) => {
  const m = window.matchMedia(CURSOR_QUERY);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

/** The reference's small circle that trails the pointer; grows over anything clickable. Decorative only. */
function CursorDot() {
  const enabled = useSyncExternalStore(subscribeCursor, () => window.matchMedia(CURSOR_QUERY).matches, () => false);
  const x = useMotionValue(-40);
  const y = useMotionValue(-40);
  const sx = useSpring(x, { stiffness: 700, damping: 45, mass: 0.35 });
  const sy = useSpring(y, { stiffness: 700, damping: 45, mass: 0.35 });
  const [over, setOver] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const move = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      setOver(!!(e.target as Element | null)?.closest?.("a,button,[role=option],input,label,select,textarea"));
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [enabled, x, y]);
  if (!enabled) return null;
  // White dot with an ink outline (readable on paper, red and ink); over a target an ink ring opens around it.
  return (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 z-[70] -mt-5 -ml-5 size-10 rounded-full border-2 border-ink"
        style={{ x: sx, y: sy }}
        animate={{ scale: over ? 1 : 0.3, opacity: over ? 1 : 0 }}
        transition={spring.snappy}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 z-[70] -mt-1.5 -ml-1.5 size-3 rounded-full border-2 border-ink bg-white"
        style={{ x: sx, y: sy }}
      />
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: dur.base, ease: ease.out }}>
      <div className="app-backdrop flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 border-b-2 border-ink bg-paper">
          <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button className="-ml-1 p-1.5 text-ink hover:bg-ink/[0.06] xl:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu className="size-5" />
            </button>
            <Brand />
            <div className="mx-3 hidden h-6 w-0.5 bg-ink xl:block" aria-hidden />
            <TopNav />
            <div className="ml-auto hidden sm:block">
              <ChainStatus />
            </div>
            <div className="ml-auto sm:hidden">
              <ChainStatus compact />
            </div>
          </div>
        </header>

        {/* Menu below xl: a paper panel with big serif entries */}
        <AnimatePresence>
          {open && (
            <motion.div className="fixed inset-0 z-40 xl:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
              <motion.aside
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={spring.soft}
                className="absolute inset-y-0 left-0 flex w-[min(320px,88vw)] flex-col border-r-2 border-ink bg-paper"
              >
                <div className="flex h-14 items-center justify-between border-b-2 border-ink px-4">
                  <Brand />
                  <button className="p-1.5 hover:bg-ink/[0.06]" onClick={() => setOpen(false)} aria-label="Close menu">
                    <X className="size-5" />
                  </button>
                </div>
                <DrawerNav onNavigate={() => setOpen(false)} />
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>

        <footer className="border-t-2 border-ink bg-ink text-paper">
          <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6 lg:px-8">
            <p className="font-display text-lg font-black uppercase sm:text-xl">
              The attacker can erase the logs. <span className="text-primary">They cannot erase the proof.</span>
            </p>
            <p className="text-[10px] font-semibold tracking-[0.18em] text-paper/60 uppercase">The Big Hack 2.0 · Cybersecurity &amp; Blockchain · B3</p>
          </div>
        </footer>
        <CursorDot />
      </div>
    </MotionConfig>
  );
}
