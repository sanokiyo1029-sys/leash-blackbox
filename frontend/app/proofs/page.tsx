"use client";

import { useEffect, useState } from "react";
import { Blocks, CheckCircle2, Database, Fuel, Timer, XCircle } from "lucide-react";
import { AlertBanner, EmptyState, HashChip, LoadingRows, MetricCard, PageTitle, Panel } from "@/components/kit";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, fmtTime, useApi } from "@/lib/api";
import type { Batch, Deployment, OnChainBatch, Status } from "@/lib/types";
import { readBatch, type ChainBatch } from "@/lib/verify";
import { cn } from "@/lib/utils";

interface BatchDetail {
  batch: Batch;
  onchain: OnChainBatch | { error: string } | null;
  receipt: { status: number; block_number: number; gas_used: number; from: string; to: string; transaction_hash: string; logs: number } | null;
}

export default function ProofExplorer() {
  const { data, error } = useApi<{ batches: Batch[]; deployment: Deployment | null }>("/api/batches", 5000);
  const status = useApi<Status>("/api/status");
  const [selected, setSelected] = useState<number | null>(null);
  const batches = data?.batches ?? [];
  const active = selected ?? (batches.length ? batches[batches.length - 1].batch_id : null);

  const anchored = batches.filter((b) => b.status === "anchored");
  const latencies = anchored.map((b) => b.anchor_latency_ms).filter((x): x is number => x !== null).sort((a, b) => a - b);

  return (
    <div className="space-y-5">
      <PageTitle
        eyebrow="On-chain commitments"
        title="Blockchain Proof Explorer"
        description="Each batch commits a Merkle root, a hash-chain head and a manifest hash to the LeashAnchor contract. The contract has no update or delete function and enforces contiguous sequence ranges."
      />
      {error && (
        <AlertBanner tone="danger" title="Backend unreachable">
          {error}
        </AlertBanner>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Anchored batches" value={data ? anchored.length : null} icon={Blocks} tone="info" hint={`${batches.length - anchored.length} pending or failed`} />
        <MetricCard label="Records committed" value={data ? anchored.reduce((s, b) => s + b.event_count, 0) : null} icon={Database} hint="covered by an on-chain root" />
        <MetricCard label="Gas used" value={data ? anchored.reduce((s, b) => s + (b.gas_used ?? 0), 0) : null} icon={Fuel} hint="all anchoring transactions" />
        <MetricCard
          label="Median anchor latency"
          value={latencies.length ? latencies[Math.floor(latencies.length / 2)] : null}
          format={(n) => `${Math.round(n)} ms`}
          icon={Timer}
          hint="seal → confirmed receipt"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_30rem]">
        <Panel title="Anchored batches" description="Select a batch to compare the vault record with the contract." bodyClassName="px-0 pb-0">
          {!data && !error ? (
            <div className="px-5 pb-5">
              <LoadingRows rows={4} />
            </div>
          ) : batches.length === 0 ? (
            <EmptyState icon={Blocks} title="No batches yet" hint="Stream traffic on the dashboard to ingest and anchor events." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="pl-5">Batch</TableHead>
                  <TableHead>Seq range</TableHead>
                  <TableHead>Merkle root</TableHead>
                  <TableHead>Block</TableHead>
                  <TableHead>Gas</TableHead>
                  <TableHead className="pr-5">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => (
                  <TableRow
                    key={b.batch_id}
                    onClick={() => setSelected(b.batch_id)}
                    className={cn("cursor-pointer border-border/50 transition-colors", active === b.batch_id ? "bg-primary/10 hover:bg-primary/10" : "hover:bg-foreground/[0.03]")}
                  >
                    <TableCell className="pl-5 font-hash">#{b.batch_id}</TableCell>
                    <TableCell className="font-hash text-xs">
                      {b.first_seq}–{b.last_seq} <span className="text-muted-foreground">({b.event_count})</span>
                    </TableCell>
                    <TableCell>
                      <HashChip value={b.merkle_root} n={6} />
                    </TableCell>
                    <TableCell className="font-hash text-xs">{b.block_number ?? "—"}</TableCell>
                    <TableCell className="font-hash text-xs">{b.gas_used?.toLocaleString() ?? "—"}</TableCell>
                    <TableCell className="pr-5">
                      <span
                        className={cn(
                          "inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
                          b.status === "anchored" ? "border-ok/30 bg-ok/10 text-ok" : "border-bad/30 bg-bad/10 text-bad",
                        )}
                      >
                        {b.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
        {active !== null && <BatchPanel key={active} id={active} rpcUrl={status.data?.chain.rpc_url} contract={data?.deployment?.contract_address} />}
      </div>
    </div>
  );
}

function BatchPanel({ id, rpcUrl, contract }: { id: number; rpcUrl?: string; contract?: string }) {
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [direct, setDirect] = useState<ChainBatch | null | "error">(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api<BatchDetail>(`/api/batches/${id}`).then((d) => live && setDetail(d)).catch((e) => live && setErr(String(e.message ?? e)));
    if (rpcUrl && contract) {
      readBatch(rpcUrl, contract, id)
        .then((c) => live && setDirect(c))
        .catch(() => live && setDirect("error"));
    }
    return () => {
      live = false;
    };
  }, [id, rpcUrl, contract]);

  const b = detail?.batch;
  const oc = detail?.onchain && !("error" in detail.onchain) ? detail.onchain : null;
  const directOk = direct && direct !== "error" ? direct : null;
  const rows: [string, string | number | null | undefined, string | number | null | undefined][] = b
    ? [
        ["Merkle root", b.merkle_root, directOk?.merkle_root],
        ["Chain head", b.chain_head, directOk?.chain_head],
        ["Manifest hash", b.manifest_hash, directOk?.manifest_hash],
        ["First seq", b.first_seq, directOk?.first_seq],
        ["Last seq", b.last_seq, directOk?.last_seq],
        ["Event count", b.event_count, directOk?.event_count],
      ]
    : [];
  const same = (v: unknown, c: unknown) => c !== undefined && String(v).toLowerCase() === String(c).toLowerCase();
  const matching = rows.filter(([, v, c]) => same(v, c)).length;

  return (
    <Panel title={`Batch #${id}`} description="Vault record vs. the contract, read directly from the chain by your browser." className="h-fit xl:sticky xl:top-20" bodyClassName="space-y-4 text-sm">
      {err && (
        <AlertBanner tone="danger" title="Could not load this batch">
          {err}
        </AlertBanner>
      )}
      {!b && !err && <LoadingRows rows={4} />}
      {b && (
        <>
          {directOk && (
            <AlertBanner tone={matching === rows.length ? "success" : "danger"} title={matching === rows.length ? "Vault record matches the contract" : "Vault record differs from the contract"}>
              {matching}/{rows.length} fields equal the values your browser read from the chain.
            </AlertBanner>
          )}
          {direct === "error" && (
            <AlertBanner tone="warn" title="The browser could not reach the RPC endpoint directly">
              Only the vault values are shown.
            </AlertBanner>
          )}
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Field</th>
                  <th className="px-3 py-2 font-medium">Vault</th>
                  <th className="px-3 py-2 font-medium">On-chain</th>
                  <th className="w-6" />
                </tr>
              </thead>
              <tbody>
                {rows.map(([k, vault, chain]) => {
                  const tone = chain === undefined ? undefined : same(vault, chain) ? "ok" : "bad";
                  return (
                    <tr key={k} className="border-t border-border/50">
                      <td className="px-3 py-1.5 text-muted-foreground">{k}</td>
                      <td className="px-3 py-1.5">{typeof vault === "string" ? <HashChip value={vault} n={5} tone={tone} /> : <span className="font-hash">{vault}</span>}</td>
                      <td className="px-3 py-1.5">{typeof chain === "string" ? <HashChip value={chain} n={5} tone={tone} /> : <span className="font-hash">{chain ?? "—"}</span>}</td>
                      <td className="pr-2">{tone === "ok" ? <CheckCircle2 className="size-4 text-ok" /> : tone === "bad" ? <XCircle className="size-4 text-bad" /> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="grid gap-y-1.5 rounded-xl border bg-card/40 p-3 text-xs">
            <KV k="Transaction" v={<HashChip value={b.tx_hash} n={8} />} />
            <KV k="Block" v={<span className="font-hash">{b.block_number ?? "—"}</span>} />
            <KV k="Block time" v={b.block_timestamp ? new Date(b.block_timestamp * 1000).toLocaleString() : "—"} />
            <KV k="Gas used" v={<span className="font-hash">{b.gas_used?.toLocaleString() ?? "—"}</span>} />
            <KV k="Anchor latency" v={b.anchor_latency_ms !== null ? `${b.anchor_latency_ms} ms` : "—"} />
            <KV k="Sealed" v={fmtTime(b.sealed_at)} />
            <KV k="Submitter" v={<HashChip value={oc?.submitter} n={6} />} />
            <KV
              k="Receipt"
              v={
                detail?.receipt ? (
                  <span className={detail.receipt.status === 1 ? "text-ok" : "text-bad"}>
                    status {detail.receipt.status} · {detail.receipt.logs} log(s)
                  </span>
                ) : (
                  "—"
                )
              }
            />
            <KV k="Previous chain head" v={<HashChip value={b.prev_chain_head} n={6} />} />
          </div>
          {b.error && (
            <AlertBanner tone="danger" title="Anchoring error">
              {b.error}
            </AlertBanner>
          )}
        </>
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
