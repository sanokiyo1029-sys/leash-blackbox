import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/status";

const ZONES = [
  {
    title: "Monitored host (attacker has root)",
    tone: "border-bad/40 bg-bad/5",
    items: ["Synthetic telemetry: sshd, sudo, auditd, nginx, firewall, EDR", "Host agent forwards each event at ingest", "Local log store host_logs.db, attackable"],
  },
  {
    title: "Collector & evidence vault",
    tone: "border-warn/40 bg-warn/5",
    items: [
      "Assigns sequence numbers; canonical JSON",
      "leaf = SHA256(0x00 ‖ record); chain = SHA256(0x02 ‖ prev ‖ leaf)",
      "evidence.db append-only (UPDATE/DELETE triggers abort)",
      "Merkle batches; node = SHA256(0x01 ‖ L ‖ R)",
    ],
  },
  {
    title: "Anchor service",
    tone: "border-info/40 bg-info/5",
    items: ["Holds the signing key, which never touches the host", "anchorBatch(root, chainHead, manifestHash, firstSeq, lastSeq, count)", "Checks the receipt status and the BatchAnchored event"],
  },
  {
    title: "Independent EVM chain",
    tone: "border-ok/40 bg-ok/5",
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
    <div className="space-y-6">
      <PageHeader
        title="Architecture & Threat Model"
        description="Trust boundaries, hashing scheme and what is and is not guaranteed. Full reasoning: docs/handoff/ARCHITECTURE_DECISIONS.md."
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {ZONES.map((z, i) => (
          <Card key={z.title} className={z.tone}>
            <CardHeader>
              <CardDescription className="font-hash text-xs">zone {i + 1}</CardDescription>
              <CardTitle className="text-sm">{z.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-4 text-xs text-foreground/85">
                {z.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>What gets detected</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {GUARANTEES.map(([k, v]) => (
              <div key={k}>
                <div className="font-medium">{k}</div>
                <div className="text-xs text-muted-foreground">{v}</div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Honest limitations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-4 text-sm text-muted-foreground">
              {LIMITS.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <div className="mt-6 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              Three independent implementations of the hashing spec agree: the backend (Python), the auditor CLI (Python standard library with its own
              Keccak-256) and this web app (TypeScript + WebCrypto). A test checks that the backend and the CLI produce identical leaves, roots and chains.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
