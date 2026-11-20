"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMotionValue } from "motion/react";
import { AlertTriangle, ArrowDown, ArrowRight, Check, ChevronDown, Eye, FileSearch, LayoutDashboard, RotateCcw, Stamp, Trash2, X } from "lucide-react";
import { CastleScene } from "@/components/castle-scene";
import { buttonVariants } from "@/components/ui/button";
import { Knight } from "@/components/wick";
import { api, short, useApi } from "@/lib/api";
import { CASE_RESULT, ROOMS, resetCase, setCase, useCase, type Room } from "@/lib/case-state";
import type { Batch, EventItem, EventRecord, Status } from "@/lib/types";
import { cn } from "@/lib/utils";
import { leafHash, readBatch, rootFromProof, type ProofStep } from "@/lib/verify";

// The fortress loads only here, after the page: operational routes never pay for three.js.
const FortressScene = dynamic(() => import("@/components/fortress-scene"), { ssr: false });

// Demo case (fixture, labelled on screen): one host, one witness, one event ID, consistent times throughout.
const EVENT_ID = "obs-7c41e2a9";
const ROWS = [
  { t: "02:03:11", user: "alice", ip: "10.0.4.12", port: 51734 },
  { t: "02:09:47", user: "bob", ip: "10.0.4.27", port: 40211 },
  { t: "02:14:06", user: "deploy", ip: "203.0.113.45", port: 51022, missing: true },
  { t: "02:22:05", user: "carol", ip: "10.0.7.3", port: 45580 },
  { t: "02:28:52", user: "svc-backup", ip: "10.0.9.41", port: 60117 },
];
const MISSING = ROWS.find((r) => r.missing)!;
const hostLine = (r: (typeof ROWS)[number]) => `sshd: Accepted publickey for ${r.user} from ${r.ip} port ${r.port} ssh2`;
const witnessLine = (r: (typeof ROWS)[number]) => `SSH session · ${r.user} from ${r.ip} → web-prod-01`;
const LABEL: Record<Room, string> = { gate: "Bridge", case: "Courtyard", maze: "Wall walk", undercroft: "Undercroft", seal: "Seal chamber" };

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
const roomId = (r: Room) => (r === "gate" ? "top" : r);

// 3D only with WebGL and motion allowed; everything else gets the light version (same rooms, same evidence).
let webgl: boolean | undefined;
const motionQuery = () => matchMedia("(prefers-reduced-motion: reduce)");
const subscribeMode = (f: () => void) => {
  const q = motionQuery();
  q.addEventListener("change", f);
  return () => q.removeEventListener("change", f);
};
const getMode = () => {
  webgl ??= !!document.createElement("canvas").getContext("webgl2");
  return webgl && !motionQuery().matches ? "3d" : "lite";
};

export default function Home() {
  const mode = useSyncExternalStore(subscribeMode, getMode, () => "lite" as const);
  const tall = mode === "3d";
  const { room } = useCase();

  useEffect(() => {
    // The room whose section crosses the middle of the screen is the current one (Wick and the nav follow it).
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setCase({ room: (e.target as HTMLElement).dataset.room as Room })),
      { rootMargin: "-45% 0px -45% 0px" },
    );
    document.querySelectorAll("[data-room]").forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  const begin = (e?: React.MouseEvent) => {
    e?.preventDefault();
    setCase({ begun: true, pulseAt: performance.now() }); // Wick lifts his lantern
    setTimeout(() => {
      go("case");
      document.getElementById("case-title")?.focus({ preventScroll: true });
    }, reduced() ? 0 : 650);
  };

  return (
    <div className="relative">
      {tall && (
        <div className="tour-sky fixed inset-x-0 top-14 bottom-0 z-0" aria-hidden>
          <FortressScene />
        </div>
      )}
      <RoomNav room={room} />
      <Opening tall={tall} onBegin={begin} />
      <Chapter id="case" room="case" tall={tall} title="The gate ledger">
        <Courtyard />
      </Chapter>
      <Chapter id="maze" room="maze" tall={tall} title="Two routes, one junction" extra>
        <Maze lite={!tall} />
      </Chapter>
      <Chapter id="undercroft" room="undercroft" tall={tall} title="The ledger and the sealed copy">
        <Undercroft />
      </Chapter>
      <Chapter id="seal" room="seal" tall={tall} title="The seal press" last>
        <SealPress />
      </Chapter>
    </div>
  );
}

/** Jump to any room (desktop rail) or tap to the next one (phones). */
function RoomNav({ room }: { room: Room }) {
  const i = ROOMS.indexOf(room);
  const next = ROOMS[i + 1];
  return (
    <>
      <nav aria-label="Rooms" className="fixed top-1/2 left-4 z-20 hidden -translate-y-1/2 xl:block">
        <ol className="space-y-1">
          {ROOMS.map((r) => (
            <li key={r}>
              <button
                type="button"
                onClick={() => go(roomId(r))}
                aria-current={r === room ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-[3px] px-2 py-1.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  r === room ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className={cn("size-1.5 rounded-full", r === room ? "bg-primary" : "bg-muted-foreground/50")} aria-hidden />
                {LABEL[r]}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      {next && (
        <button
          type="button"
          onClick={() => go(roomId(next))}
          className={cn(buttonVariants({ variant: "outline" }), "fixed bottom-[max(16px,env(safe-area-inset-bottom))] left-4 z-20 h-11 gap-1.5 bg-background/90 backdrop-blur-sm xl:hidden")}
        >
          Next: {LABEL[next]} <ArrowDown className="size-4" />
        </button>
      )}
    </>
  );
}

function Opening({ tall, onBegin }: { tall: boolean; onBegin: (e?: React.MouseEvent) => void }) {
  const still = useMotionValue(0);
  return (
    <section id="top" data-room="gate" aria-labelledby="hero-title" className={cn("pointer-events-none relative", tall ? "h-[210svh]" : "")}>
      <div className={cn("relative h-[calc(100svh-56px)] overflow-hidden", tall && "sticky top-14")}>
        {!tall && (
          <div className="pointer-events-auto absolute inset-0">
            <CastleScene progress={still} still onOpen={onBegin} />
          </div>
        )}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,var(--hero-scrim)_0%,var(--hero-scrim)_26%,transparent_50%)] lg:bg-[linear-gradient(90deg,var(--hero-scrim)_0%,var(--hero-scrim)_24%,transparent_52%)]" />
        <div className="relative mx-auto flex h-full w-full max-w-[1320px] px-[clamp(20px,4vw,56px)] pt-8 lg:items-center lg:pt-0 xl:pl-36">
          <div className="pointer-events-auto max-w-[540px]">
            <p className="label-caps text-muted-foreground">Leash Blackbox</p>
            <h1 id="hero-title" className="mt-3 font-display text-[clamp(38px,5.4vw,76px)] leading-[1.02] font-semibold text-balance">
              Know what happened. Even when your server lies.
            </h1>
            <p className="mt-4 max-w-[46ch] text-[16px] leading-relaxed text-foreground/85 sm:text-[17px]">
              LEASH BLACKBOX helps your security team compare a server&apos;s logs with independently preserved evidence.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3 lg:mt-8">
              <a href="#case" onClick={onBegin} className={cn(buttonVariants({ size: "lg" }), "h-12 gap-2 px-5 text-[15px]")}>
                Investigate the missing session. <ArrowDown className="size-4" />
              </a>
              <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-12 gap-2 bg-background/70 px-5 text-[15px]")}>
                <LayoutDashboard className="size-4" /> Open dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** One room: a tall stretch of scroll for the camera, with its panel held in view (top on desktop, bottom on phones). */
function Chapter({ id, room, tall, title, extra, last, children }: { id: string; room: Room; tall: boolean; title: string; extra?: boolean; last?: boolean; children: React.ReactNode }) {
  return (
    <section
      id={id}
      data-room={room}
      aria-labelledby={`${id}-title`}
      className={cn(
        "pointer-events-none relative z-10 scroll-mt-14",
        tall ? cn("flex flex-col justify-end lg:justify-start", last ? "min-h-[150svh]" : extra ? "min-h-[300svh]" : "min-h-[220svh]") : "border-t border-border",
      )}
    >
      <div className={cn("mx-auto w-full max-w-[1320px] px-[clamp(12px,4vw,56px)] xl:pl-36", tall ? "sticky bottom-3 py-3 lg:top-[72px] lg:bottom-auto lg:py-0" : "py-12")}>
        <div className={cn("pointer-events-auto w-full rounded-md border border-border bg-card/92 p-4 shadow-[var(--shadow-pop)] backdrop-blur-sm sm:p-5", tall ? "max-h-[64svh] overflow-y-auto lg:max-h-[calc(100svh-96px)] lg:max-w-[480px]" : "max-w-[760px]")}>
          <h2 id={`${id}-title`} tabIndex={-1} className="font-display text-[clamp(26px,3vw,34px)] leading-tight font-semibold outline-none">
            {title}
          </h2>
          {children}
        </div>
      </div>
    </section>
  );
}

const DemoLabel = () => (
  <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
    <span className="inline-flex items-center gap-1 rounded-[3px] border border-primary/60 px-1.5 py-0.5 font-semibold text-primary">
      <FileSearch className="size-3.5" aria-hidden /> Demo case
    </span>
    Sample data, not a live verification.
  </p>
);

function Courtyard() {
  return (
    <>
      <DemoLabel />
      <p className="mt-3 text-sm text-muted-foreground">
        <span className="font-hash text-foreground">web-prod-01</span>&apos;s own SSH log, 02:00–02:30 UTC.
      </p>
      <ol className="mt-3 divide-y divide-border rounded-md border border-border font-hash text-[12.5px]">
        {ROWS.map((r) =>
          r.missing ? (
            <li key={r.t} className="grid grid-cols-[64px_minmax(0,1fr)] gap-2 border-l-4 border-l-bad bg-bad/10 px-3 py-2 text-bad">
              <span>{r.t}</span>
              <span className="font-sans text-xs font-semibold">
                <X className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
                No entry in the host log
              </span>
            </li>
          ) : (
            <li key={r.t} className="grid grid-cols-[64px_minmax(0,1fr)] gap-2 px-3 py-2">
              <span className="text-muted-foreground">{r.t}</span>
              <span className="min-w-0 break-words">{hostLine(r)}</span>
            </li>
          ),
        )}
      </ol>
      <div className="mt-3 rounded-md border border-primary/50 bg-primary/10 px-3 py-2.5 text-sm">
        <p className="font-semibold">
          <Eye className="mr-1.5 inline size-4 align-[-3px] text-primary" aria-hidden />
          Independent witness: an access event at {MISSING.t} UTC
        </p>
        <p className="mt-1 font-hash text-[12.5px] text-muted-foreground">
          {EVENT_ID} · {witnessLine(MISSING)}
        </p>
      </div>
      <p className="mt-3 text-[15px] font-semibold">{CASE_RESULT}</p>
      <div className="mt-4 flex items-end gap-3">
        <div className="h-16 shrink-0" aria-hidden>
          <Knight />
        </div>
        <p className="rounded-md border border-border bg-background px-3 py-2 text-[15px]">
          <span className="sr-only">Wick: </span>The gate ledger has a gap. Who else could see this crossing?
        </p>
      </div>
      <button type="button" onClick={() => go("maze")} className={cn(buttonVariants({ size: "lg" }), "mt-4 h-11 gap-2 px-5")}>
        <Eye className="size-4" /> Inspect witness
      </button>
    </>
  );
}

function Maze({ lite }: { lite: boolean }) {
  const { witnessSeen, replayAt } = useCase();
  const replay = () => {
    if (lite) setCase({ replayAt: null, witnessSeen: true, towerLit: true, pulseAt: performance.now() }); // no scene: the state changes at once
    else setCase({ replayAt: performance.now(), witnessSeen: false, towerLit: false });
  };
  return (
    <>
      <p className="mt-3 text-[15px] leading-relaxed">
        On the ground, the intruder crosses the courtyard, passes the inner gate and turns toward the keep; from there the archive is out of sight. From
        above the wall you can see the junction, the watchtower and the archive at once.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        The watchtower is the gateway witness. It signs what crosses the inner gate with its own key and keeps its own record, so taking over the server does
        not hand over the witness. In this prototype the witness is a separate key and store on the same machine.
      </p>
      <button type="button" onClick={replay} disabled={replayAt !== null && !witnessSeen} className={cn(buttonVariants({ size: "lg" }), "mt-4 h-11 gap-2 px-5")}>
        <RotateCcw className="size-4" /> Replay crossing
      </button>
      <div aria-live="polite">
        {witnessSeen && (
          <div className="mt-4 rounded-md border border-primary/50 bg-primary/10 px-3 py-2.5 text-sm">
            <p className="font-semibold">Witness record · observed at the inner gate</p>
            <dl className="mt-1.5 grid grid-cols-[88px_minmax(0,1fr)] gap-x-2 gap-y-0.5 font-hash text-[12.5px]">
              <dt className="text-muted-foreground">Event ID</dt>
              <dd>{EVENT_ID}</dd>
              <dt className="text-muted-foreground">Time</dt>
              <dd>{MISSING.t} UTC</dd>
              <dt className="text-muted-foreground">Session</dt>
              <dd className="break-words">{witnessLine(MISSING)}</dd>
              <dt className="text-muted-foreground">Signed by</dt>
              <dd>gateway witness (secp256k1)</dd>
            </dl>
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Illustrative: the maze and its gates picture the idea. This prototype implements the witness and the sealed vault, not these defences.</p>
      <button type="button" onClick={() => go("undercroft")} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline">
        Take the tower stairs down <ArrowDown className="size-4" />
      </button>
    </>
  );
}

function Undercroft() {
  const { removed } = useCase();
  const [pick, setPick] = useState(MISSING.t);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  return (
    <>
      <DemoLabel />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <fieldset className="rounded-md border border-border">
          <legend className="ml-2 px-1 text-sm font-semibold">Host ledger · web-prod-01</legend>
          <ul className="divide-y divide-border font-hash text-[12px]">
            {ROWS.filter((r) => r.t !== removed).map((r) => (
              <li key={r.t}>
                <label className="flex cursor-pointer gap-2 px-2.5 py-1.5 has-[:checked]:bg-muted">
                  <input type="radio" name="host-row" value={r.t} checked={pick === r.t} onChange={() => setPick(r.t)} className="mt-0.5 accent-[var(--primary)]" />
                  <span>
                    <span className="text-muted-foreground">{r.t}</span> {r.user} from {r.ip}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <div className="rounded-md border border-primary/50">
          <p className="px-2.5 pt-1.5 text-sm font-semibold">Sealed witness copy</p>
          <ul className="divide-y divide-border font-hash text-[12px]">
            {ROWS.map((r) => (
              <li key={r.t}>
                <button
                  type="button"
                  onClick={() => {
                    setSeenAt(r.t);
                    setCase({ revealAt: performance.now(), pulseAt: performance.now() });
                  }}
                  className={cn("w-full px-2.5 py-1.5 text-left outline-none hover:bg-muted focus-visible:bg-muted", r.t === removed && "bg-primary/10")}
                >
                  <span className="text-muted-foreground">{r.t}</span> {r.user} from {r.ip}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!!removed || !pick}
          onClick={() => {
            setCase({ removed: pick, pulseAt: performance.now() });
            setPick("");
          }}
          className={cn(buttonVariants({ size: "lg" }), "h-11 gap-2 px-4")}
        >
          <Trash2 className="size-4" /> Remove local entry in demo
        </button>
        <button
          type="button"
          onClick={() => {
            setCase({ removed: null });
            setPick(MISSING.t);
            setSeenAt(null);
          }}
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 gap-2 px-4")}
        >
          <RotateCcw className="size-4" /> Reset demo
        </button>
      </div>
      <div aria-live="polite" className="mt-3 space-y-1 text-[15px]">
        {removed && <p>The host&apos;s line for {removed} is gone; the sealed witness copy still has it.</p>}
        {seenAt && (
          <p className="text-sm text-muted-foreground">
            {seenAt} UTC: observed crossing the inner gate{seenAt === MISSING.t ? ` (${EVENT_ID})` : ""}.
          </p>
        )}
      </div>
    </>
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
      setCase({ seal: { seq: sample.seq, original: checks[0].ok, altered: checks[1].ok, block: anchor.block, chainId: s.chain.chain_id ?? null }, pulseAt: performance.now() });
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
