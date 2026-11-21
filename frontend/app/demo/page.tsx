"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckCircle2, ChevronRight, Link2, Lock, PlayCircle, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertBanner, HashChip, LiveDot, Spinner } from "@/components/kit";
import { VerdictBanner } from "@/components/status";
import { api } from "@/lib/api";
import { ease } from "@/lib/motion";
import type { AttackResult, Batch, Deployment, EventItem, Status, VerificationReport } from "@/lib/types";
import { readBatch, verifyBundleInBrowser, type BrowserVerdict, type Bundle } from "@/lib/verify";
import { cn } from "@/lib/utils";

const ATTACKER = "203.0.113.45";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Everything the console shows, read from the real backend, chain and browser verifier as the scenes run. */
interface Story {
  deployment?: Deployment;
  rpcUrl?: string;
  rows: EventItem[];
  batches: Batch[];
  ingested?: number;
  report?: VerificationReport;
  chain?: { unchanged: number; total: number };
  audit?: { host: BrowserVerdict; vault: BrowserVerdict };
  focus?: number; // the log line the terminal centres next
}
type Patch = (patch: Partial<Story>) => void;

const fetchRows = () => api<{ items: EventItem[] }>("/api/events?limit=1000&order=asc").then((r) => r.items);

const SCENES: { title: string; line: string; run: (s: Story, set: Patch) => Promise<void> }[] = [
  {
    title: "Fresh server",
    line: "A new LeashAnchor contract goes on the chain. Only the anchor service can append to it; nobody can edit it.",
    run: async (_s, set) => {
      const r = await api<{ deployment: Deployment }>("/api/demo/reset", { method: "POST" });
      const st = await api<Status>("/api/status");
      set({ deployment: r.deployment, rpcUrl: st.chain.rpc_url, rows: [], batches: [] });
    },
  },
  {
    title: "Traffic + intrusion",
    line: "Routine traffic streams in. Hidden in it: a scan, a brute force, a login, root, a backdoor and exfiltration.",
    run: async (_s, set) => {
      const r = await api<{ ingested: number; batches: Batch[]; anchor_error: string | null }>("/api/simulate/traffic", {
        method: "POST",
        json: { count: 150, include_intrusion: true },
      });
      if (r.anchor_error) throw new Error(r.anchor_error);
      set({ ingested: r.ingested, batches: r.batches, rows: await fetchRows() });
    },
  },
  {
    title: "Baseline check",
    line: "Every record is re-hashed and compared with the vault and the root on-chain.",
    run: async (_s, set) => set({ report: await api<VerificationReport>("/api/verify", { method: "POST" }) }),
  },
  {
    title: "Erase the trail",
    line: "Root on the server: sed -i '/203.0.113.45/d'. Every line with the attacker's address disappears.",
    run: async (s, set) => {
      set({ focus: s.rows.find((r) => r.record?.msg.includes(ATTACKER))?.seq });
      await sleep(700); // let the audience see the lines before they go
      await api<AttackResult>("/api/attacks/cover_tracks", { method: "POST" });
      set({ rows: await fetchRows() });
    },
  },
  {
    title: "Plant an alibi",
    line: "Three boring admin logins are written into the gap. The server's log now looks normal.",
    run: async (_s, set) => {
      const r = await api<AttackResult>("/api/attacks/fabricate_alibi", { method: "POST", json: { params: { count: 3 } } });
      set({ rows: await fetchRows(), focus: r.seqs[0] });
    },
  },
  {
    title: "Verify again",
    line: "The log no longer matches the chain. Erased lines come back from the vault; planted lines are exposed.",
    run: async (s, set) => {
      const report = await api<VerificationReport>("/api/verify", { method: "POST" });
      const contract = s.deployment?.contract_address;
      const anchored = s.batches.filter((b) => b.status === "anchored");
      const now = s.rpcUrl && contract ? await Promise.all(anchored.map((b) => readBatch(s.rpcUrl!, contract, b.batch_id).catch(() => null))) : [];
      const unchanged = anchored.filter((b, i) => now[i]?.merkle_root?.toLowerCase() === b.merkle_root.toLowerCase()).length;
      const rows = await fetchRows();
      set({ report, rows, chain: { unchanged, total: anchored.length }, focus: rows.find((r) => r.status === "DELETED")?.seq });
    },
  },
  {
    title: "Outside auditor",
    line: "Trusting neither the server nor us, this browser checks both copies with WebCrypto and the contract itself.",
    run: async (s, set) => {
      const st = s.rpcUrl && s.deployment ? null : await api<Status>("/api/status");
      const rpc = s.rpcUrl ?? st!.chain.rpc_url;
      const contract = s.deployment?.contract_address ?? st!.deployment!.contract_address;
      const host = await verifyBundleInBrowser(await api<Bundle>("/api/export?source=host"), rpc, contract);
      const vault = await verifyBundleInBrowser(await api<Bundle>("/api/export?source=vault"), rpc, contract);
      set({ audit: { host, vault } });
    },
  },
];

export default function DemoMode() {
  const [story, setStory] = useState<Story>({ rows: [], batches: [] });
  const [done, setDone] = useState(0);
  const [running, setRunning] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const live = useRef<Story>(story);
  const set: Patch = (patch) => {
    live.current = { ...live.current, ...patch };
    setStory(live.current);
  };

  const runScene = async (i: number) => {
    setRunning(i);
    setError(null);
    try {
      await SCENES[i].run(live.current, set);
      setDone(i + 1);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setRunning(null);
    }
  };

  const runAll = async () => {
    live.current = { rows: [], batches: [] };
    setStory(live.current);
    setDone(0);
    for (let i = 0; i < SCENES.length; i++) {
      if (!(await runScene(i))) return;
      await sleep(1300);
    }
  };

  const current = running ?? Math.min(done, SCENES.length - 1);
  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: ease.out }}>
          <p className="label-caps text-muted-foreground">Live demo · real backend, real chain, nothing scripted</p>
          <h1 className="mt-2 font-display text-[clamp(1.9rem,4.2vw,3.4rem)] leading-[0.95] text-balance">The attacker can erase the logs.</h1>
          <h2 className="font-display text-[clamp(1.9rem,4.2vw,3.4rem)] leading-[0.95] text-balance text-primary">They cannot erase the proof.</h2>
        </motion.div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="lg" onClick={runAll} disabled={running !== null}>
            <PlayCircle /> Run the full story
          </Button>
          <Button size="lg" variant="outline" onClick={() => runScene(done)} disabled={running !== null || done >= SCENES.length}>
            <ChevronRight /> Next scene
          </Button>
        </div>
      </header>

      {error && (
        <AlertBanner tone="danger" title="This scene failed" onDismiss={() => setError(null)}>
          {error}
        </AlertBanner>
      )}

      <div className="grid gap-4 lg:grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)_300px]">
        <SceneRail done={done} running={running} />
        <div className="min-w-0 space-y-3">
          <Narration index={current} active={running !== null || done > 0} />
          <Terminal story={story} done={done} />
          {story.report && (
            <VerdictBanner
              verdict={story.report.verdict}
              subtitle={
                story.report.verdict === "CLEAN"
                  ? `${story.report.summary.intact} records intact · ${story.report.duration_ms} ms`
                  : `${story.report.summary.deleted} erased records recovered · ${story.report.summary.injected} fabricated records exposed · chain attestation ${story.report.chain_attestation}`
              }
            />
          )}
        </div>
        <ChainPanel story={story} />
      </div>

      <AnimatePresence>
        {story.audit && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: ease.out }} className="grid gap-3 md:grid-cols-2">
            <AuditCard title="Server's current logs" r={story.audit.host} />
            <AuditCard title="Protected evidence" r={story.audit.vault} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SceneRail({ done, running }: { done: number; running: number | null }) {
  return (
    <ol className="grid grid-cols-7 gap-1.5 lg:grid-cols-1 lg:content-start lg:gap-1" aria-label="Scenes">
      {SCENES.map((s, i) => {
        const state = running === i ? "running" : i < done ? "done" : "todo";
        return (
          <li
            key={s.title}
            aria-current={running === i ? "step" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg border px-2 py-2 transition-colors duration-300 lg:px-3",
              state === "running" ? "border-primary/60 bg-primary/10" : state === "done" ? "border-border bg-card/60" : "border-transparent opacity-60",
            )}
          >
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular",
                state === "done" ? "bg-ok text-paper" : state === "running" ? "bg-primary text-primary-foreground" : "border border-foreground/30",
              )}
            >
              {state === "running" ? <Spinner className="size-3.5" /> : state === "done" ? <CheckCircle2 className="size-3.5" /> : i + 1}
            </span>
            <span className="hidden truncate text-[13px] font-medium lg:block">{s.title}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Narration({ index, active }: { index: number; active: boolean }) {
  return (
    <div className="min-h-[3.25rem]" aria-live="polite">
      <AnimatePresence mode="wait">
        <motion.p
          key={active ? index : "idle"}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.3, ease: ease.out }}
          className="text-[15px] leading-snug sm:text-base"
        >
          {active ? (
            <>
              <span className="label-caps mr-2 text-primary">Scene {index + 1}</span>
              {SCENES[index].line}
            </>
          ) : (
            <span className="text-muted-foreground">Press Run the full story: seven scenes, about a minute, against this stack&apos;s backend and chain.</span>
          )}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

type Look = "hidden" | "normal" | "attacker" | "planted" | "recovered" | "fabricated";
const SEVERE = new Set(["medium", "high", "critical"]);

/** What the server's log shows for a line at this point of the story. */
function look(item: EventItem, done: number): Look {
  const rec = item.host_record ?? item.record;
  const attacker = !!rec && (rec.msg.includes(ATTACKER) || SEVERE.has(rec.severity));
  if (item.status === "DELETED") return done >= 6 ? "recovered" : done >= 4 ? "hidden" : attacker ? "attacker" : "normal";
  if (item.status === "INJECTED") return done >= 6 ? "fabricated" : done >= 5 ? "planted" : "hidden";
  return attacker ? "attacker" : "normal";
}

const TAG: Partial<Record<Look, [string, string]>> = {
  planted: ["new", "text-warn"],
  recovered: ["recovered from vault", "text-ok"],
  fabricated: ["fabricated · not on chain", "text-bad"],
};

function Terminal({ story, done }: { story: Story; done: number }) {
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const lines = story.rows.map((item) => ({ item, look: look(item, done) })).filter((l) => l.look !== "hidden");

  useEffect(() => {
    // Centre the line the scene is about, inside the terminal only (the page itself does not move).
    const el = story.focus === undefined ? null : box.current?.querySelector<HTMLElement>(`[data-seq="${story.focus}"]`);
    if (el && box.current) box.current.scrollTo({ top: el.offsetTop - box.current.clientHeight / 2, behavior: reduce ? "auto" : "smooth" });
  }, [story.focus, story.rows, done, reduce]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-[#07080a] text-[#d7dae0] shadow-[var(--shadow-pop)]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3.5 py-2 font-hash text-[11px] text-white/55">
        <span className="flex min-w-0 items-center gap-2 truncate">
          <LiveDot tone={done >= 4 && done < 6 ? "warn" : lines.length ? "ok" : "muted"} pulse={lines.length > 0} />
          web-prod-01 · /var/log as the server shows it
        </span>
        <span className="shrink-0 tabular">{lines.length} lines</span>
      </div>
      <div ref={box} className="relative h-[340px] overflow-y-auto px-1.5 py-1.5 font-hash text-[11.5px] leading-[20px] sm:h-[420px]">
        {!lines.length && (
          <p className="px-2 py-1 text-white/40">
            waiting for traffic<span className="ml-0.5 inline-block w-2 animate-pulse bg-white/60">&nbsp;</span>
          </p>
        )}
        <AnimatePresence initial={false}>
          {lines.map(({ item, look: l }, i) => {
            const rec = (item.host_record ?? item.record)!;
            const tag = TAG[l];
            return (
              <motion.div
                key={item.seq}
                data-seq={item.seq}
                layout={reduce ? false : "position"}
                initial={reduce ? false : { opacity: 0, x: -6, backgroundColor: l === "planted" ? "rgba(245,158,11,0.35)" : "rgba(0,0,0,0)" }}
                animate={{ opacity: 1, x: 0, backgroundColor: "rgba(0,0,0,0)" }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, x: 16, backgroundColor: "rgba(239,68,68,0.4)", transition: { duration: 0.55, ease: ease.inOut } }}
                transition={{ duration: 0.35, ease: ease.out, delay: done < 2 ? Math.min(i * 0.008, 1.1) : 0 }}
                className={cn(
                  "grid grid-cols-[58px_74px_minmax(0,1fr)] gap-x-2 overflow-hidden rounded px-1.5 whitespace-nowrap",
                  l === "attacker" && "text-amber-300",
                  l === "recovered" && "bg-emerald-500/10 text-emerald-300 shadow-[inset_2px_0_0_rgb(52,211,153)]",
                  l === "fabricated" && "bg-red-500/10 text-red-300 line-through decoration-red-400/70 shadow-[inset_2px_0_0_rgb(248,113,113)]",
                )}
              >
                <span className="text-white/35">{rec.ts.slice(11, 19)}</span>
                <span className="truncate text-white/45">{rec.source}</span>
                <span className="truncate">
                  {rec.msg}
                  {tag && <span className={cn("ml-2 no-underline", tag[1])}>[{tag[0]}]</span>}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ChainPanel({ story }: { story: Story }) {
  const { deployment: d, batches, chain } = story;
  const intact = chain && chain.unchanged === chain.total;
  return (
    <aside className="surface rounded-xl p-4 lg:col-span-2 xl:col-span-1" aria-label="On-chain commitments">
      <div className="flex items-center justify-between gap-2">
        <p className="label-caps flex items-center gap-1.5 text-muted-foreground">
          <Link2 className="size-3.5" /> LeashAnchor on chain {d?.chain_id ?? "…"}
        </p>
        <span className="label-caps rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">append-only</span>
      </div>
      {!d ? (
        <p className="mt-6 text-sm text-muted-foreground">No contract yet. Scene 1 deploys one.</p>
      ) : (
        <div className="mt-3 space-y-3 text-xs">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">Contract</dt>
            <dd className="justify-self-end">
              <HashChip value={d.contract_address} />
            </dd>
            <dt className="text-muted-foreground">Deployed in</dt>
            <dd className="justify-self-end font-hash">block {d.block_number}</dd>
            {story.ingested !== undefined && (
              <>
                <dt className="text-muted-foreground">Events sealed</dt>
                <dd className="justify-self-end font-hash">{story.ingested}</dd>
              </>
            )}
          </dl>
          <ol className="space-y-2">
            <AnimatePresence initial={false}>
              {batches.map((b) => (
                <motion.li
                  key={b.batch_id}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, ease: ease.out }}
                  className={cn("rounded-lg border bg-card/60 p-2.5 transition-colors duration-500", intact ? "border-ok/60" : chain ? "border-bad/60" : "border-border")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <Lock className="size-3.5 text-ok" /> Batch #{b.batch_id}
                    </span>
                    <span className="font-hash text-muted-foreground">
                      #{b.first_seq}–{b.last_seq}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Merkle root</span>
                    <HashChip value={b.merkle_root} tone={chain ? (intact ? "ok" : "bad") : undefined} />
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Anchor tx</span>
                    <HashChip value={b.tx_hash} />
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
          {chain && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn("flex items-start gap-1.5 rounded-lg px-2.5 py-2 font-semibold", intact ? "bg-ok/10 text-ok" : "bg-bad/10 text-bad")}
            >
              {intact ? <Lock className="mt-0.5 size-3.5 shrink-0" /> : <ShieldX className="mt-0.5 size-3.5 shrink-0" />}
              {intact
                ? `Re-read just now: ${chain.unchanged}/${chain.total} root(s) unchanged since before the attack.`
                : `Re-read just now: only ${chain.unchanged}/${chain.total} root(s) match.`}
            </motion.p>
          )}
        </div>
      )}
    </aside>
  );
}

function AuditCard({ title, r }: { title: string; r: BrowserVerdict }) {
  const ok = r.verdict !== "TAMPERING_DETECTED";
  return (
    <div className={cn("rounded-xl p-4", ok ? "bg-ok text-paper" : "bg-bad text-paper")}>
      <div className="text-xs font-semibold opacity-90">{title}</div>
      <div className="mt-1 flex items-center gap-2 font-display text-2xl">
        {ok ? <CheckCircle2 className="size-6" /> : <ShieldX className="size-6" />}
        <span>{r.verdict.replace(/_/g, " ")}</span>
      </div>
      <div className="mt-1 text-xs opacity-90">
        {r.events.filter((e) => e.status === "VERIFIED").length} records proven · {r.missing.length} missing · {r.uncommitted} uncommitted · {r.ms} ms
      </div>
    </div>
  );
}
