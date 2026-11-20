"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Download, Lock, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, HashChip, LoadingRows, Panel, Spinner } from "@/components/kit";
import { api, useApi } from "@/lib/api";
import { dur, ease, stagger } from "@/lib/motion";
import type { Batch, Deployment, Status } from "@/lib/types";
import { readBatch, verifyBundleInBrowser, type Bundle, type ChainBatch } from "@/lib/verify";
import { cn } from "@/lib/utils";

interface Audit {
  source: "host" | "vault";
  verdict: "VERIFIED" | "TAMPERING_DETECTED";
  proven: number;
  rows: { seq: number; status: "VERIFIED" | "TAMPERED" | "MISSING" | "UNVERIFIABLE"; reason?: string }[];
  ms: number;
}

function range(a: number, b: number) {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

/** Batch-scoped audit: pick a commitment, verify one copy of its records in the browser, review discrepancies, export. */
export function BatchAudit() {
  const status = useApi<Status>("/api/status");
  const batches = useApi<{ batches: Batch[]; deployment: Deployment | null }>("/api/batches", 8000);
  const [selected, setSelected] = useState<number | null>(null);
  const [chain, setChain] = useState<ChainBatch | null | undefined>(undefined);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = (batches.data?.batches ?? []).filter((b) => b.status === "anchored");
  const batch = list.find((b) => b.batch_id === selected) ?? null;
  const rpc = status.data?.chain.rpc_url;
  const contract = batches.data?.deployment?.contract_address;

  const select = async (b: Batch) => {
    setSelected(b.batch_id);
    setAudit(null);
    setChain(undefined);
    if (rpc && contract) setChain(await readBatch(rpc, contract, b.batch_id).catch(() => null));
  };

  const bundleFor = (b: Batch, source: "host" | "vault") => api<Bundle>(`/api/export?source=${source}&seqs=${range(b.first_seq, b.last_seq).join(",")}`);

  const run = async (source: "host" | "vault") => {
    if (!batch || !rpc || !contract) return;
    setBusy(source);
    setError(null);
    try {
      const bundle = await bundleFor(batch, source);
      const r = await verifyBundleInBrowser(bundle, rpc, contract);
      const present = new Set(bundle.events.map((e) => e.seq));
      const missing = range(batch.first_seq, batch.last_seq).filter((s) => !present.has(s));
      const rows: Audit["rows"] = [...r.events.filter((e) => e.status !== "VERIFIED"), ...missing.map((seq) => ({ seq, status: "MISSING" as const, reason: "committed on-chain, absent from this copy" }))].sort(
        (a, b) => a.seq - b.seq,
      );
      setAudit({
        source,
        verdict: rows.length || r.batches.some((x) => !x.ok) ? "TAMPERING_DETECTED" : "VERIFIED",
        proven: r.events.filter((e) => e.status === "VERIFIED").length,
        rows,
        ms: r.ms,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const download = async (source: "host" | "vault") => {
    if (!batch) return;
    const b = await bundleFor(batch, source);
    const url = URL.createObjectURL(new Blob([JSON.stringify(b, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `leash-batch${batch.batch_id}-${source}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Panel title="Audit an evidence batch" description="Select an on-chain commitment, verify a copy of its records in your browser, and review every discrepancy.">
      {batches.loading && !batches.data ? (
        <LoadingRows rows={3} />
      ) : list.length === 0 ? (
        <EmptyState title="No anchored batches" hint="Prepare the attack lab or stream traffic first." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <ul className="space-y-1.5" role="listbox" aria-label="Anchored batches">
            {list.map((b) => (
              <li key={b.batch_id}>
                <button
                  role="option"
                  aria-selected={selected === b.batch_id}
                  onClick={() => select(b)}
                  className={cn(
                    "surface-hover w-full rounded-xl border px-3 py-2 text-left text-xs transition-colors",
                    selected === b.batch_id ? "border-primary/50 bg-primary/10" : "bg-card/40",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Batch #{b.batch_id}</span>
                    <span className="font-hash text-muted-foreground">blk {b.block_number}</span>
                  </div>
                  <div className="mt-0.5 text-muted-foreground">
                    seq {b.first_seq}–{b.last_seq} · {b.event_count} records
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <div className="min-w-0">
            {!batch ? (
              <div className="grid h-full place-items-center rounded-xl border border-dashed p-6 text-xs text-muted-foreground">Select a batch to inspect its commitment.</div>
            ) : (
              <motion.div key={batch.batch_id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: dur.base, ease: ease.out }} className="space-y-3">
                <div className="grid gap-x-6 gap-y-1.5 rounded-xl border bg-card/40 p-3 text-xs sm:grid-cols-2">
                  <KV k="On-chain root" v={chain === undefined ? <Spinner className="ml-auto size-3" /> : <HashChip value={chain?.merkle_root} n={8} />} />
                  <KV k="Chain head" v={<HashChip value={chain?.chain_head} n={8} />} />
                  <KV k="Anchoring tx" v={<HashChip value={batch.tx_hash} n={8} />} />
                  <KV k="Anchored at" v={chain ? new Date(chain.anchored_at * 1000).toLocaleString() : "—"} />
                  <KV k="Vault root matches chain" v={chain ? (chain.merkle_root === batch.merkle_root ? <span className="text-ok">yes</span> : <span className="text-bad">no</span>) : "—"} />
                  <KV k="Immutable" v={<span className="inline-flex items-center gap-1 text-ok"><Lock className="size-3" /> no update path</span>} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => run("host")} disabled={!!busy}>
                    {busy === "host" ? <Spinner /> : null} Verify host&apos;s current logs
                  </Button>
                  <Button variant="outline" onClick={() => run("vault")} disabled={!!busy}>
                    {busy === "vault" ? <Spinner /> : null} Verify protected evidence
                  </Button>
                  <Button variant="ghost" onClick={() => download("vault")}>
                    <Download /> Export evidence
                  </Button>
                  <Button variant="ghost" onClick={() => download("host")}>
                    <Download /> Export host copy
                  </Button>
                </div>
                {error && <div className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad">{error}</div>}
                <AnimatePresence mode="wait">
                  {audit && (
                    <motion.div key={`${audit.source}-${audit.ms}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: dur.base, ease: ease.out }}>
                      <div className={cn("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm", audit.verdict === "VERIFIED" ? "border-ok/30 bg-ok/[0.08] text-ok" : "border-bad/35 bg-bad/[0.08] text-bad")}>
                        {audit.verdict === "VERIFIED" ? <CheckCircle2 className="size-4" /> : <ShieldX className="size-4" />}
                        <span className="font-semibold">{audit.verdict === "VERIFIED" ? "Verified" : "Discrepancies found"}</span>
                        <span className="text-foreground/75">
                          · {audit.source === "host" ? "host's current logs" : "protected evidence"} · {audit.proven} of {batch.event_count} records proven · {audit.ms} ms in your browser
                        </span>
                      </div>
                      {audit.rows.length > 0 && (
                        <div className="mt-2 max-h-64 overflow-auto rounded-xl border scrollbar-thin">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-popover text-left text-muted-foreground">
                              <tr>
                                <th className="px-3 py-2 font-medium">Seq</th>
                                <th className="px-3 py-2 font-medium">Finding</th>
                                <th className="px-3 py-2 font-medium">Why</th>
                              </tr>
                            </thead>
                            <tbody>
                              {audit.rows.map((r, i) => (
                                <motion.tr key={`${r.seq}-${r.status}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={stagger(i, 0.02, 0.3)} className="border-t border-border/50">
                                  <td className="px-3 py-1.5 font-hash">{r.seq}</td>
                                  <td className={cn("px-3 py-1.5 font-semibold", r.status === "MISSING" || r.status === "TAMPERED" ? "text-bad" : "text-warn")}>{r.status}</td>
                                  <td className="px-3 py-1.5 text-muted-foreground">{r.reason}</td>
                                </motion.tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span className="min-w-0 text-right">{v}</span>
    </div>
  );
}
