"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Anchor, Blocks, Database, Play, ScanSearch, Server, ShieldCheck, Swords } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { AlertBanner, EmptyState, HashChip, LiveDot, LoadingRows, MetricCard, PageTitle, Panel, Spinner } from "@/components/kit";
import { StatusBadge } from "@/components/status";
import { api, fmtTime, useAction, useApi } from "@/lib/api";
import { dur, ease } from "@/lib/motion";
import type { Batch, EventItem, Status, VerificationReport, VerifyRun } from "@/lib/types";
import { cn } from "@/lib/utils";

const tooltipStyle = {
  contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, boxShadow: "var(--shadow-pop)" },
  labelStyle: { color: "var(--muted-foreground)" },
  itemStyle: { color: "var(--foreground)" },
};
const pct = (n: number) => `${n.toFixed(1)}%`;
const SEV_DOT: Record<string, string> = { critical: "bg-bad", high: "bg-warn", medium: "bg-violet", low: "bg-info", info: "bg-muted-foreground/60" };

export default function Dashboard() {
  const status = useApi<Status>("/api/status", 4000);
  const events = useApi<{ items: EventItem[] }>("/api/events?limit=1000&order=asc", 5000);
  const batches = useApi<{ batches: Batch[] }>("/api/batches", 6000);
  const runs = useApi<{ runs: VerifyRun[] }>("/api/verify/runs?limit=12", 6000);
  const lastId = status.data?.last_verification?.run_id ?? null;
  const lastReport = useApi<VerificationReport>(lastId ? `/api/verify/runs/${lastId}` : null);
  const action = useAction();

  const run = async (label: string, fn: () => Promise<unknown>) => {
    await action.run(label, fn);
    await Promise.all([status.reload(), events.reload(), batches.reload(), runs.reload()]);
  };

  const s = status.data;
  const last = s?.last_verification;
  const items = useMemo(() => events.data?.items ?? [], [events.data]);

  const timeline = useMemo(
    () =>
      [...items]
        .filter((i) => i.host_record ?? i.record)
        .sort((a, b) => b.seq - a.seq)
        .slice(0, 12),
    [items],
  );

  const threat = useMemo(() => {
    const buckets = new Map<string, { t: string; critical: number; elevated: number; routine: number }>();
    for (const i of items) {
      const r = i.record ?? i.host_record;
      if (!r) continue;
      const key = r.ts.slice(11, 16);
      const b = buckets.get(key) ?? { t: key, critical: 0, elevated: 0, routine: 0 };
      if (r.severity === "critical" || r.severity === "high") b.critical += 1;
      else if (r.severity === "medium") b.elevated += 1;
      else b.routine += 1;
      buckets.set(key, b);
    }
    return [...buckets.values()].sort((a, b) => a.t.localeCompare(b.t));
  }, [items]);

  const integrity = last ? (last.summary.total_records ? (last.summary.intact / last.summary.total_records) * 100 : 100) : null;
  const donut = last
    ? [
        { name: "Intact", value: last.summary.intact, color: "var(--ok)" },
        { name: "Modified", value: last.summary.modified, color: "var(--warn)" },
        { name: "Deleted", value: last.summary.deleted, color: "var(--bad)" },
        { name: "Injected", value: last.summary.injected, color: "var(--violet)" },
      ].filter((d) => d.value > 0)
    : [];
  const recentTx = [...(batches.data?.batches ?? [])].reverse().slice(0, 6);
  const findings = (lastReport.data?.findings ?? []).slice(0, 6);
  const chainOk = !!s?.chain.connected && s.chain.contract_present !== false;

  return (
    <div className="space-y-5">
      <PageTitle
        eyebrow="Security operations"
        title="Security Dashboard"
        description="Live view of the monitored host, the protected evidence vault and the on-chain commitments. Every value is read from the backend or the chain."
        actions={
          <>
            <Button variant="outline" onClick={() => run("traffic", () => api("/api/simulate/traffic", { method: "POST", json: { count: 60, include_intrusion: true } }))} disabled={!!action.busy}>
              {action.busy === "traffic" ? <Spinner /> : <Play />} Stream traffic
            </Button>
            <Button variant="outline" onClick={() => run("seal", () => api("/api/batches/seal", { method: "POST" }))} disabled={!!action.busy}>
              {action.busy === "seal" ? <Spinner /> : <Anchor />} Anchor pending
            </Button>
            <Button onClick={() => run("verify", () => api("/api/verify", { method: "POST" }))} disabled={!!action.busy}>
              {action.busy === "verify" ? <Spinner /> : <ScanSearch />} Verify now
            </Button>
          </>
        }
      />

      <AnimatePresence mode="popLayout">
        {(action.error || status.error) && (
          <AlertBanner key="err" tone="danger" title={status.error ? "Backend unreachable" : "Action failed"} onDismiss={action.error ? () => action.setError(null) : undefined}>
            {action.error ?? status.error}
          </AlertBanner>
        )}
        {last ? (
          <AlertBanner
            key={`v-${last.run_id}`}
            tone={last.verdict === "CLEAN" ? "success" : last.verdict === "TAMPERING_DETECTED" ? "danger" : "warn"}
            title={
              last.verdict === "CLEAN"
                ? "CLEAN — host logs match the on-chain proof"
                : last.verdict === "TAMPERING_DETECTED"
                  ? "Tampering detected on web-prod-01"
                  : "Inconclusive — chain unreachable"
            }
          >
            Run #{last.run_id} · {fmtTime(last.verified_at)} · {last.duration_ms} ms · {last.summary.intact} intact, {last.summary.modified} modified,{" "}
            {last.summary.deleted} deleted, {last.summary.injected} injected
            {last.summary.first_divergent_seq !== null && ` · first divergence at seq ${last.summary.first_divergent_seq}`}
          </AlertBanner>
        ) : (
          s && <AlertBanner key="none" tone="info" title="Not verified yet">Run a verification to attest the host&apos;s logs against the chain.</AlertBanner>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Host log records" value={s?.counts.host_events} icon={Server} hint="what the compromisable host holds" />
        <MetricCard label="Vault evidence" value={s?.counts.vault_events} icon={Database} hint="captured at ingest · append-only" />
        <MetricCard
          label="Anchored on-chain"
          value={s?.counts.anchored_events}
          icon={Blocks}
          tone="info"
          hint={
            <>
              <span className="tabular">{s?.counts.anchored_batches ?? 0}</span> {s?.counts.anchored_batches === 1 ? "batch" : "batches"} · {s?.counts.unanchored_events ?? 0} pending
            </>
          }
        />
        <MetricCard
          label="Integrity"
          value={integrity}
          format={pct}
          icon={ShieldCheck}
          tone={integrity === null ? undefined : integrity === 100 ? "ok" : "bad"}
          hint={last ? `last verified ${fmtTime(last.verified_at)}` : "awaiting first verification"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title={
            <span className="flex items-center gap-2">
              <LiveDot tone="info" /> Live event timeline
            </span>
          }
          description="Newest first · polled every 5 s · original records from the vault"
          actions={
            <Link href="/evidence" className="text-xs text-primary hover:underline">
              Open explorer →
            </Link>
          }
        >
          {events.loading && !events.data ? (
            <LoadingRows rows={6} />
          ) : timeline.length === 0 ? (
            <EmptyState title="No events yet" hint="Stream traffic or prepare the attack lab to generate telemetry." />
          ) : (
            <ul className="relative space-y-1.5">
              <span className="absolute top-2 bottom-2 left-[7px] w-px bg-border" aria-hidden />
              <AnimatePresence initial={false}>
                {timeline.map((i) => {
                  const r = (i.status === "DELETED" ? i.record : i.host_record ?? i.record)!;
                  return (
                    <motion.li
                      key={i.seq}
                      layout="position"
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: dur.base, ease: ease.out }}
                      className="relative flex items-center gap-3 rounded-lg py-1 pr-2 pl-0 text-sm"
                    >
                      <span className={cn("relative z-10 size-[15px] shrink-0 rounded-full border-4 border-background", SEV_DOT[r.severity])} />
                      <span className="w-16 shrink-0 font-hash text-[11px] text-muted-foreground">{r.ts.slice(11, 19)}</span>
                      <span className="hidden w-20 shrink-0 truncate text-xs text-muted-foreground sm:block">{r.source}</span>
                      <span className="min-w-0 flex-1 truncate">{r.msg}</span>
                      <span className="font-hash text-[11px] text-muted-foreground">#{i.seq}</span>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </Panel>

        <Panel
          title="Blockchain"
          description="Independent append-only commitment registry"
          tone={s ? (chainOk ? "safe" : "danger") : undefined}
          actions={
            <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]", chainOk ? "border-ok/25 text-ok" : "border-bad/30 text-bad")}>
              <LiveDot tone={chainOk ? "ok" : "bad"} pulse={chainOk} /> {chainOk ? "connected" : s ? "offline" : "…"}
            </span>
          }
        >
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Chain ID</dt>
            <dd className="text-right font-hash">{s?.chain.chain_id ?? "—"}</dd>
            <dt className="text-muted-foreground">Latest block</dt>
            <dd className="text-right font-hash">{s?.chain.latest_block ?? "—"}</dd>
            <dt className="text-muted-foreground">Batches on contract</dt>
            <dd className="text-right font-hash">{s?.chain.onchain_batch_count ?? "—"}</dd>
            <dt className="text-muted-foreground">Contract</dt>
            <dd className="text-right">
              <HashChip value={s?.deployment?.contract_address} n={5} />
            </dd>
          </dl>
          <div className="mt-4 mb-2 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">Recent anchoring transactions</div>
          {recentTx.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">No batches anchored yet.</div>
          ) : (
            <ul className="space-y-1.5">
              <AnimatePresence initial={false}>
                {recentTx.map((b) => (
                  <motion.li
                    key={b.batch_id}
                    layout="position"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-2 rounded-lg border bg-card/40 px-2.5 py-1.5 text-xs"
                  >
                    <span className={cn("size-1.5 rounded-full", b.status === "anchored" ? "bg-ok" : "bg-warn")} />
                    <span className="font-hash text-muted-foreground">#{b.batch_id}</span>
                    <HashChip value={b.tx_hash} n={5} />
                    <span className="ml-auto text-muted-foreground">
                      <span className="tabular">{b.event_count}</span> ev · blk {b.block_number ?? "—"}
                    </span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Threat activity" description="Events per minute by severity (from the evidence vault)">
          <div className="h-60">
            {threat.length === 0 ? (
              <EmptyState title="No telemetry" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={threat} margin={{ left: -18, right: 8, top: 6 }}>
                  <defs>
                    {[
                      ["crit", "var(--bad)"],
                      ["elev", "var(--violet)"],
                      ["rout", "var(--info)"],
                    ].map(([id, c]) => (
                      // Ink hatching instead of gradients (print look, docs/design/REFERENCE_SPEC.md)
                      <pattern key={id} id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                        <rect width="6" height="6" fill={c} fillOpacity={0.1} />
                        <line x1="0" y1="0" x2="0" y2="6" stroke={c} strokeWidth={1.6} strokeOpacity={0.6} />
                      </pattern>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="t" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} cursor={{ stroke: "var(--border)" }} />
                  <Area type="monotone" dataKey="routine" name="info / low" stackId="1" stroke="var(--info)" fill="url(#rout)" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="elevated" name="medium" stackId="1" stroke="var(--violet)" fill="url(#elev)" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="critical" name="high / critical" stackId="1" stroke="var(--bad)" fill="url(#crit)" strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        <Panel title="Integrity verification" description={last ? `Run #${last.run_id} · ${runs.data?.runs.length ?? 0} recent runs` : "No runs yet"}>
          <div className="relative h-40">
            {donut.length === 0 ? (
              <EmptyState title="Not verified" />
            ) : (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donut} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="92%" paddingAngle={2} stroke="none" isAnimationActive>
                      {donut.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip {...tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                  <div>
                    <div className={cn("font-display text-xl font-black tabular", integrity === 100 ? "text-ok" : "text-bad")}>{integrity !== null ? pct(integrity) : "—"}</div>
                    <div className="text-[11px] text-muted-foreground">intact</div>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="mt-3 mb-2 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">Tampering alerts</div>
          {lastReport.loading && lastId ? (
            <LoadingRows rows={3} />
          ) : findings.length === 0 ? (
            <div className="rounded-lg border border-ok/20 bg-ok/[0.05] px-3 py-2 text-xs text-ok">{last ? "No tampering in the last verification." : "No verification yet."}</div>
          ) : (
            <ul className="space-y-1.5">
              {findings.map((f, i) => (
                <motion.li
                  key={`${f.seq}-${f.status}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-2 text-xs"
                >
                  <StatusBadge status={f.status} />
                  <span className="font-hash text-muted-foreground">#{f.seq}</span>
                  <span className="truncate text-foreground/80">{(f.recovered_record ?? f.host_record)?.msg}</span>
                </motion.li>
              ))}
              {(lastReport.data?.findings.length ?? 0) > findings.length && (
                <li>
                  <Link href="/attack" className="text-xs text-primary hover:underline">
                    +{(lastReport.data?.findings.length ?? 0) - findings.length} more in the Attack Lab →
                  </Link>
                </li>
              )}
            </ul>
          )}
        </Panel>
      </div>

      <Link
        href="/attack"
        className="group relative flex items-center justify-between gap-4 overflow-hidden rounded-sm border-2 border-ink bg-primary p-6 text-primary-foreground transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--ink)] sm:p-8"
      >
        <div aria-hidden className="ink-grain absolute inset-0 opacity-50" />
        <div className="relative min-w-0">
          <div className="label-caps mb-2 inline-block border-2 border-ink bg-card px-2 py-0.5 text-ink">Attack lab · live</div>
          <div className="font-display text-[clamp(1.6rem,4vw,2.6rem)] leading-none font-black uppercase">Run the live attack</div>
          <div className="mt-2 text-sm text-primary-foreground/90">Take root on web-prod-01, erase the trail, and watch the chain-backed verifier catch it.</div>
        </div>
        <span className="relative grid size-14 shrink-0 place-items-center rounded-full border-2 border-ink bg-card text-ink transition-transform duration-300 group-hover:translate-x-1">
          <Swords className="size-6" />
        </span>
      </Link>
    </div>
  );
}
