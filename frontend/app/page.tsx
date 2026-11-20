"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { ArrowRight, ArrowUpRight, RefreshCw } from "lucide-react";
import { HoldButton } from "@/components/dashboard/hold-button";
import { IntegritySeal, TICK_META, type SealRecord, type TickStatus } from "@/components/dashboard/integrity-seal";
import { AnimatedNumber, HashChip } from "@/components/kit";
import { api, fmtTime, useAction, useApi } from "@/lib/api";
import { dur, ease } from "@/lib/motion";
import type { Batch, EventItem, Status, VerificationReport } from "@/lib/types";
import { cn } from "@/lib/utils";

type View = "loading" | "error" | "empty" | "unverified" | "clean" | "tampered" | "inconclusive";

const VERDICT_COPY: Record<View, { word: string; line: string }> = {
  loading: { word: "…", line: "Connecting to the evidence pipeline and the chain." },
  error: { word: "Offline", line: "The backend is not answering, so nothing can be verified right now." },
  empty: { word: "No evidence", line: "No security events have been collected yet." },
  unverified: { word: "Not verified", line: "Evidence is collected and anchored, but nobody has checked the host against it yet." },
  clean: { word: "Clean", line: "Host logs match the on-chain proof." },
  tampered: { word: "Tampered", line: "The host's logs no longer match what was committed on-chain." },
  inconclusive: { word: "Inconclusive", line: "The chain could not be reached, so the host was not attested." },
};

export default function Dashboard() {
  const status = useApi<Status>("/api/status", 4000);
  const events = useApi<{ items: EventItem[] }>("/api/events?limit=1000&order=asc", 5000);
  const batches = useApi<{ batches: Batch[] }>("/api/batches", 6000);
  const lastId = status.data?.last_verification?.run_id ?? null;
  const report = useApi<VerificationReport>(lastId ? `/api/verify/runs/${lastId}` : null);
  const action = useAction();
  const reduce = useReducedMotion();
  const [op, setOp] = useState<{ kind: "verify" | "traffic" | "seal"; runId?: number; note: string } | null>(null);
  const [bloom, setBloom] = useState(0);

  const s = status.data;
  const last = s?.last_verification ?? null;
  const items = useMemo(() => events.data?.items ?? [], [events.data]);

  const view: View = !s ? (status.error ? "error" : "loading") : s.counts.vault_events + s.counts.host_events === 0 ? "empty" : !last ? "unverified" : last.verdict === "CLEAN" ? "clean" : last.verdict === "TAMPERING_DETECTED" ? "tampered" : "inconclusive";

  // Only trust the report of the run the status names (a stale report must never colour the seal).
  const rep = report.data && last && report.data.run_id === last.run_id ? report.data : null;
  const sum = last?.summary ?? null;

  // Ticks: status only from that run; anything that arrived later is "not verified yet".
  const { records, newSince } = useMemo(() => {
    const findings = new Map((rep?.findings ?? []).map((f) => [f.seq, f.status as TickStatus]));
    const coveredVault = sum ? sum.intact + sum.modified + sum.deleted : 0;
    const out: SealRecord[] = items.map((i) => {
      const rec = i.status === "DELETED" ? i.record : (i.host_record ?? i.record);
      let st: TickStatus = "UNVERIFIED";
      if (rep) st = findings.get(i.seq) ?? (i.record && i.seq <= coveredVault ? "INTACT" : "UNVERIFIED");
      return { seq: i.seq, status: st, msg: rec?.msg, source: rec?.source };
    });
    return { records: out, newSince: sum ? items.filter((i) => i.record && i.seq > coveredVault).length : 0 };
  }, [items, rep, sum]);
  // Counts come from the run summary, so the numbers always match the verdict that produced them.
  const counts: Record<TickStatus, number> = sum
    ? { INTACT: sum.intact, MODIFIED: sum.modified, DELETED: sum.deleted, INJECTED: sum.injected, UNVERIFIED: newSince }
    : { INTACT: 0, MODIFIED: 0, DELETED: 0, INJECTED: 0, UNVERIFIED: records.length };

  const reloadAll = () => Promise.all([status.reload(), events.reload(), batches.reload()]);

  const verify = async () => {
    const before = last?.verdict ?? null;
    const r = await action.run("verify", () => api<VerificationReport>("/api/verify", { method: "POST" }));
    if (!r) return;
    await reloadAll();
    setOp({ kind: "verify", runId: r.run_id, note: `Run #${r.run_id} finished in ${r.duration_ms} ms · chain attestation ${r.chain_attestation.replace("_", " ")}` });
    if (r.verdict === "TAMPERING_DETECTED" && before !== "TAMPERING_DETECTED" && !reduce) setBloom((b) => b + 1);
  };
  const stream = async () => {
    const r = await action.run("traffic", () =>
      api<{ ingested: number; batches: Batch[]; anchor_error: string | null }>("/api/simulate/traffic", { method: "POST", json: { count: 60, include_intrusion: false } }),
    );
    if (!r) return;
    await reloadAll();
    setOp({ kind: "traffic", note: r.anchor_error ? `Collected ${r.ingested} events · anchoring failed: ${r.anchor_error}` : `Collected ${r.ingested} events · ${r.batches.length} batch anchored · not verified yet` });
  };

  const red = view === "tampered";
  const amber = view === "inconclusive";
  const ink = view === "error";
  const copy = VERDICT_COPY[view];
  const diverging = counts.MODIFIED + counts.DELETED + counts.INJECTED;
  const opFresh = op?.kind === "verify" && op.runId === last?.run_id;

  return (
    <div className="dash">
      {/* ---------------------------------------------------------------- verdict scene */}
      <section
        aria-labelledby="verdict"
        className={cn(
          "relative isolate overflow-hidden transition-colors duration-500",
          red ? "on-red bg-[var(--d-red)] text-white" : amber ? "bg-[var(--d-amber-field)]" : ink ? "on-red bg-[var(--d-ink)] text-white" : "grain bg-[var(--d-field)]",
        )}
      >
        <AnimatePresence>
          {bloom > 0 && (
            <motion.div
              key={bloom}
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 bg-[var(--d-red)]"
              initial={{ clipPath: "circle(0% at 72% 50%)" }}
              animate={{ clipPath: "circle(150% at 72% 50%)" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: ease.out }}
              onAnimationComplete={() => setBloom(0)}
            />
          )}
        </AnimatePresence>

        <div className="mx-auto grid w-full max-w-[1320px] items-center gap-8 px-[clamp(20px,4vw,56px)] pt-8 pb-14 lg:min-h-[calc(100svh-56px-64px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:gap-12 lg:py-10">
          <div className="min-w-0">
            <div className="label opacity-80">Security dashboard · web-prod-01</div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.h1
                key={copy.word}
                id="verdict"
                initial={{ y: "0.35em", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "-0.25em", opacity: 0 }}
                transition={{ duration: dur.base, ease: ease.out }}
                className="mt-3 font-display text-[clamp(44px,8vw,96px)] leading-[0.92] font-black tracking-[-0.02em] uppercase"
              >
                {copy.word}
              </motion.h1>
            </AnimatePresence>
            <p className={cn("mt-4 max-w-[34ch] text-[clamp(16px,1.6vw,20px)] leading-snug", red || ink ? "text-white/90" : "text-[var(--d-ink)]/80")}>{copy.line}</p>

            {/* Caption card: the facts behind the verdict, tied to the run that produced it */}
            <div className={cn("caption mt-6 max-w-md px-4 py-3 text-[13px] text-[var(--d-ink)]")} aria-live="polite">
              {last ? (
                <>
                  <div className="label flex flex-wrap items-center gap-x-2 !text-[10.5px]">
                    <span>Run #{last.run_id}</span>
                    <span aria-hidden>·</span>
                    <span>{fmtTime(last.verified_at)}</span>
                    <span aria-hidden>·</span>
                    <span>{last.duration_ms} ms</span>
                    {opFresh && <span className="rounded-[2px] bg-[var(--d-ink)] px-1.5 text-white">from this dashboard</span>}
                  </div>
                  <div className="mt-1.5 leading-relaxed">
                    {last.summary.first_divergent_seq !== null ? (
                      <>
                        {diverging} record{diverging === 1 ? "" : "s"} diverge · first at seq <span className="font-hash">{last.summary.first_divergent_seq}</span>.{" "}
                        <Link href="/evidence" className="underline underline-offset-2">See the evidence</Link>
                      </>
                    ) : (
                      <>All committed records were recomputed and matched the anchored Merkle roots.</>
                    )}
                    {newSince > 0 && <> {newSince} newer record{newSince === 1 ? " is" : "s are"} not verified yet.</>}
                  </div>
                </>
              ) : view === "error" ? (
                <div className="flex items-center justify-between gap-3">
                  <span>{status.error}</span>
                  <button className="btn-caption" onClick={() => status.reload()}>
                    <RefreshCw className="size-3.5" /> Retry
                  </button>
                </div>
              ) : view === "empty" ? (
                <div>Stream some traffic to collect, hash and anchor events.</div>
              ) : view === "loading" ? (
                <div className="opacity-70">Reading status…</div>
              ) : (
                <div>{s?.counts.anchored_events ?? 0} records anchored. Hold to verify the host against them.</div>
              )}
              {op && op.kind !== "verify" && <div className="mt-2 border-t border-[var(--d-ink)]/15 pt-2 text-[12px]">{op.note}</div>}
              {op?.kind === "verify" && opFresh && <div className="mt-2 border-t border-[var(--d-ink)]/15 pt-2 text-[12px]">{op.note}</div>}
              {action.error && <div className="mt-2 border-t border-[var(--d-red)]/30 pt-2 text-[12px] text-[var(--d-red)]">Action failed: {action.error}</div>}
            </div>

            {/* Actions */}
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <HoldButton label="verify" tone={red || ink ? "white" : "ink"} busy={action.busy === "verify"} disabled={!s || view === "empty" || !!action.busy} onComplete={verify} />
              <div className="flex flex-col gap-2">
                <button className="btn-caption solid" onClick={verify} disabled={!s || view === "empty" || !!action.busy}>
                  Verify now
                </button>
                <button className="btn-caption" onClick={stream} disabled={!s || !!action.busy}>
                  {action.busy === "traffic" ? "Streaming…" : "Stream traffic"}
                </button>
              </div>
            </div>
          </div>

          {/* The seal */}
          <div className="min-w-0">
            <IntegritySeal
              records={records}
              loading={view === "loading" || (events.loading && !events.data)}
              tone={red ? "red" : view === "clean" ? "ink" : "muted"}
              centerTop={view === "tampered" ? <AnimatedNumber value={diverging} /> : view === "clean" ? <AnimatedNumber value={counts.INTACT} /> : <AnimatedNumber value={records.length} />}
              centerBottom={view === "tampered" ? "records diverge" : view === "clean" ? `intact · of ${records.length}` : view === "empty" ? "records" : "records · unchecked"}
            />
            <ul className={cn("mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-3", red || ink ? "text-white" : "")} aria-label="Legend">
              {(["INTACT", "MODIFIED", "DELETED", "INJECTED", "UNVERIFIED"] as TickStatus[])
                .filter((k) => k === "INTACT" || counts[k] > 0 || (k !== "UNVERIFIED" && !!last))
                .map((k) => (
                  <li key={k} className="tabular flex items-center gap-2" title={TICK_META[k].legend}>
                    <LegendMark status={k} onRed={red || ink} />
                    {`${counts[k]} ${TICK_META[k].label}`}
                  </li>
                ))}
            </ul>
          </div>
        </div>

        {/* Peek of the next scene */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3 bg-[var(--d-ink)]" aria-hidden />
      </section>

      <LifecycleBand s={s} />
      <ActivityBand items={items} report={rep} lastRun={last?.run_id ?? null} />
      <LedgerBand batches={batches.data?.batches ?? []} s={s} />

      <RevealBand className="bg-[var(--d-red)] text-white on-red">
        <div className="mx-auto flex w-full max-w-[1320px] flex-wrap items-end justify-between gap-6 px-[clamp(20px,4vw,56px)] py-14">
          <div>
            <div className="label opacity-85">Next</div>
            <div className="mt-2 font-display text-[clamp(32px,4.5vw,56px)] leading-none font-black uppercase">Now break it.</div>
            <p className="mt-3 max-w-[48ch] text-white/90">Take root on web-prod-01, erase the trail, then verify. The chain-backed record shows exactly what changed.</p>
          </div>
          <Link href="/attack" className="btn-caption !min-h-12 !px-5 !text-[13px]">
            Open the attack lab <ArrowRight className="size-4" />
          </Link>
        </div>
      </RevealBand>
    </div>
  );
}

function LegendMark({ status, onRed }: { status: TickStatus; onRed: boolean }) {
  const color = TICK_META[status].color;
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden className="shrink-0">
      <rect x="0" y="0" width="18" height="14" rx="2" fill={onRed ? "#fff" : "transparent"} />
      {status === "DELETED" ? (
        <line x1="9" y1="2" x2="9" y2="12" stroke={color} strokeWidth="2.4" strokeDasharray="3 2" />
      ) : status === "INJECTED" ? (
        <line x1="9" y1="5" x2="9" y2="12" stroke={color} strokeWidth="3" strokeLinecap="round" />
      ) : (
        <>
          <line x1="9" y1="2" x2="9" y2="12" stroke={color} strokeWidth="3" strokeLinecap="round" />
          {status === "MODIFIED" && <circle cx="14" cy="10" r="2" fill={color} stroke="#111" strokeWidth=".6" />}
        </>
      )}
    </svg>
  );
}

/** A full-width band that uncovers bottom→top the first time it scrolls into view (reference: scene wipe-up).
 *  The clip lives in CSS (.reveal), so server and client render the same markup and reduced motion skips it. */
function RevealBand({ children, className, ariaLabel }: { children: React.ReactNode; className?: string; ariaLabel?: string }) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -15% 0px" });
  return (
    <section ref={ref} aria-label={ariaLabel} className={cn("reveal relative", inView && "in", className)}>
      {children}
    </section>
  );
}

function LifecycleBand({ s }: { s: Status | undefined | null }) {
  const host = s?.counts.host_events ?? null;
  const vault = s?.counts.vault_events ?? null;
  const anchored = s?.counts.anchored_events ?? null;
  const gap = host !== null && vault !== null ? host - vault : 0;
  const stations = [
    {
      k: "Host log store",
      sub: "what the server says happened",
      v: host,
      note: gap === 0 ? "untrusted by design" : gap < 0 ? `${-gap} fewer lines than the vault received` : `${gap} more lines than the vault received`,
      bad: gap !== 0,
    },
    { k: "Evidence vault", sub: "copied off the host at ingest", v: vault, note: "append-only · outside the host", bad: false },
    {
      k: "Blockchain",
      sub: "Merkle roots anchored on-chain",
      v: anchored,
      note: s ? `${s.counts.anchored_batches} batch${s.counts.anchored_batches === 1 ? "" : "es"} · ${s.counts.unanchored_events} pending · block ${s.chain.latest_block ?? "—"}` : "—",
      bad: false,
    },
  ];
  return (
    <RevealBand className="bg-[var(--d-ink)] text-white on-red" ariaLabel="Evidence lifecycle">
      <div className="mx-auto w-full max-w-[1320px] px-[clamp(20px,4vw,56px)] py-12 lg:py-16">
        <div className="label opacity-70">Evidence lifecycle</div>
        <h2 className="mt-2 font-display text-[clamp(28px,3.4vw,40px)] leading-none font-black uppercase">Three copies, one truth</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3 md:gap-0">
          {stations.map((st, i) => (
            <li key={st.k} className="relative md:pr-10">
              {i < 2 && (
                <span className="absolute top-[22px] right-3 left-[46%] hidden h-px bg-white/30 md:block" aria-hidden>
                  <ArrowRight className="absolute -top-[7px] -right-1 size-3.5 text-white/60" />
                </span>
              )}
              <div className="label !text-[10.5px] opacity-70">
                {String(i + 1).padStart(2, "0")} · {st.k}
              </div>
              <div className={cn("mt-1 font-display text-[clamp(40px,5vw,64px)] leading-none font-black tabular", st.bad && "text-[#ff6b6b]")}>
                <AnimatedNumber value={st.v} />
              </div>
              <div className="mt-2 text-sm text-white/80">{st.sub}</div>
              <div className={cn("mt-1 text-[12px]", st.bad ? "text-[#ff8a8a]" : "text-white/55")}>{st.note}</div>
            </li>
          ))}
        </ol>
      </div>
    </RevealBand>
  );
}

function ActivityBand({ items, report, lastRun }: { items: EventItem[]; report: VerificationReport | null; lastRun: number | null }) {
  const latest = useMemo(() => [...items].sort((a, b) => b.seq - a.seq).slice(0, 8), [items]);
  const findings = (report?.findings ?? []).slice(0, 6);
  return (
    <RevealBand className="bg-white" ariaLabel="Live activity">
      <div className="mx-auto grid w-full max-w-[1320px] gap-10 px-[clamp(20px,4vw,56px)] py-12 lg:grid-cols-2 lg:py-16">
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="label">Live events</h2>
            <span className="text-[12px] text-[var(--d-ink)]/55">newest first · times in UTC · every 5 s</span>
          </div>
          {latest.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--d-ink)]/60">No events yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--d-ink)]/10 border-y border-[var(--d-ink)]/10">
              <AnimatePresence initial={false}>
                {latest.map((i) => {
                  const r = (i.status === "DELETED" ? i.record : (i.host_record ?? i.record))!;
                  return (
                    <motion.li
                      key={i.seq}
                      layout="position"
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: dur.base, ease: ease.out }}
                      className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 py-2 text-[13px]"
                    >
                      <span className="font-hash text-[11.5px] text-[var(--d-ink)]/55">{r.ts.slice(11, 19)}</span>
                      <span className="min-w-0 truncate">
                        <span className="mr-2 text-[11px] font-semibold tracking-[0.1em] text-[var(--d-ink)]/55 uppercase">{r.source}</span>
                        {r.msg}
                      </span>
                      <span className="font-hash text-[11px] text-[var(--d-ink)]/45">#{i.seq}</span>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
          <Link href="/evidence" className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold underline-offset-2 hover:underline">
            Every record, hash and proof <ArrowUpRight className="size-3.5" />
          </Link>
        </div>

        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="label">What the last verification found</h2>
            {lastRun && <span className="text-[12px] text-[var(--d-ink)]/55">run #{lastRun}</span>}
          </div>
          {!lastRun ? (
            <p className="mt-4 text-sm text-[var(--d-ink)]/60">Not verified yet. Hold to verify above.</p>
          ) : findings.length === 0 ? (
            <p className="mt-4 flex items-center gap-2 text-sm">
              <LegendMark status="INTACT" onRed={false} /> Nothing diverged: every committed record matched the chain.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--d-ink)]/10 border-y border-[var(--d-ink)]/10">
              {findings.map((f, i) => {
                const st = f.status as TickStatus;
                return (
                  <motion.li
                    key={`${f.seq}-${f.status}`}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: dur.base, ease: ease.out, delay: i * 0.04 }}
                    className="grid grid-cols-[18px_96px_minmax(0,1fr)] items-center gap-3 py-2 text-[13px]"
                  >
                    <LegendMark status={st} onRed={false} />
                    <span className="label !text-[10.5px]">
                      {TICK_META[st].label} <span className="font-hash !tracking-normal">#{f.seq}</span>
                    </span>
                    <span className="min-w-0 truncate">{(f.recovered_record ?? f.host_record)?.msg}</span>
                  </motion.li>
                );
              })}
            </ul>
          )}
          {lastRun && (report?.findings.length ?? 0) > findings.length && (
            <Link href="/attack" className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold underline-offset-2 hover:underline">
              {(report?.findings.length ?? 0) - findings.length} more in the attack lab <ArrowUpRight className="size-3.5" />
            </Link>
          )}
        </div>
      </div>
    </RevealBand>
  );
}

function LedgerBand({ batches, s }: { batches: Batch[]; s: Status | undefined | null }) {
  const recent = [...batches].reverse().slice(0, 5);
  return (
    <RevealBand className="grain bg-[var(--d-field)]" ariaLabel="On-chain ledger">
      <div className="mx-auto w-full max-w-[1320px] px-[clamp(20px,4vw,56px)] py-12 lg:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="label opacity-70">On-chain ledger</div>
            <h2 className="mt-2 font-display text-[clamp(28px,3.4vw,40px)] leading-none font-black uppercase">Commitments</h2>
          </div>
          <div className="caption flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-[12px]">
            <span>
              Chain <span className="font-hash">{s?.chain.chain_id ?? "—"}</span>
            </span>
            <span>
              Contract <HashChip value={s?.deployment?.contract_address} n={5} />
            </span>
            <span>
              Batches on contract <span className="font-hash">{s?.chain.onchain_batch_count ?? "—"}</span>
            </span>
          </div>
        </div>
        {recent.length === 0 ? (
          <p className="mt-6 text-sm text-[var(--d-ink)]/60">No batches anchored yet.</p>
        ) : (
          <div className="mt-6 overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="label !text-[10.5px] text-[var(--d-ink)]/60">
                  <th className="py-2 pr-4 font-semibold">Batch</th>
                  <th className="py-2 pr-4 font-semibold">Records</th>
                  <th className="py-2 pr-4 font-semibold">Merkle root</th>
                  <th className="py-2 pr-4 font-semibold">Transaction</th>
                  <th className="py-2 pr-4 font-semibold">Block</th>
                  <th className="py-2 font-semibold">Gas</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((b) => (
                  <tr key={b.batch_id} className="border-t border-[var(--d-ink)]/12">
                    <td className="py-2.5 pr-4 font-hash">#{b.batch_id}</td>
                    <td className="py-2.5 pr-4">
                      <span className="font-hash">{b.first_seq}–{b.last_seq}</span> <span className="text-[var(--d-ink)]/55">({b.event_count})</span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <HashChip value={b.merkle_root} n={6} />
                    </td>
                    <td className="py-2.5 pr-4">
                      <HashChip value={b.tx_hash} n={6} />
                    </td>
                    <td className="py-2.5 pr-4 font-hash">{b.block_number ?? "—"}</td>
                    <td className="py-2.5 font-hash">{b.gas_used?.toLocaleString() ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Link href="/proofs" className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold underline-offset-2 hover:underline">
          Inspect receipts and proofs <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
    </RevealBand>
  );
}
