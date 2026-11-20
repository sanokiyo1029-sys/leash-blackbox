"use client";

import { useState } from "react";
import { Download, FileJson, Loader2, ShieldCheck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ErrorNote, PageHeader, Stat } from "@/components/status";
import { api, useAction, useApi } from "@/lib/api";
import type { Status } from "@/lib/types";
import { verifyBundleInBrowser, type BrowserVerdict, type Bundle } from "@/lib/verify";
import { cn } from "@/lib/utils";

interface CliReport {
  verdict: string;
  summary: Record<string, number>;
  warnings: string[];
  errors: string[];
  events: { seq: number; status: string; reason?: string }[];
  missing: { seq: number; batch_id: number }[];
}

export default function AuditorPortal() {
  const status = useApi<Status>("/api/status");
  const action = useAction();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [bundleName, setBundleName] = useState<string>("");
  // null = not edited yet: fall back to this deployment's values
  const [rpcInput, setRpcUrl] = useState<string | null>(null);
  const [contractInput, setContract] = useState<string | null>(null);
  const rpcUrl = rpcInput ?? status.data?.chain.rpc_url ?? "";
  const contract = contractInput ?? status.data?.deployment?.contract_address ?? "";
  const [browserResult, setBrowserResult] = useState<BrowserVerdict | null>(null);
  const [cliResult, setCliResult] = useState<CliReport | null>(null);

  const load = (b: Bundle, name: string) => {
    setBundle(b);
    setBundleName(name);
    setBrowserResult(null);
    setCliResult(null);
  };

  const exportBundle = async (source: "vault" | "host", download: boolean) => {
    const b = await action.run(`export-${source}`, () => api<Bundle>(`/api/export?source=${source}`));
    if (!b) return;
    load(b, `${source}-bundle.json`);
    if (download) {
      const url = URL.createObjectURL(new Blob([JSON.stringify(b, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `leash-${source}-bundle.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      load(JSON.parse(await file.text()) as Bundle, file.name);
    } catch {
      action.setError("That file is not valid JSON.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Independent Auditor Portal"
        description="Auditors trust neither the server nor LEASH. Load an evidence bundle, give the contract address you obtained out of band, and verify it against the chain. The in-browser check uses only WebCrypto and direct JSON-RPC calls; our backend computes nothing for it."
      />
      <ErrorNote error={action.error} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>1 · Get a bundle</CardTitle>
            <CardDescription>Export from this deployment, or upload one an incident responder sent you.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => exportBundle("vault", false)} disabled={!!action.busy}>
                <FileJson /> Load protected vault evidence
              </Button>
              <Button variant="outline" onClick={() => exportBundle("host", false)} disabled={!!action.busy}>
                <FileJson /> Load host&apos;s current logs
              </Button>
              <Button variant="ghost" onClick={() => exportBundle("vault", true)} disabled={!!action.busy}>
                <Download /> Download vault bundle
              </Button>
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground hover:bg-muted/30">
              <Upload className="size-4" /> Upload bundle JSON
              <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            {bundle && (
              <div className="rounded-md border bg-muted/30 p-3 text-xs">
                <div className="font-semibold">{bundleName}</div>
                <div className="text-muted-foreground">
                  source {bundle.source} · scope {bundle.scope} · {bundle.events.length} records · {bundle.batches.length} batch claim(s) ·{" "}
                  {bundle.unanchored_records?.length ?? 0} uncommitted
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2 · Verify against the chain</CardTitle>
            <CardDescription>Use an RPC endpoint and contract address you trust. The bundle&apos;s own claims are only compared, never trusted.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="block text-xs text-muted-foreground">
              JSON-RPC endpoint
              <Input value={rpcUrl} onChange={(e) => setRpcUrl(e.target.value)} className="mt-1 font-hash" />
            </label>
            <label className="block text-xs text-muted-foreground">
              Anchor contract address
              <Input value={contract} onChange={(e) => setContract(e.target.value)} className="mt-1 font-hash" />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!bundle || !!action.busy}
                onClick={async () => {
                  const r = await action.run("browser", () => verifyBundleInBrowser(bundle!, rpcUrl, contract));
                  if (r) setBrowserResult(r);
                }}
              >
                {action.busy === "browser" ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Verify in my browser
              </Button>
              <Button
                variant="outline"
                disabled={!bundle || !!action.busy}
                onClick={async () => {
                  const r = await action.run("cli", () =>
                    api<CliReport>("/api/auditor/verify", { method: "POST", json: { bundle, contract_address: contract || null } }),
                  );
                  if (r) setCliResult(r);
                }}
              >
                {action.busy === "cli" ? <Loader2 className="animate-spin" /> : null} Run reference CLI verifier
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Offline equivalent: <code className="font-hash">python verifier/leash_verify.py bundle.json --rpc {rpcUrl || "URL"} --contract {contract ? contract.slice(0, 10) + "…" : "0x…"}</code>
            </p>
          </CardContent>
        </Card>
      </div>

      {browserResult && <BrowserResult r={browserResult} />}
      {cliResult && (
        <Card>
          <CardHeader>
            <CardTitle>Reference verifier (leash_verify.py) — {cliResult.verdict}</CardTitle>
            <CardDescription>The same stdlib-only verifier an auditor runs offline, executed on the server against its configured RPC endpoint.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {(["events_checked", "verified", "tampered", "missing", "uncommitted"] as const).map((k) => (
              <Stat key={k} label={k.replace(/_/g, " ")} value={cliResult.summary[k] ?? 0} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BrowserResult({ r }: { r: BrowserVerdict }) {
  const verified = r.events.filter((e) => e.status === "VERIFIED").length;
  const ok = r.verdict !== "TAMPERING_DETECTED";
  return (
    <Card className={cn(ok ? "border-ok/30" : "border-bad/40")}>
      <CardHeader>
        <CardTitle className={ok ? "text-ok" : "text-bad"}>{r.verdict.replace(/_/g, " ")}</CardTitle>
        <CardDescription>
          Computed in this browser in {r.ms} ms against chain {r.chainId} ({r.onchainBatches} on-chain batch(es)).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Records proven" value={`${verified}/${r.events.length}`} accent="text-ok" />
          <Stat label="Tampered" value={r.events.filter((e) => e.status === "TAMPERED").length} accent="text-bad" />
          <Stat label="Missing (erased)" value={r.missing.length} accent={r.missing.length ? "text-bad" : undefined} />
          <Stat label="Uncommitted" value={r.uncommitted} accent={r.uncommitted ? "text-warn" : undefined} />
          <Stat label="Chain heads ok" value={`${r.chainHeadChecks.filter((c) => c.ok).length}/${r.chainHeadChecks.length}`} />
        </div>
        {(r.missing.length > 0 || r.events.some((e) => e.status !== "VERIFIED") || r.batches.some((b) => b.issues.length)) && (
          <ul className="max-h-60 space-y-1 overflow-auto font-hash text-xs">
            {r.batches
              .filter((b) => b.issues.length)
              .map((b) => (
                <li key={`b${b.batch_id}`} className="text-warn">
                  batch {b.batch_id}: {b.issues.join("; ")}
                </li>
              ))}
            {r.events
              .filter((e) => e.status !== "VERIFIED")
              .map((e) => (
                <li key={`e${e.seq}`} className="text-bad">
                  seq {e.seq}: {e.status} — {e.reason}
                </li>
              ))}
            {r.missing.map((m) => (
              <li key={`m${m.seq}`} className="text-bad">
                seq {m.seq}: MISSING — committed in batch {m.batch_id} but absent from the bundle
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
