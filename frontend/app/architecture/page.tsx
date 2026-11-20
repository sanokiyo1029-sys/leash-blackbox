import { AlertTriangle, ArrowRight, Blocks, Database, Server, ShieldCheck, Workflow } from "lucide-react";
import { PageTitle, Panel, Reveal } from "@/components/kit";
import { cn } from "@/lib/utils";

const ZONES = [
  {
    title: "Monitored host (attacker has root)",
    icon: Server,
    border: "border-t-bad/60",
    text: "text-bad",
    items: ["Synthetic telemetry: sshd, sudo, auditd, nginx, firewall, EDR", "Host agent forwards each event at ingest", "Local log store host_logs.db, attackable"],
  },
  {
    title: "Collector & evidence vault",
    icon: Database,
    border: "border-t-warn/60",
    text: "text-warn",
    items: [
      "Assigns sequence numbers; canonical JSON",
      "leaf = SHA256(0x00 ‖ record); chain = SHA256(0x02 ‖ prev ‖ leaf)",
      "evidence.db append-only (UPDATE/DELETE triggers abort)",
      "Merkle batches; node = SHA256(0x01 ‖ L ‖ R)",
    ],
  },
  {
    title: "Anchor service",
    icon: Workflow,
    border: "border-t-info/60",
    text: "text-info",
    items: ["Holds the signing key, which never touches the host", "anchorBatch(root, chainHead, manifestHash, firstSeq, lastSeq, count)", "Checks the receipt status and the BatchAnchored event"],
  },
  {
    title: "Independent EVM chain",
    icon: Blocks,
    border: "border-t-ok/60",
    text: "text-ok",
    items: ["LeashAnchor.sol: append-only, no update/delete", "Enforces contiguous sequence ranges on-chain", "Anyone can read; only allow-listed anchorers can write"],
  },
];

const GUARANTEES = [
  ["Modified record", "Leaf hash no longer matches the anchored leaf; the field-level diff is shown and the original is recovered from the vault."],
  ["Deleted record", "The sequence number is committed on-chain but absent on the host; the original is recovered and proven via a Merkle inclusion proof."],
  ["Injected record", "No collector or on-chain commitment exists for that sequence number."],
  ["Reordering / timestomping", "Timestamps are inside the hashed record; the hash-chain head is anchored, so ordering is committed too."],
  ["Host + vault rewritten together", "The recomputed root differs from the on-chain root, so the verdict is VAULT_MISMATCH (detected, not recoverable)."],
  ["Chain unreachable", "Verdict is INCONCLUSIVE, never CLEAN. Batches retry on recovery without gaps."],
];

const LIMITS = [
  "Events produced after compromise can be forged at the source (garbage in).",
  "Events suppressed before forwarding never reach the collector. Forwarding at ingest keeps this window small.",
  "Events not yet anchored are protected only by the vault's separation (shown as 'vault only').",
  "The prototype runs every zone on one machine with separate stores and a local Hardhat chain. Production would use separate infrastructure and a public or consortium chain.",
];

export default function Architecture() {
  return (
    <div className="space-y-5">
      <PageTitle
        eyebrow="Threat model"
        title="Architecture & Threat Model"
        description="Trust boundaries, hashing scheme and what is and is not guaranteed. Full reasoning: docs/handoff/ARCHITECTURE_DECISIONS.md."
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {ZONES.map((z, i) => (
          <Reveal key={z.title} delay={i * 0.06} className="relative">
            <div className={cn("surface surface-hover h-full rounded-2xl border-t-2 p-4", z.border)}>
              <div className="flex items-center justify-between">
                <span className="font-hash text-[11px] text-muted-foreground">zone {i + 1}</span>
                <z.icon className={cn("size-4", z.text)} />
              </div>
              <h2 className="mt-1.5 text-sm font-semibold tracking-tight">{z.title}</h2>
              <ul className="mt-3 space-y-1.5 text-xs text-foreground/85">
                {z.items.map((it) => (
                  <li key={it} className="flex gap-2">
                    <span className={cn("mt-1.5 size-1 shrink-0 rounded-full bg-current", z.text)} />
                    <span className="min-w-0 break-words">{it}</span>
                  </li>
                ))}
              </ul>
            </div>
            {i < ZONES.length - 1 && <ArrowRight aria-hidden className="absolute top-1/2 -right-3 z-10 hidden size-4 -translate-y-1/2 text-muted-foreground xl:block" />}
          </Reveal>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="What gets detected" description="Each case is covered by the backend test suite (backend/tests/test_pipeline.py)." tone="safe">
          <ul className="space-y-3 text-sm">
            {GUARANTEES.map(([k, v]) => (
              <li key={k} className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" />
                <div className="min-w-0">
                  <div className="font-medium">{k}</div>
                  <div className="text-xs text-muted-foreground">{v}</div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Honest limitations" description="What the blockchain does not protect.">
          <ul className="space-y-2.5 text-sm text-muted-foreground">
            {LIMITS.map((l) => (
              <li key={l} className="flex gap-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
                <span className="min-w-0">{l}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-xl border bg-card/40 p-3 text-xs text-muted-foreground">
            Three independent implementations of the hashing spec agree: the backend (Python), the auditor CLI (Python standard library with its own Keccak-256) and this web
            app (TypeScript + WebCrypto). A test checks that the backend and the CLI produce identical leaves, roots and chains.
          </div>
        </Panel>
      </div>
    </div>
  );
}
