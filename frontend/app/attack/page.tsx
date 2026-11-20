"use client";

import { useState } from "react";
import { Bomb, Clock, Eraser, FilePlus2, Loader2, PenLine, RotateCcw, Scissors, Shuffle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorNote, PageHeader, StatusBadge, Stat, VerdictBanner } from "@/components/status";
import { api, useAction, useApi } from "@/lib/api";
import type { AttackResult, Score, VerificationReport } from "@/lib/types";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  cover_tracks: Eraser,
  alter_evidence: PenLine,
  fabricate_alibi: FilePlus2,
  timestomp: Clock,
  truncate_tail: Scissors,
  wipe_all: Trash2,
  random_tamper: Shuffle,
};

const PARAMS: Record<string, Record<string, unknown>> = {
  truncate_tail: { count: 10 },
  fabricate_alibi: { count: 3 },
  random_tamper: { modify: 4, delete_count: 4, inject: 2 },
};

export default function AttackLab() {
  const scenarios = useApi<{ scenarios: { id: string; description: string }[] }>("/api/attacks/scenarios");
  const history = useApi<{ actions: { id: number; performed_at: string; scenario: string; action: string; seq: number }[] }>("/api/attacks?limit=50", 5000);
  const action = useAction();
  const [last, setLast] = useState<AttackResult | null>(null);
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [score, setScore] = useState<Score | null>(null);

  const verify = async () => {
    const r = await action.run("verify", async () => {
      const rep = await api<VerificationReport>("/api/verify", { method: "POST" });
      const sc = await api<Score>("/api/verify/score");
      return { rep, sc };
    });
    if (r) {
      setReport(r.rep);
      setScore(r.sc);
    }
  };

  const attack = async (id: string) => {
    const r = await action.run(id, () => api<AttackResult>(`/api/attacks/${id}`, { method: "POST", json: { params: PARAMS[id] ?? {} } }));
    if (r) {
      setLast(r);
      setReport(null);
      setScore(null);
      history.reload();
    }
  };

  const freshStart = async () => {
    await action.run("fresh", async () => {
      await api("/api/demo/reset", { method: "POST" });
      await api("/api/simulate/traffic", { method: "POST", json: { count: 150, include_intrusion: true } });
    });
    setLast(null);
    setReport(null);
    setScore(null);
    history.reload();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live Attack Simulation"
        description="You are root on web-prod-01. Each scenario rewrites the host's own log store with real SQL. The attacker has no access to the evidence vault, the anchor signer or the chain. Then verify and see what survives."
        actions={
          <>
            <Button variant="outline" onClick={freshStart} disabled={!!action.busy}>
              {action.busy === "fresh" ? <Loader2 className="animate-spin" /> : <RotateCcw />} Fresh host with intrusion
            </Button>
            <Button onClick={verify} disabled={!!action.busy}>
              {action.busy === "verify" ? <Loader2 className="animate-spin" /> : <Bomb />} Verify now
            </Button>
          </>
        }
      />
      <ErrorNote error={action.error} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(scenarios.data?.scenarios ?? []).map((s) => {
          const Icon = ICONS[s.id] ?? Bomb;
          return (
            <Card key={s.id} className="justify-between">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Icon className="size-4 text-bad" /> {s.id.replace(/_/g, " ")}
                </CardTitle>
                <CardDescription className="text-xs">{s.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button size="sm" variant="destructive" className="w-full" disabled={!!action.busy} onClick={() => attack(s.id)}>
                  {action.busy === s.id ? <Loader2 className="animate-spin" /> : null} Launch
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {last && (
        <Card className="border-bad/30">
          <CardHeader>
            <CardTitle className="text-bad">Attack executed: {last.scenario.replace(/_/g, " ")}</CardTitle>
            <CardDescription>
              {last.affected} host record(s) touched ({Object.entries(last.actions).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}).
              Sequence numbers: {last.seqs.slice(0, 30).join(", ")}
              {last.seqs.length > 30 && " …"}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {report && (
        <div className="space-y-4">
          <VerdictBanner
            verdict={report.verdict}
            subtitle={`${report.summary.modified} modified · ${report.summary.deleted} deleted · ${report.summary.injected} injected · chain attestation ${report.chain_attestation} · ${report.duration_ms} ms`}
          />
          {score && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Stat label="Tampered (ground truth)" value={score.ground_truth_tampered} />
              <Stat label="Detected" value={score.detected} />
              <Stat label="True positives" value={score.true_positive} accent="text-ok" />
              <Stat label="Missed" value={score.false_negative} accent={score.false_negative ? "text-bad" : undefined} />
              <Stat label="False alarms" value={score.false_positive} accent={score.false_positive ? "text-bad" : undefined} />
            </div>
          )}
          {report.findings.length > 0 && (
            <Card className="overflow-hidden py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Seq</TableHead>
                    <TableHead className="w-28">Finding</TableHead>
                    <TableHead>Evidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.findings.slice(0, 40).map((f) => (
                    <TableRow key={`${f.seq}-${f.status}`}>
                      <TableCell className="font-hash text-xs">{f.seq}</TableCell>
                      <TableCell>
                        <StatusBadge status={f.status} />
                      </TableCell>
                      <TableCell className="max-w-0 truncate text-xs">
                        {f.status === "DELETED" && <>recovered: {f.recovered_record?.msg}</>}
                        {f.status === "MODIFIED" &&
                          Object.entries(f.diff ?? {})
                            .map(([k, d]) => `${k}: ${JSON.stringify(d.expected)} → ${JSON.stringify(d.found)}`)
                            .join(" · ")}
                        {f.status === "INJECTED" && <>fabricated: {f.host_record?.msg}</>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Attack log (lab ground truth, never read by the verifier)</CardTitle>
        </CardHeader>
        <CardContent className="max-h-64 overflow-auto text-xs">
          {(history.data?.actions ?? []).length === 0 ? (
            <span className="text-muted-foreground">No attacks yet.</span>
          ) : (
            <ul className="space-y-1 font-hash">
              {history.data!.actions.map((a) => (
                <li key={a.id} className="text-muted-foreground">
                  {a.performed_at} <span className="text-foreground">{a.scenario}</span> {a.action} seq {a.seq}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
