"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, Search, ShieldX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorNote, Hash, PageHeader, ProtectionBadge, SeverityDot, StatusBadge } from "@/components/status";
import { api, useApi } from "@/lib/api";
import type { BatchReport, EventItem, EventRecord } from "@/lib/types";
import { leafHash, rootFromProof, type ProofStep } from "@/lib/verify";
import { cn } from "@/lib/utils";

const FILTERS = ["ALL", "INTACT", "MODIFIED", "DELETED", "INJECTED"] as const;
const PAGE = 50;

export default function EvidenceExplorer() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const path = `/api/events?limit=1000${filter === "ALL" ? "" : `&status=${filter}`}`;
  const { data, error, loading } = useApi<{ total: number; items: EventItem[] }>(path, 6000);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = data?.items ?? [];
    if (!q) return items;
    return items.filter((i) => {
      const r = i.host_record ?? i.record;
      return JSON.stringify(r ?? {}).toLowerCase().includes(q) || String(i.seq) === q;
    });
  }, [data, query]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const visible = rows.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Evidence Explorer"
        description="Every sequence number seen by the collector or present on the host. Status compares the host's current record with the vault copy whose batch root is verified on-chain. Deleted records are recovered from the vault."
      />
      <ErrorNote error={error} />
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onClick={() => {
              setFilter(f);
              setPage(0);
            }}
          >
            {f}
          </Button>
        ))}
        <div className="relative ml-auto w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search message, actor, IP, seq…" value={query} onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }} className="pl-8" />
        </div>
      </div>

      <div className={cn("grid gap-4", selected !== null && "xl:grid-cols-[1fr_28rem]")}>
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Seq</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-44">Time</TableHead>
                <TableHead className="w-24">Source</TableHead>
                <TableHead>Message</TableHead>
                <TableHead className="w-28">Protection</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && !data && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto animate-spin" />
                  </TableCell>
                </TableRow>
              )}
              {visible.map((item) => {
                const r = item.status === "DELETED" ? item.record : item.host_record ?? item.record;
                return (
                  <TableRow
                    key={`${item.seq}-${item.status}`}
                    onClick={() => setSelected(item.seq)}
                    className={cn("cursor-pointer", selected === item.seq && "bg-muted/60", item.status === "DELETED" && "opacity-80")}
                  >
                    <TableCell className="font-hash text-xs">{item.seq}</TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r?.ts?.replace("T", " ").replace("Z", "")}</TableCell>
                    <TableCell className="text-xs">
                      <span className="inline-flex items-center gap-1.5">
                        <SeverityDot severity={r?.severity} /> {r?.source}
                      </span>
                    </TableCell>
                    <TableCell className={cn("max-w-0 truncate text-xs", item.status === "DELETED" && "line-through decoration-bad/60")}>{r?.msg}</TableCell>
                    <TableCell>
                      <ProtectionBadge protection={item.protection} />
                    </TableCell>
                  </TableRow>
                );
              })}
              {data && visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No records match.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
            <span>
              {rows.length} records · page {page + 1} of {pages}
            </span>
            <div className="flex gap-1">
              <Button size="icon-sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft />
              </Button>
              <Button size="icon-sm" variant="ghost" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight />
              </Button>
            </div>
          </div>
        </Card>
        {selected !== null && <EventDetail key={selected} seq={selected} onClose={() => setSelected(null)} />}
      </div>
    </div>
  );
}

interface Detail {
  records: EventItem[];
  proof: { seq: number; batch_id: number; leaf_index: number; record: EventRecord; proof: ProofStep[] } | null;
  batch: BatchReport | null;
}

function EventDetail({ seq, onClose }: { seq: number; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [check, setCheck] = useState<{ leaf: string; root: string; ok: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    api<Detail>(`/api/events/${seq}`)
      .then(async (d) => {
        if (!live) return;
        setDetail(d);
        const onchainRoot = d.batch?.onchain?.merkle_root;
        if (d.proof && onchainRoot) {
          const leaf = await leafHash(d.proof.record);
          const root = await rootFromProof(leaf, d.proof.proof);
          if (live) setCheck({ leaf, root, ok: root === onchainRoot });
        }
      })
      .catch((e) => live && setErr(String(e.message ?? e)));
    return () => {
      live = false;
    };
  }, [seq]);

  const main = detail?.records[0];
  return (
    <Card className="h-fit xl:sticky xl:top-20">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          Seq {seq} {main && <StatusBadge status={main.status} />}
        </CardTitle>
        <Button size="icon-sm" variant="ghost" onClick={onClose}>
          <X />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <ErrorNote error={err} />
        {!detail && !err && <Loader2 className="animate-spin text-muted-foreground" />}
        {main && (
          <>
            {main.status === "MODIFIED" && main.diff && (
              <Section title="What the attacker changed">
                <div className="space-y-2">
                  {Object.entries(main.diff).map(([field, d]) => (
                    <div key={field} className="rounded-md border bg-muted/30 p-2 text-xs">
                      <div className="mb-1 font-semibold text-muted-foreground">{field}</div>
                      <div className="text-ok">− anchored: {JSON.stringify(d.expected)}</div>
                      <div className="text-bad">+ on host: {JSON.stringify(d.found)}</div>
                    </div>
                  ))}
                </div>
              </Section>
            )}
            {main.status === "DELETED" && (
              <div className="rounded-md border border-bad/30 bg-bad/10 p-3 text-xs text-bad">
                This record was erased from the host. The original below was recovered from the evidence vault and is proven by the on-chain root.
              </div>
            )}
            {main.status === "INJECTED" && (
              <div className="rounded-md border border-chart-5/40 bg-chart-5/10 p-3 text-xs text-chart-5">
                No collector or on-chain commitment exists for this record. It was fabricated on the host.
              </div>
            )}
            <Section title={main.status === "INJECTED" ? "Host record" : "Anchored original"}>
              <RecordView record={main.status === "INJECTED" ? main.host_record : main.record} />
            </Section>
            <Section title="Hashes">
              <KV k="Anchored leaf" v={<Hash value={main.leaf_hash} />} />
              <KV k="Host leaf" v={<Hash value={main.host_leaf_hash} />} />
              <KV k="Batch" v={main.batch_id ?? "—"} />
              <KV k="On-chain root" v={<Hash value={detail?.batch?.onchain?.merkle_root} />} />
            </Section>
            {detail?.proof && (
              <Section title={`Merkle inclusion proof (${detail.proof.proof.length} steps)`}>
                <ol className="space-y-1 text-xs">
                  {detail.proof.proof.map((s, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="w-6 text-muted-foreground">{i + 1}.</span>
                      <span className="w-14 text-muted-foreground">{s.side === "L" ? "left" : "right"}</span>
                      <Hash value={s.hash} n={10} />
                    </li>
                  ))}
                </ol>
                {check && (
                  <div className={cn("mt-3 flex items-center gap-2 rounded-md border p-2 text-xs", check.ok ? "border-ok/30 bg-ok/10 text-ok" : "border-bad/30 bg-bad/10 text-bad")}>
                    {check.ok ? <CheckCircle2 className="size-4" /> : <ShieldX className="size-4" />}
                    {check.ok
                      ? "Recomputed in your browser (WebCrypto SHA-256): the anchored original hashes to the on-chain root."
                      : "Browser recomputation does not match the on-chain root."}
                  </div>
                )}
              </Section>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{title}</div>
      {children}
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5 text-xs">
      <span className="text-muted-foreground">{k}</span>
      <span>{v}</span>
    </div>
  );
}

function RecordView({ record }: { record: EventRecord | null | undefined }) {
  if (!record) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-xs">
      <KV k="Time" v={record.ts} />
      <KV k="Source / type" v={`${record.source} / ${record.type}`} />
      <KV k="Severity" v={record.severity} />
      <KV k="Actor" v={record.actor} />
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
