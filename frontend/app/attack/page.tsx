"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  Check,
  Clock,
  Eraser,
  FilePlus2,
  Link2,
  Lock,
  PenLine,
  RotateCcw,
  ScanSearch,
  Server,
  ShieldCheck,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertBanner, EmptyState, HashChip, LiveDot, LoadingRows, PageTitle, Spinner } from "@/components/kit";
import { api, useAction, useApi } from "@/lib/api";
import { dur, ease, spring, stagger } from "@/lib/motion";
import type { AttackResult, Batch, Deployment, EventItem, EventRecord, Score, Status, VerificationReport } from "@/lib/types";
import { readBatch, type ChainBatch } from "@/lib/verify";
import { cn } from "@/lib/utils";

const ATTACKER_IP = "203.0.113.45";

type Touch = "delete" | "modify" | "inject";

const TOOLKIT: { id: string; label: string; hint: string; icon: React.ComponentType<{ className?: string }>; action: Touch; cmd: string; params?: Record<string, unknown> }[] = [
  { id: "cover_tracks", label: "Erase my trail", hint: "delete every line with the attacker IP", icon: Eraser, action: "delete", cmd: `sed -i '/${ATTACKER_IP}/d' /var/log/auth.log` },
  { id: "alter_evidence", label: "Launder evidence", hint: "swap attacker IP, downgrade severity", icon: PenLine, action: "modify", cmd: `sed -i 's/${ATTACKER_IP}/10.0.4.12/g; s/critical/info/' /var/log/auth.log` },
  { id: "fabricate_alibi", label: "Plant an alibi", hint: "append fake admin logins", icon: FilePlus2, action: "inject", cmd: "printf 'Accepted publickey for alice ...' >> /var/log/auth.log", params: { count: 2 } },
  { id: "timestomp", label: "Timestomp", hint: "shift intrusion times back 3 days", icon: Clock, action: "modify", cmd: "touch -d '-3 days' ...; rewrite timestamps" },
];

interface Row {
  seq: number;
  host: EventRecord | null;
  hostHash: string | null;
  anchored: EventRecord | null;
  anchoredHash: string | null;
  batchId: number | null;
  verdict: "INTACT" | "MODIFIED" | "DELETED" | "INJECTED" | null; // null = not verified since last change
  touched?: Touch;
}

function timeOf(ts?: string) {
  return ts ? ts.slice(11, 19) : "--:--:--";
}

function Highlight({ text }: { text: string }) {
  if (!text.includes(ATTACKER_IP)) return <>{text}</>;
  const parts = text.split(ATTACKER_IP);
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <span className="rounded bg-bad/15 px-0.5 font-hash text-bad">{ATTACKER_IP}</span>}
        </span>
      ))}
    </>
  );
}

export default function AttackLab() {
  const status = useApi<Status>("/api/status");
  const events = useApi<{ items: EventItem[] }>("/api/events?limit=1000&order=asc");
  const batches = useApi<{ batches: Batch[]; deployment: Deployment | null }>("/api/batches");
  const action = useAction();

  const [report, setReport] = useState<VerificationReport | null>(null);
  const [score, setScore] = useState<Score | null>(null);
  const [touched, setTouched] = useState<Map<number, Touch>>(new Map());
  const [stale, setStale] = useState(true);
  const [command, setCommand] = useState<string | null>(null);
  const [chain, setChain] = useState<Record<number, ChainBatch | null>>({});
  const [focus, setFocus] = useState<number | null>(null);
  const rowRefs = useRef(new Map<number, HTMLDivElement>());

  const deployment = batches.data?.deployment ?? null;
  const rpcUrl = status.data?.chain.rpc_url;

  // Read the commitment straight from the contract (not from our backend).
  useEffect(() => {
    if (!rpcUrl || !deployment) return;
    let live = true;
    const anchored = (batches.data?.batches ?? []).filter((b) => b.status === "anchored");
    Promise.all(anchored.map(async (b) => [b.batch_id, await readBatch(rpcUrl, deployment.contract_address, b.batch_id).catch(() => null)] as const)).then(
      (pairs) => live && setChain(Object.fromEntries(pairs)),
    );
    return () => {
      live = false;
    };
  }, [rpcUrl, deployment, batches.data]);

  const findings = useMemo(() => new Map((report?.findings ?? []).map((f) => [f.seq, f])), [report]);

  const rows: Row[] = useMemo(() => {
    const items = events.data?.items ?? [];
    const story = items.filter((i) => (i.record ?? i.host_record)?.attrs?.story === "intrusion").map((i) => i.seq);
    const maxSeq = items.reduce((m, i) => Math.max(m, i.seq), 0);
    const lo = story.length ? Math.min(...story) - 2 : maxSeq - 13;
    const hi = story.length ? Math.max(...story) + 2 : maxSeq;
    return items
      .filter((i) => (i.seq >= lo && i.seq <= hi) || i.record === null)
      .map((i) => ({
        seq: i.seq,
        host: i.host_record,
        hostHash: i.host_leaf_hash,
        anchored: i.record,
        anchoredHash: i.leaf_hash,
        batchId: i.batch_id,
        verdict: report && !stale ? (findings.get(i.seq)?.status ?? (i.record ? "INTACT" : null)) : null,
        touched: touched.get(i.seq),
      }));
  }, [events.data, report, stale, findings, touched]);

  const reload = () => Promise.all([events.reload(), batches.reload(), status.reload()]);

  const prepare = async () => {
    const ok = await action.run("prepare", async () => {
      await api("/api/demo/reset", { method: "POST" });
      await api("/api/simulate/traffic", { method: "POST", json: { count: 40, include_intrusion: true } });
    });
    setReport(null);
    setScore(null);
    setTouched(new Map());
    setStale(true);
    setCommand(null);
    if (ok !== null) await reload();
  };

  const verify = async () => {
    const r = await action.run("verify", async () => {
      const rep = await api<VerificationReport>("/api/verify", { method: "POST" });
      const sc = await api<Score>("/api/verify/score");
      return { rep, sc };
    });
    if (!r) return;
    await reload();
    setReport(r.rep);
    setScore(r.sc);
    setStale(false);
  };

  const applyAttack = async (label: string, path: string, kind: Touch, cmd: string, params?: Record<string, unknown>) => {
    setCommand(cmd);
    const r = await action.run(label, () => api<AttackResult>(path, { method: "POST", json: { params: params ?? {} } }));
    if (!r) return;
    setTouched((prev) => {
      const next = new Map(prev);
      r.seqs.forEach((s) => next.set(s, kind));
      return next;
    });
    setStale(true);
    await reload();
  };

  const hasData = (events.data?.items.length ?? 0) > 0;
  const attacked = touched.size > 0;
  const step = !hasData ? 0 : !report && !attacked ? 1 : !attacked ? 2 : stale ? 3 : 4;
  const anchoredBatch = batches.data?.batches.find((b) => b.status === "anchored");
  const onchain = anchoredBatch ? chain[anchoredBatch.batch_id] : undefined;
  const batchReport = report?.batches.find((b) => b.batch_id === anchoredBatch?.batch_id);
  const verifying = action.busy === "verify";
  const s = report?.summary;

  return (
    <div className="space-y-5">
      <PageTitle
        eyebrow="Live attack lab"
        title="Compromise the server. Watch the proof survive."
        description="Left: the monitored server's own log store, which you control as root. Right: the same records as committed on an independent blockchain. Every change below is a real write to the host database; every verdict comes from the real verifier."
        actions={
          <Button variant="outline" onClick={prepare} disabled={!!action.busy}>
            {action.busy === "prepare" ? <Spinner /> : <RotateCcw />} {hasData ? "Reset lab" : "Prepare lab"}
          </Button>
        }
      />

      <Stepper step={step} />

      {/* Command bar */}
      <div className="surface flex flex-col gap-3 rounded-2xl p-3 lg:flex-row lg:items-center">
        <div className="flex items-center gap-2 px-1 text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
          <Terminal className="size-4 text-bad" /> Attacker toolkit
        </div>
        <div className="flex flex-1 flex-wrap gap-2">
          {TOOLKIT.map((t) => (
            <Button
              key={t.id}
              size="sm"
              variant="destructive"
              disabled={!hasData || !!action.busy}
              onClick={() => applyAttack(t.id, `/api/attacks/${t.id}`, t.action, t.cmd, t.params)}
              title={t.hint}
            >
              {action.busy === t.id ? <Spinner /> : <t.icon />} {t.label}
            </Button>
          ))}
        </div>
        <Button size="lg" onClick={verify} disabled={!hasData || !!action.busy} className="lg:min-w-48">
          {verifying ? <Spinner /> : <ScanSearch />} Verify integrity
        </Button>
      </div>

      <AnimatePresence mode="popLayout">
        {action.error && <AlertBanner key="err" tone="danger" title="Request failed" onDismiss={() => action.setError(null)}>{action.error}</AlertBanner>}
        {report && !stale && report.verdict === "CLEAN" && (
          <AlertBanner key="clean" tone="success" title={`Verified — all ${s?.intact} records match the on-chain commitment`}>
            Recomputed {s?.intact} SHA-256 leaves and the Merkle root in {report.duration_ms} ms; chain attestation {report.chain_attestation}.
          </AlertBanner>
        )}
        {report && !stale && report.verdict === "TAMPERING_DETECTED" && (
          <AlertBanner key="bad" tone="danger" title="Tampering detected — the server's logs no longer match the blockchain">
            {s?.modified ? `${s.modified} altered · ` : ""}
            {s?.deleted ? `${s.deleted} erased (originals recovered) · ` : ""}
            {s?.injected ? `${s.injected} fabricated · ` : ""}
            first divergence at seq {s?.first_divergent_seq}. The on-chain commitment is unchanged.
            {score && (
              <span className="text-foreground/60">
                {" "}
                Lab ground truth: {score.true_positive}/{score.ground_truth_tampered} caught, {score.false_positive} false alarms.
              </span>
            )}
          </AlertBanner>
        )}
        {report && !stale && report.verdict === "INCONCLUSIVE" && (
          <AlertBanner key="inc" tone="warn" title="Inconclusive — the blockchain could not be reached">Nothing is reported as clean without the chain.</AlertBanner>
        )}
        {attacked && stale && (
          <AlertBanner key="stale" tone="warn" title="Host logs changed since the last verification">
            The server now says everything is fine. Run <b>Verify integrity</b> to check it against the chain.
          </AlertBanner>
        )}
      </AnimatePresence>

      {!hasData && !events.loading ? (
        <div className="surface rounded-2xl">
          <EmptyState
            icon={Server}
            title="The lab is empty"
            hint="Prepare the lab to boot web-prod-01, stream 40 normal events plus a hidden intrusion, and anchor them on-chain."
            action={
              <Button onClick={prepare} disabled={!!action.busy}>
                {action.busy === "prepare" ? <Spinner /> : <RotateCcw />} Prepare lab
              </Button>
            }
          />
        </div>
      ) : (
        <div className="relative">
          {/* Scan line: runs only while a real verification request is in flight */}
          <AnimatePresence>
            {verifying && (
              <motion.div
                key="scan"
                className="pointer-events-none absolute inset-x-0 top-0 z-20 h-24 bg-gradient-to-b from-transparent via-primary/15 to-transparent"
                initial={{ y: 0, opacity: 0 }}
                animate={{ y: ["0%", "900%"], opacity: [0, 1, 1, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
              />
            )}
          </AnimatePresence>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_52px_minmax(0,1fr)]">
            {/* Panel headers */}
            <HostHeader attacked={attacked} command={command} busy={!!action.busy && action.busy !== "verify"} />
            <div className="hidden lg:block" />
            <ChainHeader
              batch={anchoredBatch}
              onchain={onchain}
              deployment={deployment}
              hostRoot={batchReport?.host_root ?? null}
              verified={!!report && !stale}
              missing={report && !stale ? (s?.deleted ?? 0) : 0}
            />

            {events.loading && !events.data ? (
              <div className="lg:col-span-3">
                <LoadingRows rows={8} />
              </div>
            ) : (
              <LayoutGroup>
                {rows.map((row, i) => (
                  <RowPair
                    key={row.seq}
                    row={row}
                    index={i}
                    focused={focus === row.seq}
                    refCb={(el) => (el ? rowRefs.current.set(row.seq, el) : rowRefs.current.delete(row.seq))}
                    busy={!!action.busy}
                    onErase={() => applyAttack(`erase-${row.seq}`, "/api/attacks/erase_record", "delete", `sed -i '${row.seq}d' /var/log/auth.log`, { seq: row.seq })}
                    onRewrite={() => applyAttack(`rewrite-${row.seq}`, "/api/attacks/rewrite_record", "modify", `vim +${row.seq} /var/log/auth.log  # launder line`, { seq: row.seq })}
                  />
                ))}
              </LayoutGroup>
            )}
          </div>
        </div>
      )}

      {report && !stale && report.findings.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: dur.base, ease: ease.out }} className="surface rounded-2xl p-4">
          <div className="mb-3 text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">What the verifier proved</div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {report.findings.slice(0, 12).map((f, i) => (
              <motion.button
                key={`${f.seq}-${f.status}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={stagger(i)}
                onClick={() => {
                  setFocus(f.seq);
                  rowRefs.current.get(f.seq)?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                className="surface-hover rounded-xl border bg-card/40 p-3 text-left text-xs"
              >
                <div className="mb-1 flex items-center gap-2">
                  <VerdictPill verdict={f.status} />
                  <span className="font-hash text-muted-foreground">seq {f.seq}</span>
                </div>
                <div className="line-clamp-2 text-foreground/80">
                  {f.status === "DELETED" && <>Erased line recovered: {f.recovered_record?.msg}</>}
                  {f.status === "MODIFIED" &&
                    Object.entries(f.diff ?? {})
                      .filter(([k]) => k !== "attrs")
                      .map(([k, d]) => `${k}: ${String(d.expected)} → ${String(d.found)}`)
                      .join(" · ")}
                  {f.status === "INJECTED" && <>No commitment exists: {f.host_record?.msg}</>}
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ pieces
const STEPS = ["Prepare host", "Baseline verify", "Compromise", "Verify again"];

function Stepper({ step }: { step: number }) {
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {STEPS.map((label, i) => {
        const done = step > i;
        const current = step === i;
        return (
          <li key={label} className={cn("surface flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs transition-colors", current && "border-primary/40")}>
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold transition-colors duration-300",
                done ? "border-ok/40 bg-ok/15 text-ok" : current ? "border-primary/50 bg-primary/15 text-primary" : "border-border text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn("font-medium", !done && !current && "text-muted-foreground")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function HostHeader({ attacked, command, busy }: { attacked: boolean; command: string | null; busy: boolean }) {
  return (
    <div className={cn("surface rounded-2xl p-4 transition-colors duration-500", attacked && "border-bad/35 bg-bad/[0.04]")}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className={cn("grid size-8 place-items-center rounded-lg transition-colors", attacked ? "bg-bad/15 text-bad" : "bg-muted text-muted-foreground")}>
            <Server className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold">web-prod-01</div>
            <div className="truncate text-[11px] text-muted-foreground">local log store · what the server says happened</div>
          </div>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
            attacked ? "border-bad/35 bg-bad/10 text-bad" : "border-border text-muted-foreground",
          )}
        >
          <LiveDot tone={attacked ? "bad" : "muted"} pulse={attacked} /> {attacked ? "root shell active" : "untrusted by design"}
        </span>
      </div>
      <AnimatePresence initial={false}>
        {command && (
          <motion.div
            key={command}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: dur.base, ease: ease.out }}
            className="overflow-hidden"
          >
            <div className="mt-3 flex items-center gap-2 overflow-hidden rounded-lg border border-bad/20 bg-black/40 px-3 py-2 font-hash text-[11.5px] text-bad/90">
              <span className="text-bad">root@web-prod-01:~#</span>
              <motion.span
                className="truncate"
                initial={{ clipPath: "inset(0 100% 0 0)" }}
                animate={{ clipPath: "inset(0 0% 0 0)" }}
                transition={{ duration: 0.6, ease: "linear" }}
              >
                {command}
              </motion.span>
              {busy && <span className="h-3.5 w-1.5 animate-pulse bg-bad/80" />}
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">Illustrative shell command. The lab performs the equivalent write on the host database.</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChainHeader({
  batch,
  onchain,
  deployment,
  hostRoot,
  verified,
  missing,
}: {
  batch?: Batch;
  onchain?: ChainBatch | null;
  deployment: Deployment | null;
  hostRoot: string | null;
  verified: boolean;
  missing: number;
}) {
  const match = verified && !!onchain && hostRoot === onchain.merkle_root;
  return (
    <div className="surface rounded-2xl border-info/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-lg bg-info/15 text-info">
            <Link2 className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold">LeashAnchor commitment</div>
            <div className="truncate text-[11px] text-muted-foreground">
              read directly from contract {deployment ? `${deployment.contract_address.slice(0, 8)}…` : ""}
            </div>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-ok/25 bg-ok/[0.07] px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-ok">
          <Lock className="size-3" /> immutable
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11.5px]">
        <span className="text-muted-foreground">Batch</span>
        <span className="text-right font-hash">{batch ? `#${batch.batch_id} · seq ${batch.first_seq}–${batch.last_seq}` : "—"}</span>
        <span className="text-muted-foreground">On-chain Merkle root</span>
        <span className="text-right">{onchain === undefined ? <Spinner className="ml-auto size-3" /> : <HashChip value={onchain?.merkle_root} n={7} />}</span>
        <span className="text-muted-foreground">Anchored in block</span>
        <span className="text-right font-hash">{onchain?.block_number ?? batch?.block_number ?? "—"}</span>
        <span className="text-muted-foreground">Transaction</span>
        <span className="text-right">
          <HashChip value={batch?.tx_hash} n={6} />
        </span>
      </div>
      <AnimatePresence initial={false}>
        {verified && onchain && (
          <motion.div
            key={`${hostRoot}-${missing}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: dur.base, ease: ease.out }}
            className={cn("mt-3 rounded-lg border px-3 py-2 text-[11.5px]", match ? "border-ok/30 bg-ok/[0.07] text-ok" : "border-bad/35 bg-bad/[0.08] text-bad")}
          >
            <div className="flex items-center justify-between gap-2">
              <span>Root rebuilt from host logs</span>
              {hostRoot ? <HashChip value={hostRoot} n={7} tone={match ? "ok" : "bad"} /> : <span className="font-hash">cannot rebuild</span>}
            </div>
            <div className="mt-0.5 text-foreground/70">
              {match
                ? "Identical to the on-chain root: every committed record is present and unaltered."
                : hostRoot
                  ? "Differs from the on-chain root: at least one committed record was altered."
                  : `${missing} committed record(s) are missing from the host, so the root cannot be rebuilt.`}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function VerdictPill({ verdict }: { verdict: Row["verdict"] }) {
  if (!verdict) return null;
  const map = {
    INTACT: "border-ok/30 bg-ok/10 text-ok",
    MODIFIED: "border-warn/35 bg-warn/10 text-warn",
    DELETED: "border-bad/35 bg-bad/10 text-bad",
    INJECTED: "border-violet/40 bg-violet/10 text-violet",
  } as const;
  return <span className={cn("rounded-md border px-1.5 py-px text-[10px] font-semibold tracking-wide", map[verdict])}>{verdict}</span>;
}

function Connector({ verdict, index }: { verdict: Row["verdict"]; index: number }) {
  const cfg = !verdict
    ? { icon: null, cls: "border-border bg-card text-muted-foreground", line: "bg-border" }
    : verdict === "INTACT"
      ? { icon: Check, cls: "border-ok/40 bg-ok/15 text-ok", line: "bg-ok/40" }
      : verdict === "INJECTED"
        ? { icon: X, cls: "border-violet/40 bg-violet/15 text-violet", line: "bg-violet/40" }
        : { icon: X, cls: "border-bad/45 bg-bad/15 text-bad", line: "bg-bad/50" };
  const Icon = cfg.icon;
  return (
    <div className="relative hidden items-center justify-center lg:flex" aria-label={verdict ? `verification: ${verdict}` : "not verified"}>
      <span className={cn("absolute inset-x-0 top-1/2 h-px -translate-y-1/2 transition-colors duration-500", cfg.line)} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={verdict ?? "pending"}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.4, opacity: 0 }}
          transition={{ ...spring.snappy, delay: verdict ? Math.min(index * 0.035, 0.5) : 0 }}
          className={cn("relative grid size-6 place-items-center rounded-full border text-[10px]", cfg.cls)}
        >
          {Icon ? <Icon className="size-3.5" strokeWidth={3} /> : <span className="font-hash">?</span>}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

function RowPair({
  row,
  index,
  focused,
  refCb,
  busy,
  onErase,
  onRewrite,
}: {
  row: Row;
  index: number;
  focused: boolean;
  refCb: (el: HTMLDivElement | null) => void;
  busy: boolean;
  onErase: () => void;
  onRewrite: () => void;
}) {
  const bad = row.verdict === "MODIFIED" || row.verdict === "DELETED";
  const injected = row.verdict === "INJECTED" || (!row.anchored && !!row.host);
  const attackerLine = (row.host?.msg ?? row.anchored?.msg ?? "").includes(ATTACKER_IP);

  return (
    <div ref={refCb} className={cn("grid gap-2 rounded-2xl border p-2 lg:contents", bad && "border-bad/30", focused && "ring-2 ring-primary/40 lg:ring-0")}>
      {/* LEFT: host */}
      <motion.div
        layout="position"
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={stagger(index, 0.02)}
        className={cn(
          "group relative min-h-[62px] overflow-hidden rounded-xl border bg-card/50 px-3 py-2 transition-[border-color,background-color] duration-500",
          row.touched === "modify" && row.host && "border-warn/40 bg-warn/[0.05]",
          injected && "border-violet/40 bg-violet/[0.06]",
          bad && "border-bad/40",
          focused && "lg:ring-2 lg:ring-primary/40",
        )}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {row.host ? (
            <motion.div
              key={row.hostHash ?? "host"}
              initial={{ opacity: 0, y: 6, filter: "blur(3px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: -24, filter: "blur(4px)" }}
              transition={{ duration: dur.slow, ease: ease.out }}
            >
              {row.touched === "modify" && (
                <motion.span
                  className="pointer-events-none absolute inset-0 bg-warn/20"
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 1.4, ease: ease.out }}
                />
              )}
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="font-hash text-foreground/60">#{row.seq}</span>
                <span className="font-hash">{timeOf(row.host.ts)}</span>
                <span className={cn("rounded px-1", row.host.severity === "critical" ? "bg-bad/15 text-bad" : row.host.severity === "high" ? "bg-warn/15 text-warn" : "bg-muted")}>
                  {row.host.source}
                </span>
                <span className="ml-auto">
                  <HashChip value={row.hostHash} n={5} tone={bad ? "bad" : row.touched === "modify" ? "warn" : undefined} />
                </span>
              </div>
              <div className="mt-1 truncate pr-14 text-[13px] lg:pr-16">
                <Highlight text={row.host.msg} />
              </div>
              {!injected && (
                <div className="absolute right-2 bottom-1.5 flex gap-1 opacity-100 transition-opacity duration-200 lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
                  <button
                    disabled={busy}
                    onClick={onRewrite}
                    title="Rewrite this line on the host"
                    aria-label={`Rewrite record ${row.seq}`}
                    className="rounded-md border border-warn/30 bg-warn/10 p-1 text-warn transition hover:bg-warn/20 active:scale-95 disabled:opacity-40"
                  >
                    <PenLine className="size-3.5" />
                  </button>
                  <button
                    disabled={busy}
                    onClick={onErase}
                    title="Erase this line from the host"
                    aria-label={`Erase record ${row.seq}`}
                    className="rounded-md border border-bad/30 bg-bad/10 p-1 text-bad transition hover:bg-bad/20 active:scale-95 disabled:opacity-40"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div key="erased" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: dur.base }} className="relative flex h-full min-h-[44px] items-center gap-2">
              {/* shredder sweep */}
              <motion.span
                className="absolute inset-y-0 left-0 w-full origin-left bg-gradient-to-r from-bad/0 via-bad/30 to-bad/0"
                initial={{ scaleX: 0, opacity: 1 }}
                animate={{ scaleX: 1, opacity: 0 }}
                transition={{ duration: 0.9, ease: ease.out }}
              />
              <span className="font-hash text-[11px] text-foreground/50">#{row.seq}</span>
              <span className="text-[12.5px] text-bad/90 italic">line erased from the host</span>
              <span className="ml-auto rounded border border-dashed border-bad/40 px-1.5 text-[10px] text-bad">missing</span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* CENTER: connector (desktop) / inline verdict (mobile) */}
      <Connector verdict={row.verdict} index={index} />
      <div className="flex items-center justify-center gap-2 lg:hidden">
        {row.verdict ? <VerdictPill verdict={row.verdict} /> : <span className="text-[10px] text-muted-foreground">not verified yet</span>}
      </div>

      {/* RIGHT: chain-backed evidence */}
      <motion.div
        layout="position"
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={stagger(index, 0.02)}
        className={cn(
          "relative min-h-[62px] rounded-xl border bg-card/40 px-3 py-2 transition-[border-color,background-color] duration-500",
          row.verdict === "INTACT" && "border-ok/25",
          bad && "border-ok/40 bg-ok/[0.05]",
          focused && "lg:ring-2 lg:ring-primary/40",
        )}
      >
        {row.anchored ? (
          <>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <ShieldCheck className={cn("size-3.5", row.verdict ? "text-ok" : "text-info")} />
              <span>committed · batch #{row.batchId}</span>
              <span className="ml-auto">
                <HashChip value={row.anchoredHash} n={5} tone={row.verdict === "INTACT" || bad ? "ok" : undefined} />
              </span>
            </div>
            <div className={cn("mt-1 truncate text-[13px]", bad ? "text-ok" : "text-foreground/65", attackerLine && !bad && "text-foreground/80")}>
              {bad && <span className="mr-1.5 text-[10px] font-semibold tracking-wide uppercase">original</span>}
              <Highlight text={row.anchored.msg} />
            </div>
          </>
        ) : (
          <div className="flex h-full min-h-[44px] items-center gap-2 text-[12.5px] text-violet">
            <span className="rounded border border-dashed border-violet/50 px-1.5 text-[10px]">no commitment</span>
            <span className="italic opacity-90">this line never reached the collector</span>
          </div>
        )}
      </motion.div>
    </div>
  );
}
