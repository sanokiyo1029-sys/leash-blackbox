"use client";

import { useRef, useState } from "react";
import { CheckCircle2, ChevronRight, Circle, Loader2, Play, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorNote, Hash, StatusBadge, VerdictBanner } from "@/components/status";
import { api } from "@/lib/api";
import type { AttackResult, Batch, Deployment, Status, VerificationReport } from "@/lib/types";
import { verifyBundleInBrowser, type BrowserVerdict, type Bundle } from "@/lib/verify";
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
            ["Contract", <Hash key="c" value={r.deployment.contract_address} />],
            ["Deploy tx", <Hash key="t" value={r.deployment.tx_hash} />],
          ]}
        />
      );
    },
  },
  {
    title: "A normal day… and an intrusion",
    narration:
      "Routine telemetry flows in. Hidden inside it: a port scan, an SSH brute force, a successful login, sudo to root, a cron backdoor and data exfiltration. Every event is canonicalized, hashed and chained, and each batch's Merkle root is anchored on-chain.",
    run: async () => {
      const r = await api<{ ingested: number; batches: Batch[]; anchor_error: string | null }>("/api/simulate/traffic", {
        method: "POST",
        json: { count: 150, include_intrusion: true },
      });
      if (r.anchor_error) throw new Error(r.anchor_error);
      const b = r.batches[0];
      return (
        <Facts
          items={[
            ["Events ingested", r.ingested],
            ["Batches anchored", r.batches.length],
            ["Merkle root", <Hash key="r" value={b?.merkle_root} />],
            ["Anchor tx", <Hash key="t" value={b?.tx_hash} />],
            ["Gas", b?.gas_used?.toLocaleString()],
          ]}
        />
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
      "The server's logs no longer match what was committed on-chain. Every erased record is identified and recovered from the vault, proven against the anchored Merkle root. Every fabricated record is exposed.",
    run: async () => {
      const r = await api<VerificationReport>("/api/verify", { method: "POST" });
      const recovered = r.findings.filter((f) => f.status === "DELETED").slice(0, 8);
      return (
        <div className="space-y-3">
          <VerdictBanner
            verdict={r.verdict}
            subtitle={`${r.summary.deleted} erased records recovered · ${r.summary.injected} fabricated records exposed · chain attestation ${r.chain_attestation}`}
          />
          <ul className="space-y-1 text-sm">
            {recovered.map((f) => (
              <li key={f.seq} className="flex items-center gap-2">
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
  const next = Object.keys(results).length;

  const runStep = async (i: number) => {
    setRunning(i);
    setError(null);
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
      <div className="text-center">
        <div className="text-xs tracking-[0.3em] text-primary uppercase">Live demo</div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">The attacker can erase the logs.</h1>
        <h2 className="text-4xl font-semibold tracking-tight text-primary">They cannot erase the proof.</h2>
        <div className="mt-6 flex justify-center gap-3">
          <Button size="lg" onClick={runAll} disabled={running !== null}>
            <PlayCircle /> Run the full story
          </Button>
          <Button size="lg" variant="outline" onClick={() => runStep(next)} disabled={running !== null || next >= STEPS.length}>
            <ChevronRight /> Next step
          </Button>
        </div>
      </div>
      <ErrorNote error={error} />
      <ol className="space-y-4">
        {STEPS.map((step, i) => {
          const done = i in results;
          const active = running === i;
          return (
            <li key={step.title} className={cn("rounded-xl border bg-card/60 p-5 transition-opacity", !done && !active && i > next && "opacity-50")}>
              <div className="flex items-start gap-4">
                <div className="mt-0.5">
                  {active ? (
                    <Loader2 className="size-6 animate-spin text-primary" />
                  ) : done ? (
                    <CheckCircle2 className="size-6 text-ok" />
                  ) : (
                    <Circle className="size-6 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold">
                      <span className="mr-2 font-hash text-sm text-muted-foreground">{i + 1}</span>
                      {step.title}
                    </h3>
                    {!done && i === next && (
                      <Button size="sm" variant="ghost" onClick={() => runStep(i)} disabled={running !== null}>
                        <Play /> Run
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{step.narration}</p>
                  {done && <div>{results[i]}</div>}
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
    <div className="grid gap-2 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">{k}</span>
          <span className="truncate text-right">{v}</span>
        </div>
      ))}
    </div>
  );
}

function AuditCard({ title, r }: { title: string; r: BrowserVerdict }) {
  const ok = r.verdict !== "TAMPERING_DETECTED";
  return (
    <div className={cn("rounded-lg border p-4", ok ? "border-ok/30 bg-ok/10" : "border-bad/40 bg-bad/10")}>
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className={cn("text-lg font-semibold", ok ? "text-ok" : "text-bad")}>{r.verdict.replace(/_/g, " ")}</div>
      <div className="mt-1 text-xs text-foreground/80">
        {r.events.filter((e) => e.status === "VERIFIED").length} records proven · {r.missing.length} missing · {r.uncommitted} uncommitted · {r.ms} ms
      </div>
    </div>
  );
}
