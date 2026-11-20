"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, CheckCircle2, Link2, ShieldCheck, ShieldX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HashChip, Skeleton, Spinner } from "@/components/kit";
import { StatusBadge } from "@/components/status";
import { api } from "@/lib/api";
import { dur, ease } from "@/lib/motion";
import type { BatchReport, EventItem, EventRecord } from "@/lib/types";
import { leafHash, readBatch, rootFromProof, type ProofStep } from "@/lib/verify";
import { cn } from "@/lib/utils";

interface Detail {
  records: EventItem[];
  proof: { seq: number; batch_id: number; leaf_index: number; record: EventRecord; proof: ProofStep[] } | null;
  batch: BatchReport | null;
}

interface Check {
  anchoredLeaf: string; // recomputed in the browser from the anchored original
  hostLeaf: string | null; // recomputed from the host's current copy
  path: string[]; // intermediate roots after each proof step
  onchainRoot: string | null; // read directly from the contract
  ok: boolean;
  ms: number;
}

async function foldPath(leaf: string, proof: ProofStep[]): Promise<string[]> {
  const out: string[] = [];
  let acc = leaf;
  for (const step of proof) {
    acc = await rootFromProof(acc, [step]);
    out.push(acc);
  }
  return out;
}

export function EvidenceDetail({ seq, rpcUrl, contract, onClose }: { seq: number; rpcUrl?: string; contract?: string; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let live = true;
    api<Detail>(`/api/events/${seq}`)
      .then((d) => live && setDetail(d))
      .catch((e) => live && setErr(String(e.message ?? e)));
    return () => {
      live = false;
    };
  }, [seq]);

  const main = detail?.records[0];
  const original = main?.status === "INJECTED" ? null : (detail?.proof?.record ?? main?.record ?? null);

  const runCheck = async () => {
    if (!detail?.proof || !rpcUrl || !contract) return;
    setChecking(true);
    setErr(null);
    const t0 = performance.now();
    try {
      const anchoredLeaf = await leafHash(detail.proof.record);
      const hostLeaf = main?.host_record ? await leafHash(main.host_record) : null;
      const path = await foldPath(anchoredLeaf, detail.proof.proof);
      const onchain = await readBatch(rpcUrl, contract, detail.proof.batch_id);
      const root = path.length ? path[path.length - 1] : anchoredLeaf;
      setCheck({ anchoredLeaf, hostLeaf, path, onchainRoot: onchain?.merkle_root ?? null, ok: !!onchain && root === onchain.merkle_root, ms: Math.round(performance.now() - t0) });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };

  const hostMatches = check && check.hostLeaf !== null ? check.hostLeaf === check.anchoredLeaf : null;

  return (
    <motion.aside
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: dur.base, ease: ease.out }}
      className="surface h-fit rounded-2xl xl:sticky xl:top-20"
      aria-label={`Evidence for record ${seq}`}
    >
      <header className="flex items-center justify-between gap-2 border-b px-5 py-3.5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          Record <span className="font-hash">#{seq}</span> {main && <StatusBadge status={main.status} />}
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Close detail">
          <X className="size-4" />
        </button>
      </header>

      <div className="space-y-5 px-5 py-4 text-sm">
        {err && <div className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}
        {!detail && !err && (
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-24" />
          </div>
        )}

        {main && (
          <>
            {main.status === "DELETED" && (
              <Callout tone="bad">Erased from the host. The original below comes from the evidence vault, and you can prove it against the chain.</Callout>
            )}
            {main.status === "INJECTED" && <Callout tone="violet">No collector or on-chain commitment exists for this record. It was fabricated on the host.</Callout>}
            {main.status === "MODIFIED" && main.diff && (
              <Step n={0} title="What changed on the host">
                <div className="space-y-1.5">
                  {Object.entries(main.diff).map(([field, d]) => (
                    <div key={field} className="rounded-lg border bg-muted/30 p-2 text-xs">
                      <div className="mb-0.5 font-semibold text-muted-foreground">{field}</div>
                      <div className="text-ok">− anchored: {JSON.stringify(d.expected)}</div>
                      <div className="text-bad">+ on host: {JSON.stringify(d.found)}</div>
                    </div>
                  ))}
                </div>
              </Step>
            )}

            <Step n={1} title={main.status === "INJECTED" ? "Host record" : "Event metadata (anchored original)"}>
              <RecordView record={main.status === "INJECTED" ? main.host_record : original} />
            </Step>

            {main.status !== "INJECTED" && detail?.proof && (
              <>
                <Step n={2} title="SHA-256 leaf">
                  <div className="space-y-1 text-xs">
                    <Row k="Anchored leaf (vault)" v={<HashChip value={main.leaf_hash} n={10} />} />
                    <Row k="Host copy leaf" v={main.host_leaf_hash ? <HashChip value={main.host_leaf_hash} n={10} tone={main.host_leaf_hash === main.leaf_hash ? "ok" : "bad"} /> : <span className="text-bad">record missing</span>} />
                    <p className="pt-1 text-[11px] text-muted-foreground">leaf = SHA-256(0x00 ‖ canonical JSON of the record)</p>
                  </div>
                </Step>

                <Step n={3} title={`Merkle inclusion proof · ${detail.proof.proof.length} steps`}>
                  <ol className="space-y-1">
                    {detail.proof.proof.map((s, i) => {
                      const lit = !!check;
                      return (
                        <motion.li
                          key={i}
                          className={cn("flex items-center gap-2 rounded-md border px-2 py-1 text-xs transition-colors", lit ? (check!.ok ? "border-ok/25 bg-ok/[0.05]" : "border-bad/25 bg-bad/[0.05]") : "border-transparent")}
                          animate={lit ? { opacity: [0.4, 1] } : { opacity: 1 }}
                          transition={{ delay: lit ? i * 0.09 : 0, duration: dur.fast }}
                        >
                          <span className="w-5 text-muted-foreground">{i + 1}</span>
                          <span className="w-10 text-muted-foreground">{s.side === "L" ? "left" : "right"}</span>
                          <HashChip value={s.hash} n={7} />
                          {lit && (
                            <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                              <ArrowDown className="size-3" />
                              <span className="font-hash">{check!.path[i]?.slice(0, 8)}</span>
                            </span>
                          )}
                        </motion.li>
                      );
                    })}
                  </ol>
                </Step>

                <Step n={4} title="On-chain commitment">
                  <div className="space-y-1 text-xs">
                    <Row k="Batch" v={<span className="font-hash">#{detail.proof.batch_id}</span>} />
                    <Row k="Merkle root (contract)" v={<HashChip value={check?.onchainRoot ?? detail.batch?.onchain?.merkle_root} n={10} />} />
                    <Row k="Anchoring tx" v={<HashChip value={detail.batch?.tx_hash} n={8} />} />
                    <Row k="Block" v={<span className="font-hash">{detail.batch?.block_number ?? "—"}</span>} />
                  </div>
                </Step>

                <Step n={5} title="Verify independently">
                  <Button onClick={runCheck} disabled={checking || !rpcUrl || !contract} className="w-full">
                    {checking ? <Spinner /> : <Link2 />} Verify against chain
                  </Button>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Recomputes the leaf with WebCrypto, folds the proof, and reads the root straight from the contract. The backend is not trusted for this check.
                  </p>
                  <AnimatePresence>
                    {check && (
                      <motion.div
                        key={check.ms}
                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: dur.base, ease: ease.out, delay: Math.min(detail.proof.proof.length * 0.09, 0.8) }}
                        className={cn("mt-3 rounded-xl border p-3 text-xs", check.ok ? "border-ok/30 bg-ok/[0.08] text-ok" : "border-bad/35 bg-bad/[0.08] text-bad")}
                      >
                        <div className="flex items-center gap-2 font-semibold">
                          {check.ok ? <CheckCircle2 className="size-4" /> : <ShieldX className="size-4" />}
                          {check.ok ? "Anchored original proven against the on-chain root" : "Proof does not reach the on-chain root"}
                        </div>
                        <div className="mt-1 text-foreground/75">
                          Computed in your browser in {check.ms} ms.{" "}
                          {hostMatches === null
                            ? "The host no longer has this record; the proven original above is what was logged."
                            : hostMatches
                              ? "The host's current copy hashes to the same leaf, so it is intact."
                              : "The host's current copy hashes to a different leaf, so it was altered after anchoring."}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Step>
              </>
            )}
          </>
        )}
      </div>
    </motion.aside>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {n > 0 && <span className="grid size-4 place-items-center rounded-full bg-primary/15 text-[9px] text-primary">{n}</span>}
        {title}
      </div>
      {children}
    </section>
  );
}

function Callout({ tone, children }: { tone: "bad" | "violet"; children: React.ReactNode }) {
  return (
    <div className={cn("flex gap-2 rounded-xl border p-3 text-xs", tone === "bad" ? "border-bad/30 bg-bad/[0.08] text-bad" : "border-violet/35 bg-violet/[0.08] text-violet")}>
      {tone === "bad" ? <ShieldX className="size-4 shrink-0" /> : <ShieldCheck className="size-4 shrink-0" />}
      <span>{children}</span>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span className="min-w-0 text-right">{v}</span>
    </div>
  );
}

function RecordView({ record }: { record: EventRecord | null | undefined }) {
  if (!record) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="space-y-1 rounded-xl border bg-muted/25 p-3 text-xs">
      <Row k="Time" v={<span className="font-hash">{record.ts}</span>} />
      <Row k="Source / type" v={`${record.source} / ${record.type}`} />
      <Row k="Severity" v={record.severity} />
      <Row k="Actor" v={record.actor} />
      <div className="pt-1 font-hash break-words text-foreground/90">{record.msg}</div>
      {Object.keys(record.attrs ?? {}).length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {Object.entries(record.attrs).map(([k, v]) => (
            <span key={k} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {k}={v}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
