"use client";

import { useState } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorNote, PageHeader, Stat } from "@/components/status";
import { api, useAction } from "@/lib/api";
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
  const recall = tot.tp + tot.fn ? tot.tp / (tot.tp + tot.fn) : null;
  const precision = tot.tp + tot.fp ? tot.tp / (tot.tp + tot.fp) : null;
  const pct = (x: number | null) => (x === null ? "—" : `${(x * 100).toFixed(1)}%`);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Validation & Research"
        description="Randomized trials run live against the backend and the local chain. Each trial resets the lab, ingests and anchors new telemetry, checks a clean verification for false alarms, applies seeded random tampering, and scores detection against the attack lab's ground truth."
        actions={
          <div className="flex items-center gap-2">
            <Input type="number" min={1} max={50} value={n} onChange={(e) => setN(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} className="w-20" />
            <Button onClick={run} disabled={!!action.busy}>
              {action.busy ? <Loader2 className="animate-spin" /> : <FlaskConical />} Run trials
            </Button>
          </div>
        }
      />
      <ErrorNote error={action.error} />
      <div className="rounded-lg border border-warn/30 bg-warn/10 px-4 py-2 text-xs text-warn">
        Running trials resets the demo data and deploys a fresh contract for each trial.
      </div>
      {progress && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {progress}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Trials" value={trials.length} hint={`${tot.ev} events anchored`} />
        <Stat label="Recall" value={pct(recall)} hint={`${tot.tp} of ${tot.tp + tot.fn} tampered records found`} accent="text-ok" />
        <Stat label="Precision" value={pct(precision)} hint={`${tot.fp} false alarm(s) after tampering`} accent="text-ok" />
        <Stat label="Clean-run false alarms" value={trials.length ? tot.clean : "—"} hint="findings before any attack" />
        <Stat
          label="Median verify time"
          value={trials.length ? `${[...trials].map((t) => t.verifyMs).sort((a, b) => a - b)[Math.floor(trials.length / 2)]} ms` : "—"}
        />
      </div>

      {trials.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Latency per trial</CardTitle>
              <CardDescription>Verification time and on-chain anchoring latency (local Hardhat node, automine).</CardDescription>
            </CardHeader>
            <CardContent className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trials} margin={{ left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="trial" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} unit="ms" />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", fontSize: 12 }} />
                  <Line type="monotone" dataKey="verifyMs" name="verify" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="anchorMs" name="anchor" stroke="var(--chart-3)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="overflow-hidden py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Tampered</TableHead>
                  <TableHead>TP</TableHead>
                  <TableHead>FN</TableHead>
                  <TableHead>FP</TableHead>
                  <TableHead>Gas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trials.map((t) => (
                  <TableRow key={t.trial} className="font-hash text-xs">
                    <TableCell>{t.trial}</TableCell>
                    <TableCell>{t.events}</TableCell>
                    <TableCell>{t.tampered}</TableCell>
                    <TableCell className="text-ok">{t.tp}</TableCell>
                    <TableCell className={t.fn ? "text-bad" : ""}>{t.fn}</TableCell>
                    <TableCell className={t.fp ? "text-bad" : ""}>{t.fp}</TableCell>
                    <TableCell>{t.gas.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  );
}
