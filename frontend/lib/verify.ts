/**
 * In-browser, backend-independent verification.
 *
 * A third TypeScript implementation of the hashing spec (backend: Python, auditor
 * CLI: Python stdlib). Uses WebCrypto SHA-256 and talks to the chain directly over
 * JSON-RPC, so the LEASH backend is not trusted for any result computed here.
 */

export type ProofStep = { side: "L" | "R"; hash: string };

export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("only safe integers are canonical");
    return String(value);
  }
  if (typeof value === "boolean") throw new Error("booleans are outside the canonical subset");
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort(codePointCompare);
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
  }
  throw new Error(`unsupported type ${typeof value}`);
}

function codePointCompare(a: string, b: string): number {
  const A = Array.from(a);
  const B = Array.from(b);
  for (let i = 0; i < Math.min(A.length, B.length); i++) {
    const d = A[i].codePointAt(0)! - B[i].codePointAt(0)!;
    if (d !== 0) return d;
  }
  return A.length - B.length;
}

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

async function sha256(...parts: Uint8Array[]): Promise<Uint8Array> {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    buf.set(p, off);
    off += p.length;
  }
  return new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
}

const LEAF = new Uint8Array([0]);
const NODE = new Uint8Array([1]);
const CHAIN = new Uint8Array([2]);

export async function leafHash(record: unknown): Promise<string> {
  return bytesToHex(await sha256(LEAF, new TextEncoder().encode(canonicalJson(record))));
}

export async function rootFromProof(leafHex: string, proof: ProofStep[]): Promise<string> {
  let acc = hexToBytes(leafHex);
  for (const step of proof) {
    const sib = hexToBytes(step.hash);
    acc = step.side === "L" ? await sha256(NODE, sib, acc) : await sha256(NODE, acc, sib);
  }
  return bytesToHex(acc);
}

export async function chainNext(prevHex: string, leafHex: string): Promise<string> {
  return bytesToHex(await sha256(CHAIN, hexToBytes(prevHex), hexToBytes(leafHex)));
}

// ---------------------------------------------------------------- JSON-RPC
// Selectors are keccak256(signature)[:4]; anyone can recompute them.
const SEL_GET_BATCH = "5ac44282"; // getBatch(uint256)
const SEL_BATCH_COUNT = "06f13056"; // batchCount()
export const BATCH_ANCHORED_TOPIC = "0x54a14f8edd6c5fba9da74971f5c143705ae7eec3e758276258fc88a9e2cb88e0";

export interface ChainBatch {
  merkle_root: string;
  chain_head: string;
  manifest_hash: string;
  first_seq: number;
  last_seq: number;
  event_count: number;
  anchored_at: number;
  block_number: number;
  submitter: string;
}

let rpcId = 0;
export async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message ?? JSON.stringify(body.error)}`);
  return body.result as T;
}

export async function readBatch(url: string, contract: string, batchId: number): Promise<ChainBatch | null> {
  const data = "0x" + SEL_GET_BATCH + batchId.toString(16).padStart(64, "0");
  let raw: string;
  try {
    raw = await rpc<string>(url, "eth_call", [{ to: contract, data }, "latest"]);
  } catch {
    return null;
  }
  const h = raw.slice(2);
  if (h.length < 64 * 9) return null;
  const w = (i: number) => h.slice(64 * i, 64 * (i + 1));
  const n = (i: number) => Number(BigInt("0x" + w(i)));
  return {
    merkle_root: w(0),
    chain_head: w(1),
    manifest_hash: w(2),
    first_seq: n(3),
    last_seq: n(4),
    event_count: n(5),
    anchored_at: n(6),
    block_number: n(7),
    submitter: "0x" + w(8).slice(24),
  };
}

export async function batchCount(url: string, contract: string): Promise<number> {
  const raw = await rpc<string>(url, "eth_call", [{ to: contract, data: "0x" + SEL_BATCH_COUNT }, "latest"]);
  return Number(BigInt(raw));
}

// ------------------------------------------------------------ bundle check
export interface Bundle {
  format: string;
  source: "vault" | "host";
  scope: "full" | "selective";
  anchor: { chain_id: number; contract_address: string };
  batches: { batch_id: number; merkle_root: string; tx_hash: string | null; first_seq: number; last_seq: number }[];
  events: { seq: number; batch_id: number; leaf_index: number; record: Record<string, unknown>; proof: ProofStep[] }[];
  unanchored_records: { seq: number; record: unknown }[];
}

export interface BrowserVerdict {
  verdict: "VERIFIED" | "VERIFIED_WITH_UNCOMMITTED_RECORDS" | "TAMPERING_DETECTED";
  chainId: number;
  onchainBatches: number;
  batches: { batch_id: number; ok: boolean; issues: string[] }[];
  events: { seq: number; status: "VERIFIED" | "TAMPERED" | "UNVERIFIABLE"; reason?: string }[];
  missing: { seq: number; batch_id: number }[];
  uncommitted: number;
  chainHeadChecks: { batch_id: number; ok: boolean }[];
  ms: number;
}

export async function verifyBundleInBrowser(bundle: Bundle, rpcUrl: string, contract: string): Promise<BrowserVerdict> {
  const started = performance.now();
  if (bundle.format !== "leash-blackbox-evidence/v1") throw new Error(`unsupported bundle format ${bundle.format}`);
  const chainId = Number(BigInt(await rpc<string>(rpcUrl, "eth_chainId", [])));
  const code = await rpc<string>(rpcUrl, "eth_getCode", [contract, "latest"]);
  if (!code || code === "0x") throw new Error("no contract code at that address on this chain");
  const onchainBatches = await batchCount(rpcUrl, contract);

  const onchain = new Map<number, ChainBatch>();
  const batches: BrowserVerdict["batches"] = [];
  for (const b of bundle.batches) {
    const oc = await readBatch(rpcUrl, contract, b.batch_id);
    const issues: string[] = [];
    if (!oc) issues.push("no on-chain commitment");
    else {
      onchain.set(b.batch_id, oc);
      if (oc.merkle_root !== b.merkle_root.toLowerCase()) issues.push("bundle root differs from chain (claim ignored)");
      if (b.tx_hash) {
        const receipt = await rpc<{ status: string; to: string; logs: { topics: string[] }[] } | null>(rpcUrl, "eth_getTransactionReceipt", [b.tx_hash]);
        const logOk = receipt?.logs.some((l) => l.topics[0] === BATCH_ANCHORED_TOPIC && l.topics[2]?.slice(2).toLowerCase() === oc.merkle_root);
        if (!receipt || receipt.status !== "0x1" || receipt.to?.toLowerCase() !== contract.toLowerCase() || !logOk)
          issues.push("anchoring receipt missing or inconsistent");
      }
    }
    batches.push({ batch_id: b.batch_id, ok: issues.every((i) => i.includes("claim ignored")) && !!oc, issues });
  }
  if (bundle.scope === "full") {
    for (let id = 0; id < onchainBatches; id++) {
      if (!onchain.has(id)) {
        const oc = await readBatch(rpcUrl, contract, id);
        if (oc) onchain.set(id, oc);
        batches.push({ batch_id: id, ok: false, issues: ["committed on-chain but withheld from the bundle"] });
      }
    }
  }

  const events: BrowserVerdict["events"] = [];
  const leaves = new Map<number, string>();
  for (const ev of bundle.events) {
    const oc = onchain.get(ev.batch_id);
    if (!oc) {
      events.push({ seq: ev.seq, status: "UNVERIFIABLE", reason: "batch not on chain" });
      continue;
    }
    if (ev.record?.seq !== ev.seq || ev.seq < oc.first_seq || ev.seq > oc.last_seq || ev.leaf_index !== ev.seq - oc.first_seq) {
      events.push({ seq: ev.seq, status: "TAMPERED", reason: "record moved outside its committed position" });
      continue;
    }
    try {
      const leaf = await leafHash(ev.record);
      const root = await rootFromProof(leaf, ev.proof);
      if (root === oc.merkle_root) {
        events.push({ seq: ev.seq, status: "VERIFIED" });
        leaves.set(ev.seq, leaf);
      } else events.push({ seq: ev.seq, status: "TAMPERED", reason: "does not hash to the on-chain root" });
    } catch (e) {
      events.push({ seq: ev.seq, status: "TAMPERED", reason: e instanceof Error ? e.message : String(e) });
    }
  }

  const missing: BrowserVerdict["missing"] = [];
  const chainHeadChecks: BrowserVerdict["chainHeadChecks"] = [];
  if (bundle.scope === "full") {
    const seen = new Set(bundle.events.map((e) => e.seq));
    let prev = "00".repeat(32);
    for (const id of [...onchain.keys()].sort((a, b) => a - b)) {
      const oc = onchain.get(id)!;
      let complete = true;
      for (let s = oc.first_seq; s <= oc.last_seq; s++) {
        if (!seen.has(s)) missing.push({ seq: s, batch_id: id });
        if (!leaves.has(s)) complete = false;
      }
      if (complete) {
        let head = prev;
        for (let s = oc.first_seq; s <= oc.last_seq; s++) head = await chainNext(head, leaves.get(s)!);
        chainHeadChecks.push({ batch_id: id, ok: head === oc.chain_head });
      }
      prev = oc.chain_head;
    }
  }

  const bad =
    events.some((e) => e.status !== "VERIFIED") || missing.length > 0 || batches.some((b) => !b.ok) || chainHeadChecks.some((c) => !c.ok);
  const uncommitted = bundle.unanchored_records?.length ?? 0;
  return {
    verdict: bad ? "TAMPERING_DETECTED" : uncommitted ? "VERIFIED_WITH_UNCOMMITTED_RECORDS" : "VERIFIED",
    chainId,
    onchainBatches,
    batches,
    events,
    missing,
    uncommitted,
    chainHeadChecks,
    ms: Math.round(performance.now() - started),
  };
}
