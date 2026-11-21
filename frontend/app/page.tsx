"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AlertTriangle, ArrowDown, ArrowRight, Check, ChevronDown, LayoutDashboard, RotateCcw, Stamp, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { api, short, useApi } from "@/lib/api";
import { CASE_RESULT, resetCase, setCase, useCase, type Room } from "@/lib/case-state";
import type { Batch, EventItem, EventRecord, Status } from "@/lib/types";
import { cn } from "@/lib/utils";
import { leafHash, readBatch, rootFromProof, type ProofStep } from "@/lib/verify";

const MonolithScene = dynamic(() => import("@/components/monolith-scene"), { ssr: false });

// Demo case (labelled on screen as sample data), in the vocabulary of the real lab.
const ROWS = [
  { t: "02:03:11", user: "alice", ip: "10.0.4.12" },
  { t: "02:09:47", user: "bob", ip: "10.0.4.27" },
  { t: "02:14:06", user: "deploy", ip: "203.0.113.45", missing: true },
  { t: "02:22:05", user: "carol", ip: "10.0.7.3" },
  { t: "02:28:52", user: "svc-backup", ip: "10.0.9.41" },
];

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });

// The 3D rack needs WebGL2; reduced motion gets it still (no flow or sway, rendered on demand).
let webgl: boolean | undefined;
const motionQuery = () => matchMedia("(prefers-reduced-motion: reduce)");
const subscribeMode = (f: () => void) => {
  const q = motionQuery();
  q.addEventListener("change", f);
  return () => q.removeEventListener("change", f);
};
const getMode = () => {
  webgl ??= !!document.createElement("canvas").getContext("webgl2");
  return !webgl ? "none" : motionQuery().matches ? "still" : "live";
};

const pill = "inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";
const pillSolid = `${pill} bg-foreground text-background hover:bg-foreground/85`;
const pillGhost = `${pill} border border-foreground/25 hover:border-foreground/60`;

export default function Home() {
  const mode = useSyncExternalStore(subscribeMode, getMode, () => "none" as const);
  const { begun } = useCase();
  const [active, setActive] = useState(true);
  const [hoverSlot, setHoverSlot] = useState(false);

  useEffect(() => {
    // The section crossing the middle of the screen is the current one (Wick follows it); the rack sleeps off screen.
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setCase({ room: (e.target as HTMLElement).dataset.room as Room })),
      { rootMargin: "-45% 0px -45% 0px" },
    );
    document.querySelectorAll("[data-room]").forEach((s) => io.observe(s));
    const vis = new IntersectionObserver(([e]) => setActive(e.isIntersecting));
    const hero = document.getElementById("top");
    if (hero) vis.observe(hero);
    return () => {
      io.disconnect();
      vis.disconnect();
    };
  }, []);

  const open = (e?: React.MouseEvent) => {
    e?.preventDefault();
    setCase({ begun: true });
    setTimeout(() => document.getElementById("case")?.focus({ preventScroll: true }), 0);
  };

  return (
    <>
      <section id="top" data-room="gate" aria-labelledby="hero-title" className="hero-obsidian relative isolate min-h-[calc(100svh-56px)] overflow-hidden">
        {mode !== "none" && (
          // Phones: the rack gets its own zone between the headline and the copy; desktop: it fills the hero.
          <div className="absolute inset-x-0 top-[205px] h-[40svh] lg:inset-0 lg:h-auto">
            <MonolithScene
              active={active}
              reduce={mode === "still"}
              begun={begun}
              onSlot={(hover, click) => {
                setHoverSlot(hover);
                if (click) open();
              }}
            />
          </div>
        )}

        <div className="pointer-events-none relative z-10 mx-auto flex min-h-[calc(100svh-56px)] w-full max-w-[1400px] flex-col px-[clamp(20px,4vw,56px)] pt-8 pb-24 lg:pt-14 lg:pb-10">
          <div className="pointer-events-auto max-w-[660px]">
            <p className="text-[11px] font-medium tracking-[0.28em] text-muted-foreground uppercase">Leash Blackbox · evidence infrastructure</p>
            <h1 id="hero-title" className="font-instrument mt-4 text-[clamp(46px,7.2vw,116px)] leading-[0.9] uppercase">
              Prove what happened
              <span className="mt-2 block text-[0.56em] leading-[1] text-foreground/75">— sealed, witnessed, anchored.</span>
            </h1>
          </div>

          <div className="mt-auto flex flex-wrap items-end justify-between gap-6 pt-[42svh] lg:pt-10">
            <div className="pointer-events-auto max-w-[400px]">
              <p className="text-[15px] leading-relaxed text-muted-foreground">
                LEASH BLACKBOX keeps an independent, tamper-evident copy of a server&apos;s logs. One blade in this rack is dark: a session the
                server never logged.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <a href="#case" onClick={open} className={pillSolid}>
                  Investigate the missing session <ArrowRight className="size-4" />
                </a>
                <Link href="/dashboard" className={pillGhost}>
                  <LayoutDashboard className="size-4" /> Open dashboard
                </Link>
              </div>
            </div>
            <ChainCard />
          </div>
        </div>

        <p aria-live="polite" className="pointer-events-none absolute inset-x-0 bottom-2.5 z-10 px-4 text-center text-xs text-muted-foreground">
          {hoverSlot ? "02:14:06 · the witness saw this session, the host never logged it · click to open the case" : mode !== "none" ? "Drag to turn the rack" : ""}
        </p>
        {begun && <CaseCard onClose={() => setCase({ begun: false })} />}
      </section>

      <section id="seal" data-room="seal" aria-labelledby="seal-title" className="scroll-mt-14 border-t border-border">
        <div className="mx-auto grid w-full max-w-[1400px] gap-10 px-[clamp(20px,4vw,56px)] py-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:py-24">
          <div>
            <p className="text-[11px] font-medium tracking-[0.28em] text-muted-foreground uppercase">Live, not a mock-up</p>
            <h2 id="seal-title" className="font-instrument mt-4 text-[clamp(40px,5vw,76px)] leading-[0.92] uppercase">
              Verify a real record
            </h2>
            <p className="mt-5 max-w-[46ch] text-[15px] leading-relaxed text-muted-foreground">
              Your browser hashes a record from this stack, climbs its Merkle proof and compares the root with the commitment on-chain. Then it
              does the same for a copy with one detail changed.
            </p>
          </div>
          <div className="glass rounded-2xl p-5 sm:p-6">
            <SealPress />
          </div>
        </div>
      </section>
    </>
  );
}

/** Lower-right glass card: the live chain this page is talking to. */
function ChainCard() {
  const { data, error } = useApi<Status>("/api/status", 8000);
  return (
    <div className="glass pointer-events-auto w-full rounded-2xl p-4 sm:w-[300px]">
      <p className="font-instrument text-[24px] leading-[1.02] uppercase">
        The log can lie —<br />
        the chain remembers.
      </p>
      <p className="mt-3 font-hash text-[11px] text-muted-foreground">
        {error ? "Evidence service offline" : data ? `Chain ${data.chain.chain_id ?? "?"} · block ${data.chain.latest_block ?? "?"} · ${data.counts.anchored_events} events anchored` : "Connecting to the chain…"}
      </p>
      <a
        href="#seal"
        onClick={(e) => {
          e.preventDefault();
          go("seal");
        }}
        className="mt-3 inline-flex items-center gap-1 text-sm font-semibold underline-offset-4 hover:underline"
      >
        Verify a real record <ArrowDown className="size-3.5" />
      </a>
    </div>
  );
}

/** The demo case, opened from the button or the rack's dark slot. */
function CaseCard({ onClose }: { onClose: () => void }) {
  return (
    <div
      id="case"
      tabIndex={-1}
      role="region"
      aria-labelledby="case-title"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      className="glass absolute inset-x-3 bottom-3 z-20 max-h-[72%] overflow-y-auto rounded-2xl p-4 outline-none sm:p-5 lg:inset-x-auto lg:bottom-10 lg:left-[clamp(20px,4vw,56px)] lg:w-[560px]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.2em] text-muted-foreground uppercase">Demo case · sample data, not a live verification</p>
          <h2 id="case-title" className="font-instrument mt-1 text-[34px] leading-none uppercase">
            The missing session
          </h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close the case" className="rounded-full p-1.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">web-prod-01, 02:00–02:30 UTC: the server&apos;s SSH log next to the network tap&apos;s signed record.</p>
      <ol className="mt-3 divide-y divide-border rounded-lg border border-border font-hash text-[12px]">
        {ROWS.map((r) => (
          <li key={r.t} className={cn("grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 px-3 py-2", r.missing && "border-l-4 border-l-warn bg-warn/10 pl-2")}>
            <span className="text-muted-foreground">{r.t}</span>
            <span className="min-w-0">
              <span className="block">
                <span className="text-muted-foreground">host </span>
                {r.missing ? <span className="font-sans font-semibold text-bad">No entry in the host log</span> : `${r.user} from ${r.ip}`}
              </span>
              <span className="block">
                <span className="text-muted-foreground">tap </span>
                {r.user} from {r.ip} · signed
              </span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[15px] font-semibold">{CASE_RESULT}</p>
      <p className="mt-1 text-xs text-muted-foreground">It proves the two records differ, not who removed the entry or why.</p>
      <button type="button" onClick={() => go("seal")} className={cn(pillSolid, "mt-4")}>
        Verify a real record <ArrowDown className="size-4" />
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ the seal press: a real record, a real proof, the real commitment
type BundleEvent = { seq: number; batch_id: number; leaf_index: number; record: EventRecord; proof: ProofStep[] };
type Detail = { proof: BundleEvent | null };
type Outcome = {
  sample: BundleEvent;
  altered: EventRecord;
  checks: { leaf: string; root: string; ok: boolean }[]; // [original, altered]
  anchor: { root: string; block: number | null; by: "browser" | "api"; rpc?: string };
  batch: Batch | null;
  chainId: number | null;
  contract: string | null;
};
const ATTACKER = "203.0.113.45";
/** The altered copy: the attacker's address laundered to an internal one, as the Attack Lab's alter_evidence does. */
const alter = (r: EventRecord): EventRecord => (r.msg.includes(ATTACKER) ? { ...r, msg: r.msg.replaceAll(ATTACKER, "10.0.4.12") } : { ...r, actor: `${r.actor}-x` });

function SealPress() {
  const { howOpen } = useCase();
  const status = useApi<Status>("/api/status");
  const events = useApi<{ items: EventItem[] }>("/api/events?order=asc&limit=1000");
  const pickSeq = (() => {
    const anchored = events.data?.items.filter((i) => i.protection === "anchored" && i.record) ?? [];
    return (anchored.find((i) => i.record!.msg.includes(ATTACKER)) ?? anchored[0])?.seq ?? null;
  })();
  const detail = useApi<Detail>(pickSeq === null ? null : `/api/events/${pickSeq}`);
  const sample = detail.data?.proof ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState<Outcome | null>(null);

  const verify = async () => {
    if (!sample) return;
    setBusy(true);
    setError(null);
    try {
      const s = status.data ?? (await api<Status>("/api/status"));
      const contract = s.deployment?.contract_address ?? null;
      const info = await api<{ batch: Batch; onchain: { merkle_root?: string; block_number?: number } | null }>(`/api/batches/${sample.batch_id}`);
      // The commitment: read from the chain by this browser when it can, else as the LEASH API read it (labelled).
      const own = contract && s.chain.rpc_url ? await readBatch(s.chain.rpc_url, contract, sample.batch_id) : null;
      const anchor = own
        ? { root: own.merkle_root, block: own.block_number, by: "browser" as const, rpc: s.chain.rpc_url }
        : info.onchain?.merkle_root
          ? { root: info.onchain.merkle_root, block: info.onchain.block_number ?? null, by: "api" as const }
          : null;
      if (!anchor) throw new Error("No commitment could be read from the chain, so nothing was verified.");
      const altered = alter(sample.record);
      const checks = await Promise.all(
        [sample.record, altered].map(async (rec) => {
          const leaf = await leafHash(rec);
          const root = await rootFromProof(leaf, sample.proof);
          return { leaf, root, ok: rec.seq === sample.seq && root === anchor.root.toLowerCase() };
        }),
      );
      setOut({ sample, altered, checks, anchor, batch: info.batch, chainId: s.chain.chain_id ?? null, contract });
      setCase({ seal: { seq: sample.seq, original: checks[0].ok, altered: checks[1].ok, block: anchor.block, chainId: s.chain.chain_id ?? null } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const offline = status.error || events.error;
  return (
    <>
      <p className="mt-2 text-[15px] leading-relaxed">
        Check a real record from this stack against the commitment anchored on-chain: the original, and a copy with one detail changed.
      </p>
      {offline ? (
        <p role="status" className="mt-3 rounded-md border border-warn/50 px-3 py-2 text-sm">
          <AlertTriangle className="mr-1.5 inline size-4 align-[-3px] text-warn" aria-hidden />
          The evidence service is offline, so nothing can be verified right now. Start the stack with <span className="font-hash">scripts\start-all.cmd</span>.
        </p>
      ) : !sample ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {events.loading || detail.loading ? "Fetching a sealed record from this stack…" : "There is no anchored record on this stack yet, so there is nothing to verify."}
        </p>
      ) : (
        <>
          <div className="mt-3 grid gap-2 font-hash text-[12px] sm:grid-cols-2">
            <SampleCard title="Original sample" rec={sample.record} />
            <SampleCard title="Altered copy" rec={alter(sample.record)} changed={sample.record} />
          </div>
          <button type="button" onClick={verify} disabled={busy} className={cn(buttonVariants({ size: "lg" }), "mt-4 h-11 gap-2 px-5")}>
            <Stamp className="size-4" /> {busy ? "Verifying…" : "Verify evidence"}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-bad">
          {error}
        </p>
      )}
      <div aria-live="polite">
        {out && (
          <div className="mt-4 space-y-2">
            <Verdict ok={out.checks[0].ok} title="Original sample" text={out.checks[0].ok ? `Matches the seal: its digest climbs ${out.sample.proof.length} proof steps to the root anchored in block ${out.anchor.block ?? "?"}.` : "Does not match the seal: this record is not what was anchored."} />
            <Verdict ok={out.checks[1].ok} title="Altered copy" text={out.checks[1].ok ? "Matches the seal." : "Does not match: one changed detail gives a different digest, so it climbs to a different root."} />
            <details id="how-verified" open={howOpen} onToggle={(e) => setCase({ howOpen: e.currentTarget.open })} className="group rounded-md border border-border">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <ChevronDown className="size-4 -rotate-90 transition-transform group-open:rotate-0" aria-hidden /> Show hashes and the transaction
              </summary>
              <dl className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-x-2 gap-y-1 border-t border-border px-3 py-2.5 text-xs [&_dd]:font-hash [&_dd]:break-all">
                <dt className="text-muted-foreground">Evidence</dt>
                <dd>
                  record #{out.sample.seq} · {out.sample.record.id} · batch #{out.sample.batch_id} · leaf {out.sample.leaf_index}
                </dd>
                <dt className="text-muted-foreground">Digest (original)</dt>
                <dd>{out.checks[0].leaf}</dd>
                <dt className="text-muted-foreground">Digest (altered)</dt>
                <dd>{out.checks[1].leaf}</dd>
                <dt className="text-muted-foreground">Inclusion proof</dt>
                <dd>{out.sample.proof.map((p) => `${p.side} ${short(p.hash, 6)}`).join(" · ")}</dd>
                <dt className="text-muted-foreground">Root (original)</dt>
                <dd>{out.checks[0].root}</dd>
                <dt className="text-muted-foreground">Root (altered)</dt>
                <dd>{out.checks[1].root}</dd>
                <dt className="text-muted-foreground">Commitment</dt>
                <dd>
                  {out.anchor.root} · LeashAnchor.getBatch({out.sample.batch_id}) · block {out.anchor.block ?? "?"}
                </dd>
                <dt className="text-muted-foreground">Read by</dt>
                <dd className="!font-sans">{out.anchor.by === "browser" ? `your browser, from ${out.anchor.rpc}` : "the LEASH API (your browser could not reach the chain)"}</dd>
                <dt className="text-muted-foreground">Transaction</dt>
                <dd>{out.batch?.tx_hash ?? "—"}</dd>
                <dt className="text-muted-foreground">Contract</dt>
                <dd>{out.contract ?? "—"}</dd>
                <dt className="text-muted-foreground">Network</dt>
                <dd className="!font-sans">
                  Local development chain {out.chainId ?? "?"} (Hardhat). Not Quai: no Quai deployment is set up yet, so there is no public explorer link.
                </dd>
              </dl>
            </details>
          </div>
        )}
      </div>
      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
        <Link href="/dashboard" className={cn(buttonVariants({ size: "lg" }), "h-11 gap-2 px-4")}>
          Open investigation dashboard <ArrowRight className="size-4" />
        </Link>
        <button
          type="button"
          onClick={() => {
            resetCase();
            setOut(null);
            setError(null);
            go("top");
          }}
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 gap-2 px-4")}
        >
          <RotateCcw className="size-4" /> Replay case
        </button>
      </div>
    </>
  );
}

function SampleCard({ title, rec, changed }: { title: string; rec: EventRecord; changed?: EventRecord }) {
  return (
    <div className="rounded-md border border-border px-2.5 py-2">
      <p className="font-sans text-sm font-semibold">{title}</p>
      <p className="mt-1 text-muted-foreground">
        #{rec.seq} · {rec.ts.slice(11, 19)} · {rec.type}
      </p>
      <p className={cn("mt-0.5 break-words", changed && changed.msg !== rec.msg && "text-bad")}>{rec.msg}</p>
      {changed && changed.actor !== rec.actor && <p className="text-bad">actor: {rec.actor}</p>}
    </div>
  );
}

function Verdict({ ok, title, text }: { ok: boolean; title: string; text: string }) {
  return (
    <p className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-sm", ok ? "border-ok/50" : "border-bad/50 bg-bad/10")}>
      {ok ? <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden /> : <X className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden />}
      <span>
        <b>
          {title}: {ok ? "match" : "no match"}.
        </b>{" "}
        {text}
      </span>
    </p>
  );
}
