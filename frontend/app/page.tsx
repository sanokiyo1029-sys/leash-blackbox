"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ArrowDown, ArrowRight, Check, ChevronDown, Download, Eye, EyeOff, LayoutDashboard, Play, RotateCcw, Stamp, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { api, short, useApi } from "@/lib/api";
import { CASE_RESULT, resetCase, ROOMS, SESSION, setCase, useCase, type Room } from "@/lib/case-state";
import { ease } from "@/lib/motion";
import type { Batch, EventItem, EventRecord, Status, VerificationReport } from "@/lib/types";
import { cn } from "@/lib/utils";
import { leafHash, readBatch, rootFromProof, type ProofStep } from "@/lib/verify";

const FortressScene = dynamic(() => import("@/components/fortress-scene"), { ssr: false });
const SealScene = dynamic(() => import("@/components/seal-scene"), { ssr: false });

// The sample case (labelled on screen): the server's SSH log and the witness record for the same half hour.
const ROWS = [
  { t: "02:03:11", user: "alice", ip: "10.0.4.12" },
  { t: "02:09:47", user: "bob", ip: "10.0.4.27" },
  { t: SESSION.time, user: SESSION.user, ip: SESSION.ip, missing: true },
  { t: "02:22:05", user: "carol", ip: "10.0.7.3" },
  { t: "02:28:52", user: "svc-backup", ip: "10.0.9.41" },
];

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });

// The 3D fortress: desktop-sized screens with WebGL2 and motion allowed. Everyone else gets a composed still per
// chapter (the same scene, rendered) and the same working controls.
let webgl: boolean | undefined;
const subscribeMode = (f: () => void) => {
  const q = [matchMedia("(prefers-reduced-motion: reduce)"), matchMedia("(min-width: 1024px)")];
  q.forEach((m) => m.addEventListener("change", f));
  return () => q.forEach((m) => m.removeEventListener("change", f));
};
const getMode = () => {
  webgl ??= !!document.createElement("canvas").getContext("webgl2");
  return webgl && !reduced() && matchMedia("(min-width: 1024px)").matches ? "3d" : "still";
};

const pill = "inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-semibold outline-none transition-[background-color,border-color,transform] duration-150 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring";
const pillSolid = `${pill} bg-primary text-primary-foreground hover:brightness-110`;
const pillGhost = `${pill} border border-foreground/30 bg-background/30 backdrop-blur-sm hover:border-foreground/70`;
const wrap = "mx-auto w-full max-w-[1320px] px-[clamp(20px,4vw,56px)]";
const kicker = "label-caps text-[11px] tracking-[0.24em] text-muted-foreground";
const panel = "rounded-2xl border border-border bg-background/80 p-5 shadow-[var(--shadow-pop)] backdrop-blur-md sm:p-6";

export default function Home() {
  const mode = useSyncExternalStore(subscribeMode, getMode, () => "still" as const);

  useEffect(() => {
    // The section crossing the middle of the screen is the current chapter (Wick and the stills follow it).
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setCase({ room: (e.target as HTMLElement).dataset.room as Room })),
      { rootMargin: "-45% 0px -45% 0px" },
    );
    document.querySelectorAll("[data-room]").forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  const investigate = (e: React.MouseEvent) => {
    e.preventDefault();
    go("missing");
    setTimeout(() => document.getElementById("missing-title")?.focus({ preventScroll: true }), reduced() ? 0 : 700);
  };

  return (
    <div className="relative isolate">
      <a href="#missing" onClick={investigate} className="sr-only z-40 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-16 focus:left-4">
        Skip to the investigation
      </a>
      {/* The composed stills load first; on desktop the live fortress draws over them once it is ready. */}
      <Stills />
      {mode === "3d" && (
        <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
          <FortressScene />
        </div>
      )}

      {/* THE BRIDGE: before dawn, the gatehouse lit across the ravine */}
      <section id="top" data-room="bridge" aria-labelledby="hero-title" className="relative flex min-h-[calc(100svh-56px)] items-end">
        <Scrim />
        <div className={cn(wrap, "relative pb-[12vh] pt-24")}>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: ease.out }} className="max-w-[640px]">
            <p className={kicker}>Leash Blackbox · evidence kept outside the server</p>
            <h1 id="hero-title" className="font-display mt-5 text-[clamp(40px,5.6vw,84px)] leading-[1.02] text-balance">
              Know what happened.
              <br />
              <span className="text-foreground/80">Even when your server lies.</span>
            </h1>
            <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-foreground/80">When a server&apos;s logs change, compare them with evidence preserved outside it.</p>
            <div className="mt-8 flex flex-wrap gap-2.5">
              <a href="#missing" onClick={investigate} className={pillSolid}>
                Investigate the missing session <ArrowRight className="size-4" />
              </a>
              <a
                href="#gatehouse"
                onClick={(e) => {
                  e.preventDefault();
                  go("gatehouse");
                }}
                className={pillGhost}
              >
                Explore the fortress <ArrowDown className="size-4" />
              </a>
            </div>
          </motion.div>
        </div>
        <ChainLine />
      </section>

      {/* I. THE GATEHOUSE: the camera crosses the bridge and passes under the gate */}
      <section id="gatehouse" data-room="gatehouse" aria-labelledby="gatehouse-title" className="relative min-h-[170svh]">
        <Scrim />
        <div className={cn(wrap, "sticky top-[18vh]")}>
          <Caption n="I" id="gatehouse-title" title="The gatehouse">
            Everything the server sends is copied past these walls as it happens. The amber window above the courtyard is the archive: the server cannot reach it.
          </Caption>
        </div>
      </section>

      {/* II. THE WITNESS PASSAGE: two records of one session */}
      <section id="witness" data-room="witness" aria-labelledby="witness-title" className="relative min-h-[140svh]">
        <Scrim />
        <div className={cn(wrap, "sticky top-[14vh] grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]")}>
          <Caption n="II" id="witness-title" title="The witness passage">
            Through the slit, a second passage runs beside yours. The gateway records every session that crosses it and signs the record with a key the server never holds.
          </Caption>
          <div className={panel}>
            <SampleNote />
            <p className="mt-3 text-sm text-muted-foreground">One session, two records:</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <SessionRecord title="Server's own log" where={`${SESSION.host} · /var/log/auth.log`} />
              <SessionRecord title="Witness record" where="gateway · signed, kept outside the server" signed />
            </div>
          </div>
        </div>
      </section>

      {/* III. THE MISSING SESSION: the guard desk */}
      <section id="missing" data-room="missing" aria-labelledby="missing-title" className="relative min-h-[100svh] scroll-mt-14 py-[12vh]">
        <Scrim />
        <div className={cn(wrap, "grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]")}>
          <Caption n="III" id="missing-title" title="The missing session" focusable>
            At the guard desk, both records lie side by side, line for line. Show the server&apos;s log as it reads after the attack and find what is gone.
          </Caption>
          <GuardDesk />
        </div>
      </section>

      {/* IV. THE SEAL ROOM: a real record against the real commitment */}
      <section id="seal" data-room="seal" aria-labelledby="seal-title" className="relative min-h-[100svh] scroll-mt-14 py-[12vh]">
        <Scrim />
        <div className={cn(wrap, "grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]")}>
          <Caption n="IV" id="seal-title" title="Verify a real record">
            Each batch of records is sealed into one Merkle root and committed on-chain. Your browser recomputes the root from a real record and compares.
          </Caption>
          <SealRoom mode={mode} />
        </div>
      </section>

      {/* V. THE AUDITOR'S DESK: the real product */}
      <section id="desk" data-room="desk" aria-labelledby="desk-title" className="relative min-h-[100svh] scroll-mt-14 py-[12vh]">
        <Scrim />
        <div className={cn(wrap, "grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]")}>
          <Caption n="V" id="desk-title" title="The auditor's desk">
            Now run the same incident for real against this stack: the server&apos;s agent goes silent during a login, and the evidence decides.
          </Caption>
          <AuditorDesk />
        </div>
      </section>
    </div>
  );
}

/** A readable band under the left column on top of the 3D scene. */
function Scrim() {
  return <div className="pointer-events-none absolute inset-0 -z-[1] bg-[linear-gradient(90deg,var(--background)_0%,color-mix(in_oklab,var(--background)_70%,transparent)_30%,transparent_62%)]" aria-hidden />;
}

/** Phones, tablets, reduced motion and no-WebGL: one composed still of the same fortress per chapter. */
function Stills() {
  const { room } = useCase();
  return (
    <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
      {ROOMS.map((r) => (
        <div key={r} className={cn("absolute inset-0 transition-opacity duration-700", r === room ? "opacity-100" : "opacity-0")}>
          <Image src={`/fortress/posters/${r}-dark.jpg`} alt="" fill sizes="100vw" priority={r === "bridge"} className="hidden object-cover dark:block" />
          <Image src={`/fortress/posters/${r}-light.jpg`} alt="" fill sizes="100vw" priority={r === "bridge"} className="block object-cover dark:hidden" />
        </div>
      ))}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_30%,color-mix(in_oklab,var(--background)_85%,transparent)_100%)] lg:bg-[linear-gradient(90deg,var(--background)_0%,color-mix(in_oklab,var(--background)_70%,transparent)_30%,transparent_62%)]" />
    </div>
  );
}

function Caption({ n, id, title, children, focusable }: { n: string; id: string; title: string; children: React.ReactNode; focusable?: boolean }) {
  return (
    <div className="max-w-[440px] self-start">
      <p className={kicker}>Chapter {n}</p>
      <h2 id={id} tabIndex={focusable ? -1 : undefined} className="font-display mt-3 text-[clamp(32px,3.6vw,52px)] leading-[1.05] outline-none">
        {title}
      </h2>
      <p className="mt-4 text-[16px] leading-relaxed text-foreground/80">{children}</p>
    </div>
  );
}

function SampleNote() {
  return <p className="label-caps inline-flex rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground">Sample data · labelled, not a live record</p>;
}

function SessionRecord({ title, where, signed }: { title: string; where: string; signed?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card/70 p-3.5">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{where}</p>
      <p className="mt-3 font-hash text-[13px]">
        <span className="text-[var(--amber)]">{SESSION.time}</span> {SESSION.user} from {SESSION.ip}
      </p>
      <p className="mt-1 font-hash text-[11px] text-muted-foreground">
        session {SESSION.id}
        {signed && " · signature valid"}
      </p>
    </div>
  );
}

/** Chapter III: both timelines aligned by time; the demo control removes the server's line for the session. */
function GuardDesk() {
  const { revealed } = useCase();
  return (
    <div className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SampleNote />
        <button
          type="button"
          aria-pressed={revealed}
          onClick={() => setCase({ revealed: !revealed })}
          className={cn(pill, "h-10 border px-4", revealed ? "border-[var(--amber)] bg-[var(--amber)]/15" : "border-foreground/30 hover:border-foreground/70")}
        >
          {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />} {revealed ? "Show original server log" : "Show altered server log"}
        </button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2" id="case">
        <Timeline title="Server's own log" sub={`${SESSION.host} · as the server shows it`} side="host" revealed={revealed} />
        <Timeline title="Witness record" sub="gateway · signed" side="witness" revealed={revealed} />
      </div>
      <div aria-live="polite">
        {revealed && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: ease.out }} className="mt-4 rounded-xl border border-[var(--amber)]/50 bg-[var(--amber)]/10 p-3.5">
            <p className="text-[15px] font-semibold">{CASE_RESULT}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Session {SESSION.id} at {SESSION.time}: {SESSION.user} from {SESSION.ip}. This proves the two records differ, not who removed the entry or why.
            </p>
            <button type="button" onClick={() => go("seal")} className={cn(pillSolid, "mt-3 h-10")}>
              Check it against the chain <ArrowDown className="size-4" />
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function Timeline({ title, sub, side, revealed }: { title: string; sub: string; side: "host" | "witness"; revealed: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card/70">
      <div className="border-b border-border px-3.5 py-2.5">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      <ol className="divide-y divide-border font-hash text-[12.5px]">
        {ROWS.map((r) => {
          const gone = side === "host" && revealed && r.missing;
          return (
            <li key={r.t} className={cn("grid min-h-[44px] grid-cols-[66px_minmax(0,1fr)] items-center gap-x-2 px-3.5 py-2 transition-colors duration-500", r.missing && revealed && "bg-[var(--amber)]/12")}>
              <span className={cn("text-muted-foreground", r.missing && "text-[var(--amber)]")}>{r.t}</span>
              {gone ? (
                <span className="font-sans text-[13px] font-semibold text-bad">No entry in the server log</span>
              ) : (
                <span className="min-w-0 truncate">
                  {r.user} from {r.ip}
                  {side === "witness" && <span className="text-muted-foreground"> · signed</span>}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ------------------------------------------------------------------ IV. the seal room: a real record, a real proof, the real commitment
type BundleEvent = { seq: number; batch_id: number; leaf_index: number; record: EventRecord; proof: ProofStep[] };
type Outcome = {
  sample: BundleEvent;
  altered: EventRecord;
  checks: { leaf: string; root: string; ok: boolean; levels: string[] }[]; // [original, altered]; levels: leaf … root
  anchor: { root: string; block: number | null; by: "browser" | "api"; rpc?: string };
  batch: Batch | null;
  chainId: number | null;
  contract: string | null;
};
/** The altered copy: the attacker's address laundered to an internal one, as the Attack Lab's alter_evidence does. */
const alter = (r: EventRecord): EventRecord => (r.msg.includes(SESSION.ip) ? { ...r, msg: r.msg.replaceAll(SESSION.ip, "10.0.4.12") } : { ...r, actor: `${r.actor}-x` });

function SealRoom({ mode }: { mode: "3d" | "still" }) {
  const { howOpen } = useCase();
  const status = useApi<Status>("/api/status");
  const events = useApi<{ items: EventItem[] }>("/api/events?order=asc&limit=1000");
  const pickSeq = (() => {
    const anchored = events.data?.items.filter((i) => i.protection === "anchored" && i.record) ?? [];
    return (anchored.find((i) => i.record!.msg.includes(SESSION.ip)) ?? anchored[0])?.seq ?? null;
  })();
  const detail = useApi<{ proof: BundleEvent | null }>(pickSeq === null ? null : `/api/events/${pickSeq}`);
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
          const levels = [leaf];
          for (const step of sample.proof) levels.push(await rootFromProof(levels[levels.length - 1], [step]));
          const root = levels[levels.length - 1];
          return { leaf, root, levels, ok: rec.seq === sample.seq && root === anchor.root.toLowerCase() };
        }),
      );
      if (mode === "3d" && !reduced()) await new Promise((r) => setTimeout(r, 1100)); // let the seal finish lifting
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
    <div className={panel}>
      {/* The seal sits where the result will appear; verifying lifts it and the proof comes into focus in its place. */}
      {!out && (
        <div className="relative -mx-5 -mt-5 mb-4 h-[260px] overflow-hidden rounded-t-2xl sm:-mx-6 sm:-mt-6 sm:h-[300px]">
          {mode === "3d" ? (
            <SealScene lifted={busy} />
          ) : (
            <>
              <Image src="/fortress/posters/seal-object-dark.jpg" alt="" fill sizes="(min-width: 1024px) 60vw, 100vw" className="hidden object-cover dark:block" />
              <Image src="/fortress/posters/seal-object-light.jpg" alt="" fill sizes="(min-width: 1024px) 60vw, 100vw" className="block object-cover dark:hidden" />
            </>
          )}
        </div>
      )}
      {offline ? (
        <p role="status" className="rounded-md border border-warn/50 px-3 py-2 text-sm">
          <AlertTriangle className="mr-1.5 inline size-4 align-[-3px] text-warn" aria-hidden />
          The evidence service is offline, so nothing can be verified right now. Start the stack with <span className="font-hash">scripts\start-all.cmd</span>.
        </p>
      ) : !sample ? (
        <p role="status" className="text-sm text-muted-foreground">
          {events.loading || detail.loading ? "Fetching a sealed record from this stack…" : "There is no anchored record on this stack yet, so there is nothing to verify."}
        </p>
      ) : (
        <>
          <div className="grid gap-2 font-hash text-[12px] sm:grid-cols-2">
            <SampleCard title="Real record from this stack" rec={sample.record} />
            <SampleCard title="Copy with one detail changed" rec={alter(sample.record)} changed={sample.record} />
          </div>
          {!out && (
            <button type="button" onClick={verify} disabled={busy} className={cn(buttonVariants({ size: "lg" }), "mt-4 h-11 gap-2 px-5")}>
              <Stamp className="size-4" /> {busy ? "Lifting the seal…" : "Verify evidence"}
            </button>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-bad">
          {error}
        </p>
      )}
      <div aria-live="polite">
        {out && (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: ease.out }} className="mt-4 space-y-2">
            <Committed out={out} />
            <ProofLadder out={out} />
            <Verdict ok={out.checks[0].ok} title="Original sample" text={out.checks[0].ok ? `Matches the commitment: its digest climbs ${out.sample.proof.length} proof steps to the root anchored in block ${out.anchor.block ?? "?"}.` : "Does not match the commitment: this record is not what was anchored."} />
            <Verdict ok={out.checks[1].ok} title="Altered copy" text={out.checks[1].ok ? "Matches the commitment." : "Does not match: one changed detail gives a different digest, so it climbs to a different root."} />
            <p className="px-1 text-xs text-muted-foreground">
              A match proves this record is exactly what was committed in batch #{out.sample.batch_id}. It does not prove that what the record says is true.
            </p>
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
                  Local development chain {out.chainId ?? "?"} (Hardhat). Not Quai: no Quai deployment is set up yet, so there is no Quai transaction and no explorer link.
                </dd>
              </dl>
            </details>
            <button type="button" onClick={() => setOut(null)} className={cn(buttonVariants({ variant: "outline" }), "h-10 gap-2")}>
              <RotateCcw className="size-4" /> Seal it again
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}

/** What was committed, where, and what this page can honestly link to. */
function Committed({ out }: { out: Outcome }) {
  return (
    <div className="grid gap-2 rounded-xl border border-border bg-card/60 p-3 text-xs sm:grid-cols-3">
      <div>
        <p className="text-muted-foreground">Committed on-chain</p>
        <p className="mt-0.5 font-hash">{short(out.anchor.root, 10)}</p>
        <p className="text-muted-foreground">
          batch #{out.sample.batch_id} · block {out.anchor.block ?? "?"}
        </p>
      </div>
      <div>
        <p className="text-muted-foreground">Recomputed in your browser</p>
        <p className={cn("mt-0.5 font-hash", out.checks[0].ok ? "text-ok" : "text-bad")}>{short(out.checks[0].root, 10)}</p>
        <p className="text-muted-foreground">from record #{out.sample.seq}</p>
      </div>
      <div>
        <p className="text-muted-foreground">Network</p>
        <p className="mt-0.5 font-semibold">Local chain {out.chainId ?? "?"}</p>
        <p className="text-muted-foreground">Quai: not deployed yet, so no Quai link</p>
      </div>
    </div>
  );
}

/** The two proofs climbing level by level to the root, then meeting the commitment read from the chain. */
function ProofLadder({ out }: { out: Outcome }) {
  const reduce = useReducedMotion();
  const top = out.checks[0].levels.length - 1;
  const step = 0.14;
  const enter = (delay: number) => (reduce ? {} : { initial: { opacity: 0, y: -6 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.3, ease: ease.out } });
  return (
    <div className="rounded-xl border border-border bg-background/40 p-3" aria-label="Merkle proof, level by level">
      <div className="grid grid-cols-2 gap-3">
        {out.checks.map((c, k) => (
          <ol key={k} className="space-y-2 font-hash text-[11px]">
            <li className="label-caps font-sans text-muted-foreground">{k === 0 ? "Original" : "Altered copy"}</li>
            {c.levels.map((h, i) => (
              <motion.li
                key={i}
                {...enter(i * step + k * 0.06)}
                className={cn(
                  "relative flex items-center justify-between gap-2 rounded-md border px-2 py-1",
                  i > 0 && "before:absolute before:-top-2 before:left-5 before:h-2 before:w-px before:bg-border",
                  k === 1 ? "border-bad/40 text-bad" : i === top ? "border-ok/60 bg-ok/10 text-ok" : "border-border",
                )}
              >
                <span className="font-sans text-muted-foreground">{i === 0 ? "leaf" : i === top ? "root" : `level ${i}`}</span>
                <span className="truncate">{h.slice(0, 14)}…</span>
              </motion.li>
            ))}
          </ol>
        ))}
      </div>
    </div>
  );
}

function SampleCard({ title, rec, changed }: { title: string; rec: EventRecord; changed?: EventRecord }) {
  return (
    <div className="rounded-md border border-border bg-card/60 px-2.5 py-2">
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

// ------------------------------------------------------------------ V. the auditor's desk: the same incident, for real
type DeskRun = { at: string; report: VerificationReport };

function AuditorDesk() {
  const status = useApi<Status>("/api/status", 8000);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<DeskRun | null>(null);
  const [dispute, setDispute] = useState<{ tx_hash: string; block_number: number; digest: string } | null>(null);

  const act = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const runCase = () =>
    act("run", async () => {
      // The session happens; the server's logger is dead, so only the witnesses record it. Then the verifier decides.
      await api("/api/attacks/silent_login", { method: "POST" });
      const report = await api<VerificationReport>("/api/verify", { method: "POST" });
      setDispute(null);
      setRun({ at: new Date().toISOString().slice(11, 19), report });
    });
  const resetStack = () =>
    act("reset", async () => {
      await api("/api/demo/reset", { method: "POST" });
      await api("/api/simulate/traffic", { method: "POST", json: { count: 120, include_intrusion: true } });
      setRun(null);
      setDispute(null);
      status.reload();
    });
  const commitDispute = () => act("dispute", async () => setDispute(await api("/api/disputes", { method: "POST" })));

  const s = status.data;
  const omission = run?.report.witness?.omissions?.[0];
  const signers = omission ? [omission.observation, ...(omission.corroborated_by ?? []).map((a) => a.observation)] : [];
  return (
    <div className={panel}>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Source</dt>
          <dd className="font-semibold">{SESSION.host} · this stack</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Evidence anchored</dt>
          <dd className="font-hash">{s ? `${s.counts.anchored_events} records` : status.error ? "service offline" : "…"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Chain</dt>
          <dd className="font-hash">{s ? `local ${s.chain.chain_id ?? "?"} · block ${s.chain.latest_block ?? "?"}` : "…"}</dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={runCase} disabled={!!busy || !s} className={cn(buttonVariants({ size: "lg" }), "h-11 gap-2 px-5")}>
          <Play className="size-4" /> {busy === "run" ? "Running…" : "Run the missing session for real"}
        </button>
        <button type="button" onClick={resetStack} disabled={!!busy || !s} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 gap-2 px-4")}>
          <RotateCcw className="size-4" /> {busy === "reset" ? "Resetting…" : "Reset the demo stack"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-bad">
          {error}
        </p>
      )}

      <div aria-live="polite">
        {run && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: ease.out }} className="mt-5 space-y-3">
            <div className={cn("rounded-xl border p-4", run.report.verdict === "CLEAN" ? "border-ok/50 bg-ok/10" : "border-[var(--amber)]/60 bg-[var(--amber)]/10")}>
              <p className="label-caps text-[10px] text-muted-foreground">Verdict · live, run at {run.at}</p>
              <p className="mt-1 text-lg font-semibold">{run.report.verdict.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</p>
              <p className="mt-1 text-sm">
                {omission
                  ? `Both independent witnesses signed a session by ${omission.observation.user} from ${omission.observation.src_ip} to ${omission.observation.host}, and this server never reported a matching login.`
                  : "No witnessed session is missing from the server's log."}
              </p>
            </div>
            {omission && (
              <div className="grid gap-2 sm:grid-cols-3">
                {signers.map((w) => (
                  <div key={w.obs_id} className="rounded-lg border border-border bg-card/60 p-3 text-xs">
                    <p className="font-semibold capitalize">{w.role} witness</p>
                    <p className="mt-1 font-hash">{w.observed_at.slice(11, 19)} · {w.user} from {w.src_ip}</p>
                    <p className="mt-1 font-hash text-muted-foreground">key {short(w.witness, 6)} · signature valid</p>
                  </div>
                ))}
                <div className="rounded-lg border border-bad/40 bg-bad/5 p-3 text-xs">
                  <p className="font-semibold">Server&apos;s own log</p>
                  <p className="mt-1 text-bad">No matching login in what the server forwarded.</p>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <a href="/api/export?source=vault" download="leash-evidence-bundle.json" className={cn(buttonVariants({ variant: "outline" }), "h-10 gap-2")}>
                <Download className="size-4" /> Download the evidence bundle
              </a>
              {omission && (
                <button type="button" onClick={commitDispute} disabled={!!busy || !!dispute} className={cn(buttonVariants({ variant: "outline" }), "h-10 gap-2")}>
                  <Stamp className="size-4" /> {busy === "dispute" ? "Committing…" : dispute ? "Dispute committed" : "Commit a dispute on-chain"}
                </button>
              )}
              <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }), "h-10 gap-2")}>
                <LayoutDashboard className="size-4" /> Open the dashboard
              </Link>
            </div>
            {dispute && (
              <p className="rounded-lg border border-border bg-card/60 p-3 font-hash text-xs break-all">
                dispute digest {short(dispute.digest, 10)} · tx {dispute.tx_hash} · block {dispute.block_number} (local chain; no Quai transaction exists)
              </p>
            )}
          </motion.div>
        )}
      </div>
      <button type="button" onClick={() => { resetCase(); go("top"); }} className="mt-5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        Back to the bridge
      </button>
    </div>
  );
}

/** Bottom-right: the live chain this page talks to (not decorative: it is the stack the desk runs against). */
function ChainLine() {
  const { data, error } = useApi<Status>("/api/status", 8000);
  return (
    <p className="absolute right-[clamp(20px,4vw,56px)] bottom-5 hidden font-hash text-[11px] text-muted-foreground sm:block">
      {error ? "Evidence service offline" : data ? `Chain ${data.chain.chain_id ?? "?"} · block ${data.chain.latest_block ?? "?"} · ${data.counts.anchored_events} events anchored` : "Connecting to the chain…"}
    </p>
  );
}
