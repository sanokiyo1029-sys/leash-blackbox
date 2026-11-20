"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Crosshair, FlaskConical, Gauge, ShieldCheck, Target, Timer } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertBanner, EmptyState, MetricCard, PageTitle, Panel, Spinner } from "@/components/kit";
import { api, useAction } from "@/lib/api";
import { dur, ease } from "@/lib/motion";
import type { Batch, Score, VerificationReport } from "@/lib/types";

interface Trial {
  trial: number;
  events: number;
  tampered: number;
  tp: number;
  fn: number;
  fp: number;
  cleanFindings: number;
  verifyMs: number;
  anchorMs: number;
  gas: number;
}

const tooltipStyle = {
  contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, boxShadow: "var(--shadow-pop)" },
  labelStyle: { color: "var(--muted-foreground)" },
  itemStyle: { color: "var(--foreground)" },
};

export default function Validation() {
  const [trials, setTrials] = useState<Trial[]>([]);
  const [n, setN] = useState(5);
  const [progress, setProgress] = useState<string | null>(null);
  const action = useAction();

  const run = async () => {
    setTrials([]);
    await action.run("trials", async () => {
      for (let i = 1; i <= n; i++) {
        setProgress(`Trial ${i}/${n}: reset + ingest`);
        await api("/api/demo/reset", { method: "POST" });
        const events = 100 + ((i * 37) % 150);
        const t = await api<{ ingested: number; batches: Batch[]; anchor_error: string | null }>("/api/simulate/traffic", {
          method: "POST",
          json: { count: events, include_intrusion: true, seed: 1000 + i },
        });
        if (t.anchor_error) throw new Error(t.anchor_error);
        setProgress(`Trial ${i}/${n}: clean verification`);
        const clean = await api<VerificationReport>("/api/verify", { method: "POST" });
        setProgress(`Trial ${i}/${n}: random tampering + verification`);
        await api("/api/attacks/random_tamper", {
          method: "POST",
          json: { params: { modify: 2 + (i % 5), delete_count: 2 + (i % 4), inject: 1 + (i % 3), seed: 2000 + i } },
        });
        const rep = await api<VerificationReport>("/api/verify", { method: "POST" });
        const sc = await api<Score>("/api/verify/score");
        setTrials((prev) => [
          ...prev,
          {
            trial: i,
            events: t.ingested,
            tampered: sc.ground_truth_tampered,
            tp: sc.true_positive,
            fn: sc.false_negative,
            fp: sc.false_positive,
            cleanFindings: clean.findings.length,
            verifyMs: rep.duration_ms,
            anchorMs: t.batches.reduce((s, b) => s + (b.anchor_latency_ms ?? 0), 0),
            gas: t.batches.reduce((s, b) => s + (b.gas_used ?? 0), 0),
          },
        ]);
      }
    });
    setProgress(null);
  };

  const tot = trials.reduce(
    (a, t) => ({ tp: a.tp + t.tp, fn: a.fn + t.fn, fp: a.fp + t.fp, clean: a.clean + t.cleanFindings, ev: a.ev + t.events }),
    { tp: 0, fn: 0, fp: 0, clean: 0, ev: 0 },
  );
  const recall = tot.tp + tot.fn ? (tot.tp / (tot.tp + tot.fn)) * 100 : null;
  const precision = tot.tp + tot.fp ? (tot.tp / (tot.tp + tot.fp)) * 100 : null;
  const median = trials.length ? [...trials].map((t) => t.verifyMs).sort((a, b) => a - b)[Math.floor(trials.length / 2)] : null;
  const pct = (x: number) => `${x.toFixed(1)}%`;

  return (
    <div className="space-y-5">
      <PageTitle
        eyebrow="Research"
        title="Validation & Research"
        description="Randomized trials run live against the backend and the local chain. Each trial resets the lab, ingests and anchors new telemetry, checks a clean verification for false alarms, applies seeded random tampering, and scores detection against the attack lab's ground truth."
        actions={
          <>
            <Input
              type="number"
              min={1}
              max={50}
              value={n}
              disabled={!!action.busy}
              aria-label="Number of trials"
              onChange={(e) => setN(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
              className="w-20"
            />
            <Button onClick={run} disabled={!!action.busy}>
              {action.busy ? <Spinner /> : <FlaskConical />} Run trials
            </Button>
          </>
        }
      />

      {action.error && (
        <AlertBanner tone="danger" title="Trial run failed" onDismiss={() => action.setError(null)}>
          {action.error}
        </AlertBanner>
      )}
      <AlertBanner tone="warn" title="Running trials resets the demo data">
        Each trial deploys a fresh contract, ingests new telemetry and tampers with it.
      </AlertBanner>

      {progress && (
        <div className="surface space-y-2 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="text-primary" /> {progress}
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${(trials.length / n) * 100}%` }} transition={{ duration: dur.base, ease: ease.out }} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard label="Trials" value={trials.length} icon={FlaskConical} hint={`${tot.ev} events anchored`} />
        <MetricCard label="Recall" value={recall} format={pct} icon={Target} tone="ok" hint={`${tot.tp} of ${tot.tp + tot.fn} tampered records found`} />
        <MetricCard label="Precision" value={precision} format={pct} icon={Crosshair} tone="ok" hint={`${tot.fp} false alarm(s) after tampering`} />
        <MetricCard
          label="Clean-run false alarms"
          value={trials.length ? tot.clean : null}
          icon={ShieldCheck}
          tone={trials.length ? (tot.clean ? "bad" : "ok") : undefined}
          hint="findings before any attack"
        />
        <MetricCard label="Median verify time" value={median} format={(x) => `${Math.round(x)} ms`} icon={Timer} hint="full host vs vault vs chain check" />
      </div>

      {trials.length === 0 && !progress ? (
        <Panel>
          <EmptyState
            icon={Gauge}
            title="No trials run yet"
            hint="Choose how many trials to run and press Run trials. Every number on this page comes from that live run. Results for 30 offline trials are in docs/validation/RESULTS.md."
          />
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Latency per trial" description="Verification time and on-chain anchoring latency (local Hardhat node, automine).">
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trials} margin={{ left: -16, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="trial" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} unit="ms" tickLine={false} axisLine={false} />
                  <Tooltip {...tooltipStyle} />
                  <Line type="monotone" dataKey="verifyMs" name="verify" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="anchorMs" name="anchor" stroke="var(--chart-3)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel title="Detection per trial" description="TP = tampered records found, FN = missed, FP = false alarms." bodyClassName="px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="pl-5">#</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Tampered</TableHead>
                  <TableHead>TP</TableHead>
                  <TableHead>FN</TableHead>
                  <TableHead>FP</TableHead>
                  <TableHead className="pr-5">Gas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trials.map((t) => (
                  <TableRow key={t.trial} className="border-border/50 font-hash text-xs">
                    <TableCell className="pl-5">{t.trial}</TableCell>
                    <TableCell>{t.events}</TableCell>
                    <TableCell>{t.tampered}</TableCell>
                    <TableCell className="text-ok">{t.tp}</TableCell>
                    <TableCell className={t.fn ? "text-bad" : ""}>{t.fn}</TableCell>
                    <TableCell className={t.fp ? "text-bad" : ""}>{t.fp}</TableCell>
                    <TableCell className="pr-5">{t.gas.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </div>
      )}
    </div>
  );
}
