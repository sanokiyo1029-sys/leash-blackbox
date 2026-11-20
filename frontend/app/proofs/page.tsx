"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, ShieldX, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorNote, Hash, PageHeader } from "@/components/status";
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Blockchain Proof Explorer"
        description="Each batch commits a Merkle root, a hash-chain head and a manifest hash to the LeashAnchor contract. The contract has no update or delete function and enforces contiguous sequence ranges."
      />
      <ErrorNote error={error} />
      <div className="grid gap-4 xl:grid-cols-[1fr_30rem]">
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch</TableHead>
                <TableHead>Seq range</TableHead>
                <TableHead>Merkle root</TableHead>
                <TableHead>Block</TableHead>
                <TableHead>Gas</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => (
                <TableRow key={b.batch_id} onClick={() => setSelected(b.batch_id)} className={cn("cursor-pointer", active === b.batch_id && "bg-muted/60")}>
                  <TableCell className="font-hash">#{b.batch_id}</TableCell>
                  <TableCell className="font-hash text-xs">
                    {b.first_seq}–{b.last_seq} <span className="text-muted-foreground">({b.event_count})</span>
                  </TableCell>
                  <TableCell>
                    <Hash value={b.merkle_root} n={6} />
                  </TableCell>
                  <TableCell className="font-hash text-xs">{b.block_number ?? "—"}</TableCell>
                  <TableCell className="font-hash text-xs">{b.gas_used?.toLocaleString() ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={b.status === "anchored" ? "secondary" : "destructive"}>{b.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {data && batches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No batches yet. Generate traffic on the dashboard.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
        {active !== null && (
          <BatchPanel
            key={active}
            id={active}
            rpcUrl={status.data?.chain.rpc_url}
            contract={data?.deployment?.contract_address}
          />
        )}
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

  return (
    <Card className="h-fit xl:sticky xl:top-20">
      <CardHeader>
        <CardTitle>Batch #{id}</CardTitle>
        <CardDescription>Vault record vs. the contract, read directly from the chain by your browser.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <ErrorNote error={err} />
        {!b && !err && <Loader2 className="animate-spin text-muted-foreground" />}
        {b && (
          <>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Field</th>
                    <th className="px-3 py-2 text-left font-medium">Vault</th>
                    <th className="px-3 py-2 text-left font-medium">On-chain</th>
                    <th className="w-6" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([k, vault, chain]) => {
                    const match = chain !== undefined && String(vault).toLowerCase() === String(chain).toLowerCase();
                    return (
                      <tr key={k} className="border-t">
                        <td className="px-3 py-1.5 text-muted-foreground">{k}</td>
                        <td className="px-3 py-1.5">{typeof vault === "string" ? <Hash value={vault} n={5} /> : vault}</td>
                        <td className="px-3 py-1.5">{typeof chain === "string" ? <Hash value={chain} n={5} /> : chain ?? "—"}</td>
                        <td className="pr-2">
                          {chain === undefined ? null : match ? <CheckCircle2 className="size-4 text-ok" /> : <XCircle className="size-4 text-bad" />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {direct === "error" && (
              <div className="flex items-center gap-2 text-xs text-warn">
                <ShieldX className="size-4" /> The browser could not reach the RPC endpoint directly. Values shown come from the backend.
              </div>
            )}
            <div className="space-y-1.5 text-xs">
              <KV k="Transaction" v={<Hash value={b.tx_hash} n={8} />} />
              <KV k="Block" v={b.block_number ?? "—"} />
              <KV k="Block time" v={b.block_timestamp ? new Date(b.block_timestamp * 1000).toLocaleString() : "—"} />
              <KV k="Gas used" v={b.gas_used?.toLocaleString() ?? "—"} />
              <KV k="Anchor latency" v={b.anchor_latency_ms !== null ? `${b.anchor_latency_ms} ms` : "—"} />
              <KV k="Sealed" v={fmtTime(b.sealed_at)} />
              <KV k="Submitter" v={<Hash value={oc?.submitter} n={6} />} />
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
              <KV k="Previous chain head" v={<Hash value={b.prev_chain_head} n={6} />} />
            </div>
            {b.error && <ErrorNote error={b.error} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
