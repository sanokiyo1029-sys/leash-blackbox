export type EventStatus = "INTACT" | "MODIFIED" | "DELETED" | "INJECTED";
export type Protection = "anchored" | "vault_only" | "unverifiable" | "none";
export type Verdict = "CLEAN" | "TAMPERING_DETECTED" | "OBSERVED_OMISSION" | "REPORTING_GAP" | "INCONCLUSIVE";

export interface EventRecord {
  v: number;
  seq: number;
  id: string;
  ts: string;
  host: string;
  source: string;
  type: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  actor: string;
  msg: string;
  attrs: Record<string, string>;
}

export interface EventItem {
  seq: number;
  event_id: string | null;
  batch_id: number | null;
  protection: Protection;
  status: EventStatus;
  leaf_hash: string | null;
  host_leaf_hash: string | null;
  record: EventRecord | null;
  host_record: EventRecord | null;
  diff: Record<string, { expected: unknown; found: unknown }> | null;
}

export interface Batch {
  batch_id: number;
  first_seq: number;
  last_seq: number;
  event_count: number;
  merkle_root: string;
  prev_chain_head: string;
  chain_head: string;
  manifest_hash: string;
  status: "pending" | "anchored" | "failed";
  sealed_at: string;
  tx_hash: string | null;
  block_number: number | null;
  block_timestamp: number | null;
  gas_used: number | null;
  anchored_at: string | null;
  anchor_latency_ms: number | null;
  error: string | null;
}

export interface Deployment {
  id: number;
  chain_id: number;
  contract_address: string;
  deployer: string;
  tx_hash: string;
  block_number: number;
  deployed_at: string;
}

export interface Summary {
  total_records: number;
  intact: number;
  modified: number;
  deleted: number;
  injected: number;
  anchored_intact: number;
  anchored_modified: number;
  anchored_deleted: number;
  batches_total: number;
  batches_verified: number;
  batches_pending: number;
  batches_failed: number;
  host_batches_matching_chain: number;
  first_divergent_seq: number | null;
  // GHOST witness (absent on runs recorded before the witness existed)
  witness_observations?: number;
  witness_corroborated?: number;
  witness_rejected?: number;
  omissions?: number;
  heartbeats?: number;
  reporting_gaps?: number;
}

export interface ReportingGap {
  host: string;
  kind: "silent" | "late" | "sequence" | "chain_break";
  from: string;
  to: string | null;
  seconds: number;
  explanation: string;
}

export interface HeartbeatReport {
  policy: { id: string; version: number; interval_seconds: number; grace_seconds: number };
  heartbeats: number;
  gaps: ReportingGap[];
  restarts: { host: string; at: string }[];
  rejected: { host: string; seq: number; reason: string }[];
}

export interface WitnessClaim {
  obs_id: string;
  witness: string;
  role: string;
  kind: string;
  host: string;
  user: string;
  src_ip: string;
  observed_at: string;
}

export interface WitnessReport {
  policy: { id: string; version: number; rule: string; skew_seconds: number };
  signature_scheme: string;
  trust_assumptions: string[];
  witnesses: string[];
  observations: number;
  corroborated: { obs_id: string; seq: number }[];
  rejected: { obs_id: string; witness: string; reason: string }[];
  omissions: { observation: WitnessClaim; signature: string; signature_valid: boolean; explanation: string }[];
}

export interface Status {
  version: string;
  chain: {
    rpc_url: string;
    connected: boolean;
    chain_id?: number;
    latest_block?: number;
    contract_present?: boolean;
    onchain_batch_count?: number;
    error?: string;
  };
  deployment: Deployment | null;
  counts: {
    host_events: number;
    vault_events: number;
    anchored_events: number;
    unanchored_events: number;
    unbatched_events: number;
    batches: number;
    anchored_batches: number;
  };
  last_verification: {
    run_id: number;
    verified_at: string;
    verdict: Verdict;
    duration_ms: number;
    summary: Summary;
  } | null;
}

export interface OnChainBatch {
  batch_id: number;
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

export interface BatchReport {
  batch_id: number;
  first_seq: number;
  last_seq: number;
  event_count: number;
  sealed_root: string;
  vault_root: string | null;
  host_root: string | null;
  onchain: OnChainBatch | null;
  tx_hash: string | null;
  block_number: number | null;
  receipt_status: number | null;
  host_matches_chain: boolean | null;
  issues: string[];
  status: "VERIFIED" | "PENDING" | "MISSING_ON_CHAIN" | "VAULT_MISMATCH" | "CHAIN_UNREACHABLE";
}

export interface Finding {
  seq: number;
  event_id: string | null;
  batch_id: number | null;
  status: EventStatus;
  protection: Protection;
  diff: EventItem["diff"];
  leaf_hash: string | null;
  host_leaf_hash: string | null;
  recovered_record: EventRecord | null;
  host_record: EventRecord | null;
}

export interface VerificationReport {
  run_id?: number;
  verified_at: string;
  duration_ms: number;
  verdict: Verdict;
  chain_attestation: "verified" | "failed" | "unavailable" | "none_anchored";
  summary: Summary;
  batches: BatchReport[];
  findings: Finding[];
  witness?: WitnessReport;
  heartbeat?: HeartbeatReport;
}

export interface VerifyRun {
  run_id: number;
  verified_at: string;
  verdict: Verdict;
  duration_ms: number;
  summary: Summary;
}

export interface AttackResult {
  scenario: string;
  description: string;
  affected: number;
  actions: Record<string, number>;
  seqs: number[];
}

export interface Score {
  ground_truth_tampered: number;
  detected: number;
  true_positive: number;
  false_negative: number;
  false_positive: number;
  verdict: Verdict;
}
