"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Anchor, Loader2, Play, RotateCcw, ScanSearch, Siren } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorNote, Hash, PageHeader, Stat, VerdictBanner } from "@/components/status";
import { api, fmtTime, useAction, useApi } from "@/lib/api";
import type { EventItem, Status, VerifyRun } from "@/lib/types";

const SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;
const SEV_COLOR: Record<string, string> = {
  info: "var(--muted-foreground)",
  low: "var(--info)",
  medium: "var(--chart-5)",
  high: "var(--warn)",
  critical: "var(--bad)",
};
const tooltipStyle = {
  contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "var(--foreground)" },
};

export default function Dashboard() {
  const status = useApi<Status>("/api/status", 4000);
  const events = useApi<{ items: EventItem[] }>("/api/events?limit=1000&order=asc", 8000);
  const runs = useApi<{ runs: VerifyRun[] }>("/api/verify/runs?limit=20", 8000);
  const action = useAction();

  const refreshAll = () => Promise.all([status.reload(), events.reload(), runs.reload()]);
  const doAction = async (label: string, fn: () => Promise<unknown>) => {
    await action.run(label, fn);
    await refreshAll();
  };

  const bySource = useMemo(() => {
    const rows: Record<string, Record<string, number>> = {};
    for (const item of events.data?.items ?? []) {
      const rec = item.record ?? item.host_record;
      if (!rec) continue;
      rows[rec.source] ??= Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
      rows[rec.source][rec.severity] += 1;
    }
    return Object.entries(rows).map(([source, counts]) => ({ source, ...counts }));
  }, [events.data]);

  const s = status.data;
  const last = s?.last_verification;
  const pie = last
    ? [
        { name: "Intact", value: last.summary.intact, color: "var(--ok)" },
        { name: "Modified", value: last.summary.modified, color: "var(--warn)" },
        { name: "Deleted", value: last.summary.deleted, color: "var(--bad)" },
        { name: "Injected", value: last.summary.injected, color: "var(--chart-5)" },
      ].filter((d) => d.value > 0)
    : [];
  const history = [...(runs.data?.runs ?? [])].reverse().map((r) => ({
    run: `#${r.run_id}`,
    intact: r.summary.intact,
    tampered: r.summary.modified + r.summary.deleted + r.summary.injected,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security Dashboard"
        description="Live state of the monitored host, the protected evidence vault and the on-chain commitments. Every number here comes from the backend; nothing is simulated in the browser."
        actions={
          <>
            <Button variant="outline" onClick={() => doAction("reset", () => api("/api/demo/reset", { method: "POST" }))} disabled={!!action.busy}>
              {action.busy === "reset" ? <Loader2 className="animate-spin" /> : <RotateCcw />} Reset demo
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                doAction("traffic", () => api("/api/simulate/traffic", { method: "POST", json: { count: 150, include_intrusion: true } }))
              }
              disabled={!!action.busy}
            >
              {action.busy === "traffic" ? <Loader2 className="animate-spin" /> : <Play />} Generate traffic + intrusion
            </Button>
            <Button variant="outline" onClick={() => doAction("seal", () => api("/api/batches/seal", { method: "POST" }))} disabled={!!action.busy}>
              {action.busy === "seal" ? <Loader2 className="animate-spin" /> : <Anchor />} Anchor pending
            </Button>
            <Button onClick={() => doAction("verify", () => api("/api/verify", { method: "POST" }))} disabled={!!action.busy}>
              {action.busy === "verify" ? <Loader2 className="animate-spin" /> : <ScanSearch />} Verify now
            </Button>
          </>
        }
      />
      <ErrorNote error={action.error ?? status.error} />

      <VerdictBanner
        verdict={last?.verdict}
        subtitle={
          last ? (
            <>
              Run #{last.run_id} at {fmtTime(last.verified_at)} in {last.duration_ms} ms · {last.summary.intact} intact,{" "}
              {last.summary.modified} modified, {last.summary.deleted} deleted, {last.summary.injected} injected
              {last.summary.first_divergent_seq !== null && <> · first divergence at seq {last.summary.first_divergent_seq}</>}
            </>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Host log records" value={s?.counts.host_events ?? "—"} hint="what the (compromisable) host holds" />
        <Stat label="Vault evidence" value={s?.counts.vault_events ?? "—"} hint="captured at ingest, append-only" />
        <Stat
          label="Anchored on-chain"
          value={s?.counts.anchored_events ?? "—"}
          hint={`${s?.counts.anchored_batches ?? 0} batches · ${s?.chain.onchain_batch_count ?? "?"} on contract`}
          accent="text-info"
        />
        <Stat
          label="Awaiting anchor"
          value={s?.counts.unanchored_events ?? "—"}
          hint="protected by vault only"
          accent={s && s.counts.unanchored_events > 0 ? "text-warn" : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Telemetry by source and severity</CardTitle>
            <CardDescription>From the evidence vault (original records), including any later deleted on the host.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {bySource.length === 0 ? (
              <EmptyHint />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bySource} margin={{ left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="source" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {SEVERITIES.map((sev) => (
                    <Bar key={sev} dataKey={sev} stackId="a" fill={SEV_COLOR[sev]} radius={sev === "critical" ? [4, 4, 0, 0] : 0} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Last verification</CardTitle>
            <CardDescription>Per-record outcome against vault + chain.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {pie.length === 0 ? (
              <EmptyHint text="Run a verification to see results." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pie} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2} stroke="none">
                    {pie.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Verification history</CardTitle>
            <CardDescription>Intact vs tampered records per verification run (stored in the vault).</CardDescription>
          </CardHeader>
          <CardContent className="h-56">
            {history.length === 0 ? (
              <EmptyHint text="No verification runs yet." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={history} margin={{ left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="run" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                  <Bar dataKey="intact" stackId="r" fill="var(--ok)" />
                  <Bar dataKey="tampered" stackId="r" fill="var(--bad)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Anchor contract</CardTitle>
            <CardDescription>Independent, append-only commitment registry.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Chain ID">{s?.chain.chain_id ?? "—"}</Row>
            <Row label="Latest block">{s?.chain.latest_block ?? "—"}</Row>
            <Row label="Contract">
              <Hash value={s?.deployment?.contract_address} n={6} />
            </Row>
            <Row label="Deploy tx">
              <Hash value={s?.deployment?.tx_hash} n={6} />
            </Row>
            <Row label="RPC">{s?.chain.rpc_url ?? "—"}</Row>
            <Link href="/attack" className="mt-2 flex items-center gap-2 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-bad hover:bg-bad/15">
              <Siren className="size-4" /> Open the attack lab
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right">{children}</span>
    </div>
  );
}

function EmptyHint({ text = "No events yet — reset the demo and generate traffic." }: { text?: string }) {
  return <div className="grid h-full place-items-center text-sm text-muted-foreground">{text}</div>;
}
