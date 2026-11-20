"use client";

import { motion } from "motion/react";
import { AlertTriangle, ArrowRight, Check, FileSearch, GitCompareArrows } from "lucide-react";
import { Hero, HowPanels, NextStep } from "@/components/home-scenes";
import { buttonVariants } from "@/components/ui/button";
import { CASE_RESULT, setCase, useCase } from "@/lib/case-state";
import { dur, ease } from "@/lib/motion";
import { cn } from "@/lib/utils";

// Sample case: a curated example in the vocabulary of the real lab (web-prod-01, the attacker's 203.0.113.45,
// the gateway witness). It is labelled "Sample case" and never claims to be a live verification.
const ROWS = [
  { t: "02:03:11", user: "alice", ip: "10.0.4.12", port: 51734 },
  { t: "02:09:47", user: "bob", ip: "10.0.4.27", port: 40211 },
  { t: "02:14:06", user: "deploy", ip: "203.0.113.45", port: 51022, missing: true },
  { t: "02:22:05", user: "carol", ip: "10.0.7.3", port: 45580 },
  { t: "02:28:52", user: "svc-backup", ip: "10.0.9.41", port: 60117 },
];
const serverLine = (r: (typeof ROWS)[number]) => `sshd: Accepted publickey for ${r.user} from ${r.ip} port ${r.port} ssh2`;
const witnessLine = (r: (typeof ROWS)[number]) => `SSH session · ${r.user} from ${r.ip} → web-prod-01 · signed`;

function openCase(e?: React.MouseEvent) {
  e?.preventDefault();
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById("case")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  history.replaceState(null, "", "#case");
  document.getElementById("case-title")?.focus({ preventScroll: true });
}

export default function Home() {
  return (
    <>
      <Hero onOpen={openCase} />
      <CaseSection />
      <HowPanels />
      <NextStep />
    </>
  );
}

function CaseSection() {
  const { compared, howOpen } = useCase();
  const compare = () => {
    setCase({ compared: true });
    setTimeout(() => document.getElementById("case-result")?.focus({ preventScroll: true }), 0);
  };
  return (
    <section id="case" aria-labelledby="case-title" className="scroll-mt-14 border-t border-border">
      <div className="mx-auto w-full max-w-[1120px] px-[clamp(20px,4vw,56px)] pt-14 pb-20">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="inline-flex items-center gap-1.5 rounded-[3px] border border-primary/60 px-2 py-0.5 text-xs font-semibold text-primary">
            <FileSearch className="size-3.5" aria-hidden /> Sample case
          </span>
          <span className="text-sm text-muted-foreground">A curated example. Nothing in this section is a live verification.</span>
        </div>
        <h2 id="case-title" tabIndex={-1} className="mt-4 font-display text-[clamp(32px,4vw,48px)] leading-tight font-semibold outline-none">
          The missing session
        </h2>
        <p className="mt-6 max-w-[60ch] text-muted-foreground">
          This is what <span className="font-hash text-foreground">web-prod-01</span> wrote to its own SSH log between 02:00 and 02:30 UTC. At first
          glance it looks ordinary.
        </p>

        {!compared ? (
          <div className="mt-8">
            <RecordPanel title="Server log" source="web-prod-01 · /var/log/auth.log">
              {ROWS.filter((r) => !r.missing).map((r) => (
                <LogRow key={r.t} t={r.t} text={serverLine(r)} />
              ))}
            </RecordPanel>
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
              <button type="button" onClick={compare} className={cn(buttonVariants({ size: "lg" }), "h-11 gap-2 px-5 text-[15px]")}>
                <GitCompareArrows className="size-4" /> Compare records
              </button>
              <span className="text-sm text-muted-foreground">Line it up with the record kept outside this server.</span>
            </div>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: dur.slow, ease: ease.out }} className="mt-8">
            <Comparison />

            <div id="case-result" tabIndex={-1} className="mt-8 flex items-start gap-3 rounded-md border border-warn/50 bg-card p-4 outline-none sm:p-5">
              <AlertTriangle className="mt-1 size-5 shrink-0 text-warn" aria-hidden />
              <div>
                <p className="text-[17px] font-semibold">{CASE_RESULT}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  <span className="font-hash text-foreground">deploy</span> from <span className="font-hash text-foreground">203.0.113.45</span> at{" "}
                  <span className="font-hash text-foreground">02:14:06 UTC</span>, signed by the gateway witness. The server has no matching SSH login
                  within ±120 seconds.
                </p>
              </div>
            </div>

            <details
              id="how-verified"
              open={howOpen}
              onToggle={(e) => setCase({ howOpen: e.currentTarget.open })}
              className="group mt-4 rounded-md border border-border bg-card"
            >
              <summary className="cursor-pointer list-none rounded-md px-4 py-3 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-5">
                <span className="inline-flex items-center gap-2">
                  <ArrowRight className="size-4 transition-transform group-open:rotate-90" aria-hidden /> How was this verified?
                </span>
              </summary>
              <div className="space-y-3 border-t border-border px-4 py-4 text-[15px] leading-relaxed sm:px-5">
                <p>
                  <b>Where the second record comes from.</b> A gateway witness sits on the network path. It sees each SSH session reach the server,
                  signs that observation with its own key (secp256k1, EIP-191) and stores it outside the server, where the server&apos;s admin cannot
                  edit it.
                </p>
                <p>
                  <b>The rule.</b> Every signed session must match exactly one SSH login that the server reported: same host, user and source address,
                  within ±120 seconds (<span className="font-hash">ssh-session-corroboration v1</span>). A session with no match is an observed
                  omission.
                </p>
                <p>
                  <b>What this proves, and what it does not.</b> It proves the two records differ: a signed observer saw a session that this server
                  never logged. It does not prove who removed the entry or why. A stopped logger, a crash and an attacker look the same until
                  someone investigates.
                </p>
                <p className="text-muted-foreground">
                  In this prototype the witness is logically isolated (its own key, store and registry) but runs on the same machine as the
                  collector. This sample is scripted; the Attack Lab runs the real check.
                </p>
              </div>
            </details>

            <button
              type="button"
              onClick={() => setCase({ compared: false, howOpen: false })}
              className="mt-5 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Show the server log only
            </button>
          </motion.div>
        )}
      </div>
    </section>
  );
}

function RecordPanel({ title, source, children }: { title: string; source: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="font-hash text-xs text-muted-foreground">{source}</span>
      </div>
      <ol className="divide-y divide-border">{children}</ol>
    </div>
  );
}

function LogRow({ t, text, mark }: { t: string; text: React.ReactNode; mark?: boolean }) {
  return (
    <li className={cn("grid grid-cols-[72px_minmax(0,1fr)] gap-3 px-4 py-2.5 font-hash text-[13px]", mark && "border-l-4 border-l-warn bg-warn/10 pl-3")}>
      <span className="text-muted-foreground">{t}</span>
      <span className="min-w-0 break-words">{text}</span>
    </li>
  );
}

const NoEntry = () => <span className="text-muted-foreground italic">No entry</span>;
const OnlyHere = () => (
  <span className="inline-flex items-center gap-1 font-sans text-xs font-semibold text-warn">
    <AlertTriangle className="size-3.5" aria-hidden /> Only in the independent record
  </span>
);

/** Desktop: one aligned table. Phones: the two records stacked, each with the timestamps. */
function Comparison() {
  return (
    <div>
        <table className="hidden w-full border-collapse overflow-hidden rounded-md border border-border bg-card text-left md:table">
          <caption className="sr-only">Server log and independent record for web-prod-01, 02:00 to 02:30 UTC, aligned by time</caption>
          <thead>
            <tr className="border-b border-border text-sm">
              <th scope="col" className="w-[92px] px-4 py-2.5 font-semibold">Time (UTC)</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Server log <span className="ml-1 font-hash text-xs font-normal text-muted-foreground">web-prod-01</span>
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Independent record <span className="ml-1 font-hash text-xs font-normal text-muted-foreground">gateway witness</span>
              </th>
            </tr>
          </thead>
          <tbody className="font-hash text-[13px]">
            {ROWS.map((r, i) => (
              <motion.tr
                key={r.t}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: dur.base, delay: 0.05 * i }}
                className={cn("border-b border-border last:border-b-0", r.missing && "bg-warn/10")}
              >
                <th scope="row" className={cn("px-4 py-2.5 align-top font-normal text-muted-foreground", r.missing && "border-l-4 border-l-warn")}>
                  {r.t}
                </th>
                <td className="px-4 py-2.5 align-top">{r.missing ? <NoEntry /> : serverLine(r)}</td>
                <td className="px-4 py-2.5 align-top">
                  <div>{witnessLine(r)}</div>
                  <div className="mt-1">
                    {r.missing ? (
                      <OnlyHere />
                    ) : (
                      <span className="inline-flex items-center gap-1 font-sans text-xs text-muted-foreground">
                        <Check className="size-3.5 text-ok" aria-hidden /> Matches the server log
                      </span>
                    )}
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>

        <div className="space-y-4 md:hidden">
          <RecordPanel title="Server log" source="web-prod-01">
            {ROWS.map((r) => (
              <LogRow key={r.t} t={r.t} mark={r.missing} text={r.missing ? <NoEntry /> : serverLine(r)} />
            ))}
          </RecordPanel>
          <RecordPanel title="Independent record" source="gateway witness">
            {ROWS.map((r) => (
              <LogRow
                key={r.t}
                t={r.t}
                mark={r.missing}
                text={
                  <>
                    {witnessLine(r)}
                    {r.missing && (
                      <span className="mt-1 block">
                        <OnlyHere />
                      </span>
                    )}
                  </>
                }
              />
            ))}
          </RecordPanel>
        </div>
    </div>
  );
}
