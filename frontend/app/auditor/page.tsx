"use client";

import { useState } from "react";
import { Download, FileJson, ShieldCheck, Terminal, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BatchAudit } from "@/components/batch-audit";
import { AlertBanner, MetricCard, PageTitle, Panel, Spinner } from "@/components/kit";
import { api, useAction, useApi } from "@/lib/api";
import type { Status } from "@/lib/types";
import { verifyBundleInBrowser, type BrowserVerdict, type Bundle } from "@/lib/verify";

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
    <div className="space-y-5">
      <PageTitle
        eyebrow="Independent audit"
        title="Independent Auditor Portal"
        description="Auditors trust neither the server nor LEASH. Load an evidence bundle, give the contract address you obtained out of band, and verify it against the chain. The in-browser check uses only WebCrypto and direct JSON-RPC calls; our backend computes nothing for it."
      />
      {action.error && (
        <AlertBanner tone="danger" title="Action failed" onDismiss={() => action.setError(null)}>
          {action.error}
        </AlertBanner>
      )}

      <BatchAudit />

      <div className="pt-3">
        <div className="text-[11px] font-medium tracking-[0.22em] text-primary uppercase">Full-bundle audit</div>
        <p className="mt-1 text-sm text-muted-foreground">Verify every record in a bundle at once, in this browser or with the reference CLI.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="1 · Get a bundle" description="Export from this deployment, or upload one an incident responder sent you." bodyClassName="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => exportBundle("vault", false)} disabled={!!action.busy}>
              {action.busy === "export-vault" ? <Spinner /> : <FileJson />} Load protected vault evidence
            </Button>
            <Button variant="outline" onClick={() => exportBundle("host", false)} disabled={!!action.busy}>
              {action.busy === "export-host" ? <Spinner /> : <FileJson />} Load host&apos;s current logs
            </Button>
            <Button variant="ghost" onClick={() => exportBundle("vault", true)} disabled={!!action.busy}>
              <Download /> Download vault bundle
            </Button>
          </div>
          <label className="surface-hover flex cursor-pointer items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
            <Upload className="size-4" /> Upload bundle JSON
            <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {bundle && (
            <div className="rounded-xl border bg-card/40 p-3 text-xs">
              <div className="font-semibold">{bundleName}</div>
              <div className="text-muted-foreground">
                source {bundle.source} · scope {bundle.scope} · {bundle.events.length} records · {bundle.batches.length} batch claim(s) ·{" "}
                {bundle.unanchored_records?.length ?? 0} uncommitted
              </div>
            </div>
          )}
        </Panel>

        <Panel
          title="2 · Verify against the chain"
          description="Use an RPC endpoint and contract address you trust. The bundle's own claims are only compared, never trusted."
          bodyClassName="space-y-3"
        >
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
              {action.busy === "browser" ? <Spinner /> : <ShieldCheck />} Verify in my browser
            </Button>
            <Button
              variant="outline"
              disabled={!bundle || !!action.busy}
              onClick={async () => {
                const r = await action.run("cli", () => api<CliReport>("/api/auditor/verify", { method: "POST", json: { bundle, contract_address: contract || null } }));
                if (r) setCliResult(r);
              }}
            >
              {action.busy === "cli" ? <Spinner /> : <Terminal />} Run reference CLI verifier
            </Button>
          </div>
          <p className="text-xs break-words text-muted-foreground">
            Offline equivalent:{" "}
            <code className="font-hash">
              python verifier/leash_verify.py bundle.json --rpc {rpcUrl || "URL"} --contract {contract ? contract.slice(0, 10) + "…" : "0x…"}
            </code>
          </p>
        </Panel>
      </div>

      {browserResult && <BrowserResult r={browserResult} />}
      {cliResult && (
        <Panel
          title={`Reference verifier (leash_verify.py) — ${cliResult.verdict}`}
          description="The same stdlib-only verifier an auditor runs offline, executed on the server against its configured RPC endpoint."
          tone={cliResult.verdict.startsWith("VERIFIED") ? "safe" : ["TAMPERING_DETECTED", "OBSERVED_OMISSION"].includes(cliResult.verdict) ? "danger" : "neutral"}
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {(["events_checked", "verified", "tampered", "missing", "uncommitted"] as const).map((k) => (
              <MetricCard key={k} label={k.replace(/_/g, " ")} value={cliResult.summary[k] ?? 0} />
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function BrowserResult({ r }: { r: BrowserVerdict }) {
  const verified = r.events.filter((e) => e.status === "VERIFIED").length;
  const tampered = r.events.filter((e) => e.status === "TAMPERED").length;
  const headsOk = r.chainHeadChecks.filter((c) => c.ok).length;
  const ok = r.verdict !== "TAMPERING_DETECTED";
  return (
    <Panel
      tone={ok ? "safe" : "danger"}
      title={<span className={ok ? "text-base text-ok" : "text-base text-bad"}>{r.verdict.replace(/_/g, " ")}</span>}
      description={`Computed in this browser in ${r.ms} ms against chain ${r.chainId} (${r.onchainBatches} on-chain batch(es)).`}
      bodyClassName="space-y-4"
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <MetricCard label="Records proven" value={verified} tone="ok" hint={`of ${r.events.length} in the bundle`} />
        <MetricCard label="Tampered" value={tampered} tone={tampered ? "bad" : undefined} />
        <MetricCard label="Missing (erased)" value={r.missing.length} tone={r.missing.length ? "bad" : undefined} />
        <MetricCard label="Uncommitted" value={r.uncommitted} tone={r.uncommitted ? "warn" : undefined} />
        <MetricCard
          label="Chain heads ok"
          value={headsOk}
          tone={!r.chainHeadChecks.length ? undefined : headsOk === r.chainHeadChecks.length ? "ok" : "bad"}
          hint={r.chainHeadChecks.length ? `of ${r.chainHeadChecks.length}` : "not checkable: a batch is incomplete"}
        />
      </div>
      {(r.missing.length > 0 || r.events.some((e) => e.status !== "VERIFIED") || r.batches.some((b) => b.issues.length)) && (
        <ul className="max-h-60 space-y-1 overflow-auto rounded-xl border bg-card/40 p-3 font-hash text-xs scrollbar-thin">
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
    </Panel>
  );
}
