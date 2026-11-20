"use client";

import { useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CheckCircle2, ChevronRight, Lock, Play, PlayCircle, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertBanner, HashChip, Spinner } from "@/components/kit";
import { StatusBadge, VerdictBanner } from "@/components/status";
import { api } from "@/lib/api";
import { dur, ease, fadeUp } from "@/lib/motion";
import type { AttackResult, Batch, Deployment, EventItem, Status, VerificationReport } from "@/lib/types";
import { readBatch, verifyBundleInBrowser, type BrowserVerdict, type Bundle } from "@/lib/verify";
import { cn } from "@/lib/utils";

type Result = React.ReactNode;

interface Step {
  title: string;
  narration: string;
  run: (ctx: Ctx) => Promise<Result>;
}

interface Ctx {
  deployment?: Deployment;
  rpcUrl?: string;
  /** Roots as anchored before the attack, to show later that the chain never changed. */
  anchored?: { id: number; root: string }[];
}

const STEPS: Step[] = [
  {
    title: "A fresh, monitored server",
    narration:
      "web-prod-01 forwards every security event to an independent collector. A new LeashAnchor contract is deployed on the chain; only the anchor service can append to it, and nobody can edit it.",
    run: async (ctx) => {
      const r = await api<{ deployment: Deployment }>("/api/demo/reset", { method: "POST" });
      const s = await api<Status>("/api/status");
      ctx.deployment = r.deployment;
      ctx.rpcUrl = s.chain.rpc_url;
      return (
        <Facts
          items={[
            ["Chain", `id ${r.deployment.chain_id}`],
            ["Contract", <HashChip key="c" value={r.deployment.contract_address} />],
            ["Deploy tx", <HashChip key="t" value={r.deployment.tx_hash} />],
          ]}
        />
      );
    },
  },
  {
    title: "A normal day… and an intrusion",
    narration:
      "Routine telemetry flows in. Hidden inside it: a port scan, an SSH brute force, a successful login, sudo to root, a cron backdoor and data exfiltration. Every event is canonicalized, hashed and chained, and each batch's Merkle root is anchored on-chain.",
    run: async (ctx) => {
      const r = await api<{ ingested: number; batches: Batch[]; anchor_error: string | null }>("/api/simulate/traffic", {
        method: "POST",
        json: { count: 150, include_intrusion: true },
      });
      if (r.anchor_error) throw new Error(r.anchor_error);
      ctx.anchored = r.batches.filter((b) => b.status === "anchored").map((b) => ({ id: b.batch_id, root: b.merkle_root }));
      const ev = await api<{ items: EventItem[] }>("/api/events?limit=1000&order=asc");
      // One example per intrusion stage (only the intrusion is medium severity or above), in the order it happened.
      const byType = new Map<string, EventItem>();
      for (const e of ev.items) {
        if (e.record && ["medium", "high", "critical"].includes(e.record.severity) && !byType.has(e.record.type)) byType.set(e.record.type, e);
      }
      const sample = [...byType.values()].slice(0, 4);
      const b = r.batches[0];
      return (
        <div className="space-y-3">
          <Facts
            items={[
              ["Events ingested", r.ingested],
              ["Batches anchored", r.batches.length],
              ["Merkle root", <HashChip key="r" value={b?.merkle_root} />],
              ["Anchor tx", <HashChip key="t" value={b?.tx_hash} />],
              ["Gas", b?.gas_used?.toLocaleString()],
            ]}
          />
          {sample.length > 0 && (
            <ul className="space-y-1 rounded-xl border bg-card/40 p-3 text-xs">
              {sample.map((e) => (
                <li key={e.seq} className="flex min-w-0 items-center gap-2">
                  <span className="font-hash text-muted-foreground">#{e.seq}</span>
                  <span className={cn("font-semibold uppercase", e.record!.severity === "critical" ? "text-bad" : "text-warn")}>{e.record!.severity}</span>
                  <span className="truncate text-foreground/85">{e.record!.msg}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    },
  },
  {
    title: "Baseline: everything checks out",
    narration: "We recompute every hash from what the server holds and compare it with the vault and the on-chain commitments.",
    run: async () => {
      const r = await api<VerificationReport>("/api/verify", { method: "POST" });
      return <VerdictBanner verdict={r.verdict} subtitle={`${r.summary.intact} records intact · ${r.duration_ms} ms`} />;
    },
  },
  {
    title: "The attacker gets root and erases their tracks",
    narration:
      "With root on the server, the attacker deletes every log line containing their IP (sed -i '/203.0.113.45/d'). Local forensics now show nothing happened.",
    run: async () => {
      const r = await api<AttackResult>("/api/attacks/cover_tracks", { method: "POST" });
      return <Facts items={[["Host records deleted", r.affected], ["Sequence numbers", r.seqs.join(", ")]]} />;
    },
  },
  {
    title: "…and plants an alibi",
    narration: "Then they inject fake, boring-looking admin logins to make the timeline look normal.",
    run: async () => {
      const r = await api<AttackResult>("/api/attacks/fabricate_alibi", { method: "POST", json: { params: { count: 3 } } });
      return <Facts items={[["Fabricated records", r.affected], ["Sequence numbers", r.seqs.join(", ")]]} />;
    },
  },
  {
    title: "Verify again: the proof survived",
    narration:
      "The server's logs no longer match what was committed on-chain. Every erased record is identified and recovered from the vault, proven against the anchored Merkle root. Every fabricated record is exposed. The commitment itself never moved: the contract has no way to edit it.",
    run: async (ctx) => {
      const r = await api<VerificationReport>("/api/verify", { method: "POST" });
      const recovered = r.findings.filter((f) => f.status === "DELETED").slice(0, 8);
      const before = ctx.anchored ?? [];
      const contract = ctx.deployment?.contract_address;
      const now = ctx.rpcUrl && contract ? await Promise.all(before.map((b) => readBatch(ctx.rpcUrl!, contract, b.id).catch(() => null))) : [];
      const unchanged = before.filter((b, i) => now[i]?.merkle_root?.toLowerCase() === b.root.toLowerCase()).length;
      return (
        <div className="space-y-3">
          <VerdictBanner
            verdict={r.verdict}
            subtitle={`${r.summary.deleted} erased records recovered · ${r.summary.injected} fabricated records exposed · chain attestation ${r.chain_attestation}`}
          />
          {before.length > 0 && (
            <div
              className={cn(
                "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm border-2 border-ink bg-card px-3 py-2.5 text-xs",
                unchanged === before.length ? "shadow-[4px_4px_0_0_var(--ok)]" : "shadow-[4px_4px_0_0_var(--bad)]",
              )}
            >
              {unchanged === before.length ? <Lock className="size-4 text-ok" /> : <ShieldX className="size-4 text-bad" />}
              <span className={cn("font-semibold", unchanged === before.length ? "text-ok" : "text-bad")}>
                {unchanged === before.length ? "On-chain commitment unchanged" : "On-chain commitment differs"}
              </span>
              <span className="text-foreground/75">
                {unchanged}/{before.length} batch root(s) re-read from the contract now equal the roots anchored before the attack
              </span>
              <HashChip value={now[0]?.merkle_root} tone={unchanged === before.length ? "ok" : "bad"} />
            </div>
          )}
          <ul className="space-y-1 text-sm">
            {recovered.map((f) => (
              <li key={f.seq} className="flex min-w-0 items-center gap-2">
                <StatusBadge status="DELETED" />
                <span className="font-hash text-xs text-muted-foreground">#{f.seq}</span>
                <span className="truncate">{f.recovered_record?.msg}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    },
  },
  {
    title: "An outside auditor checks for themselves",
    narration:
      "The auditor trusts neither the server nor us. In this browser, using only WebCrypto and direct JSON-RPC calls to the contract, they check the server's current logs and the protected evidence.",
    run: async (ctx) => {
      const s = ctx.rpcUrl && ctx.deployment ? null : await api<Status>("/api/status");
      const rpc = ctx.rpcUrl ?? s!.chain.rpc_url;
      const contract = ctx.deployment?.contract_address ?? s!.deployment!.contract_address;
      const host = await verifyBundleInBrowser(await api<Bundle>("/api/export?source=host"), rpc, contract);
      const vault = await verifyBundleInBrowser(await api<Bundle>("/api/export?source=vault"), rpc, contract);
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <AuditCard title="Server's current logs" r={host} />
          <AuditCard title="Protected evidence" r={vault} />
        </div>
      );
    },
  },
];

export default function DemoMode() {
  const [results, setResults] = useState<Record<number, Result>>({});
  const [running, setRunning] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ctx = useRef<Ctx>({});
  const reduce = useReducedMotion();
  const next = Object.keys(results).length;

  const runStep = async (i: number) => {
    setRunning(i);
    setError(null);
    document.getElementById(`step-${i}`)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    try {
      const out = await STEPS[i].run(ctx.current);
      setResults((r) => ({ ...r, [i]: out }));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setRunning(null);
    }
  };

  const runAll = async () => {
    setResults({});
    for (let i = 0; i < STEPS.length; i++) {
      if (!(await runStep(i))) return;
      await new Promise((r) => setTimeout(r, 900));
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Opening scene: red field, ink grain, the two-line claim in big serif, controls on a white card */}
      <motion.section
        initial={{ clipPath: "inset(0 100% 0 0)" }}
        animate={{ clipPath: "inset(0 0% 0 0)" }}
        transition={{ duration: dur.slow, ease: ease.inOut }}
        className="relative overflow-hidden rounded-sm border-2 border-ink bg-primary px-5 py-10 text-center text-primary-foreground sm:px-10 sm:py-14"
      >
        <div aria-hidden className="ink-grain absolute inset-0 opacity-60" />
        <div className="relative">
          <div className="label-caps inline-block border-2 border-ink bg-card px-2 py-0.5 text-ink">Live demo · seven scenes</div>
          <h1 className="mt-4 font-display text-[clamp(2rem,6vw,4.5rem)] leading-[0.95] font-black text-balance uppercase">The attacker can erase the logs.</h1>
          <h2 className="mt-1 font-display text-[clamp(2rem,6vw,4.5rem)] leading-[0.95] font-black text-balance text-ink uppercase">They cannot erase the proof.</h2>
          <p className="mx-auto mt-4 max-w-xl text-sm text-primary-foreground/90">
            Seven steps against the real backend and chain. Nothing on this page is scripted output: every value comes from the API, the contract or your browser.
          </p>
          <div className="mt-6 inline-flex flex-wrap justify-center gap-2 rounded-sm border-2 border-ink bg-card p-2 text-foreground shadow-[4px_4px_0_0_var(--ink)]">
            <Button size="lg" onClick={runAll} disabled={running !== null}>
              <PlayCircle /> Run the full story
            </Button>
            <Button size="lg" variant="outline" onClick={() => runStep(next)} disabled={running !== null || next >= STEPS.length}>
              <ChevronRight /> Next step
            </Button>
          </div>
        </div>
      </motion.section>

      {/* Progress as a comic strip: one cell per scene */}
      <div>
        <div className="label-caps mb-1.5 flex justify-between text-muted-foreground">
          <span>Progress</span>
          <span className="tabular">
            {next}/{STEPS.length}
          </span>
        </div>
        <ol className="grid grid-cols-7 gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <li key={s.title} className={cn("h-3 border-2 border-ink transition-colors duration-300", i < next ? "bg-primary" : running === i ? "bg-ink" : "bg-card")} />
          ))}
        </ol>
      </div>

      {error && (
        <AlertBanner tone="danger" title="This step failed" onDismiss={() => setError(null)}>
          {error}
        </AlertBanner>
      )}

      <ol className="space-y-4">
        {STEPS.map((step, i) => {
          const done = i in results;
          const active = running === i;
          return (
            <li
              key={step.title}
              id={`step-${i}`}
              className={cn(
                "surface rounded-sm p-5 transition-[opacity,box-shadow] duration-300",
                active && "shadow-[6px_6px_0_0_var(--primary)]",
                done && "shadow-[6px_6px_0_0_var(--ok)]",
                !done && !active && i > next && "opacity-50",
              )}
            >
              <div className="flex items-start gap-4">
                <div
                  className={cn(
                    "grid size-10 shrink-0 place-items-center border-2 border-ink font-display text-xl font-black transition-colors duration-300",
                    done ? "bg-ok text-paper" : active ? "bg-primary text-paper" : "bg-card text-ink",
                  )}
                >
                  {active ? <Spinner /> : done ? <CheckCircle2 className="size-5" /> : <span>{i + 1}</span>}
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-display text-xl leading-tight font-black uppercase sm:text-2xl">{step.title}</h3>
                    {!done && i === next && (
                      <Button size="sm" variant="ghost" onClick={() => runStep(i)} disabled={running !== null}>
                        <Play /> Run
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{step.narration}</p>
                  {done && <motion.div {...fadeUp}>{results[i]}</motion.div>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Facts({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <div className="grid gap-x-6 gap-y-1.5 rounded-xl border bg-card/40 p-3 text-xs sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="flex min-w-0 items-center justify-between gap-3">
          <span className="shrink-0 text-muted-foreground">{k}</span>
          <span className="truncate text-right font-hash">{v}</span>
        </div>
      ))}
    </div>
  );
}

function AuditCard({ title, r }: { title: string; r: BrowserVerdict }) {
  const ok = r.verdict !== "TAMPERING_DETECTED";
  return (
    <div className={cn("rounded-sm border-2 border-ink p-4 shadow-[4px_4px_0_0_var(--ink)]", ok ? "bg-ok text-paper" : "bg-primary text-primary-foreground")}>
      <div className="text-xs font-semibold opacity-90">{title}</div>
      <div className="mt-1 flex items-center gap-2 font-display text-2xl font-black">
        {ok ? <CheckCircle2 className="size-6" /> : <ShieldX className="size-6" />}
        <span>{r.verdict.replace(/_/g, " ")}</span>
      </div>
      <div className="mt-1 text-xs opacity-90">
        {r.events.filter((e) => e.status === "VERIFIED").length} records proven · {r.missing.length} missing · {r.uncommitted} uncommitted · {r.ms} ms
      </div>
    </div>
  );
}
