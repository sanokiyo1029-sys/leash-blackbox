"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EvidenceDetail } from "@/components/evidence-detail";
import { AlertBanner, EmptyState, LoadingRows, PageTitle } from "@/components/kit";
import { ProtectionBadge, SeverityDot, StatusBadge } from "@/components/status";
import { useApi } from "@/lib/api";
import { stagger } from "@/lib/motion";
import type { EventItem, Status } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS = ["ALL", "INTACT", "MODIFIED", "DELETED", "INJECTED"] as const;
const PAGE = 40;

export default function EvidenceExplorer() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const status = useApi<Status>("/api/status");
  const path = `/api/events?limit=1000${filter === "ALL" ? "" : `&status=${filter}`}`;
  const { data, error, loading } = useApi<{ total: number; items: EventItem[] }>(path, 6000);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = data?.items ?? [];
    if (!q) return items;
    return items.filter((i) => JSON.stringify(i.host_record ?? i.record ?? {}).toLowerCase().includes(q) || String(i.seq) === q);
  }, [data, query]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const visible = rows.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <div className="space-y-4">
      <PageTitle
        eyebrow="Evidence"
        title="Evidence Explorer"
        description="Every sequence number the collector received or the host holds. Select a record to see its SHA-256 leaf, Merkle proof and on-chain commitment, then verify it yourself."
      />
      {error && <AlertBanner tone="danger" title="Could not load events">{error}</AlertBanner>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="surface flex max-w-full flex-wrap rounded-sm p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => {
                setFilter(f);
                setPage(0);
              }}
              className={cn("relative px-2.5 py-1.5 text-xs font-semibold transition-colors", filter === f ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {filter === f && <motion.span layoutId="ev-filter" className="absolute inset-0 bg-primary" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
              <span className="relative">{f}</span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search message, actor, IP, seq…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            className="pl-8"
          />
        </div>
      </div>

      <div className={cn("grid gap-4", selected !== null && "xl:grid-cols-[minmax(0,1fr)_30rem]")}>
        <div className="surface overflow-hidden rounded-2xl">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b text-left text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
                <tr>
                  <th className="w-16 px-4 py-3 font-medium">Seq</th>
                  <th className="w-28 px-2 py-3 font-medium">Status</th>
                  <th className="w-40 px-2 py-3 font-medium">Time</th>
                  <th className="w-24 px-2 py-3 font-medium">Source</th>
                  <th className="px-2 py-3 font-medium">Message</th>
                  <th className="w-28 px-4 py-3 font-medium">Protection</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item, i) => {
                  const r = item.status === "DELETED" ? item.record : (item.host_record ?? item.record);
                  return (
                    <motion.tr
                      key={`${item.seq}-${item.status}`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={stagger(i, 0.012, 0.25)}
                      onClick={() => setSelected(item.seq)}
                      tabIndex={0}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelected(item.seq)}
                      aria-selected={selected === item.seq}
                      className={cn(
                        "cursor-pointer border-b border-border/50 outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/50",
                        selected === item.seq && "bg-primary/10 hover:bg-primary/10",
                      )}
                    >
                      <td className="px-4 py-2.5 font-hash text-xs">{item.seq}</td>
                      <td className="px-2 py-2.5">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="px-2 py-2.5 font-hash text-[11px] text-muted-foreground">{r?.ts?.replace("T", " ").slice(0, 19)}</td>
                      <td className="px-2 py-2.5 text-xs">
                        <span className="inline-flex items-center gap-1.5">
                          <SeverityDot severity={r?.severity} /> {r?.source}
                        </span>
                      </td>
                      <td className={cn("max-w-0 truncate px-2 py-2.5 text-xs", item.status === "DELETED" && "text-bad/90 line-through decoration-bad/50")}>{r?.msg}</td>
                      <td className="px-4 py-2.5">
                        <ProtectionBadge protection={item.protection} />
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {loading && !data && (
            <div className="p-4">
              <LoadingRows rows={8} />
            </div>
          )}
          {data && visible.length === 0 && <EmptyState title="No records match" hint="Try another filter or search term." />}
          <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
            <span>
              <span className="tabular">{rows.length}</span> records · page {page + 1} of {pages}
            </span>
            <div className="flex gap-1">
              <Button size="icon-sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                <ChevronLeft />
              </Button>
              <Button size="icon-sm" variant="ghost" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                <ChevronRight />
              </Button>
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {selected !== null && (
            <EvidenceDetail
              key={selected}
              seq={selected}
              rpcUrl={status.data?.chain.rpc_url}
              contract={status.data?.deployment?.contract_address}
              onClose={() => setSelected(null)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
