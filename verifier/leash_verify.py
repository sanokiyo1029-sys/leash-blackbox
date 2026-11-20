#!/usr/bin/env python3
"""LEASH BLACKBOX independent evidence verifier.

Standalone and dependency-free (Python 3.10+ standard library only). It shares
no code with the LEASH BLACKBOX backend: canonicalization, SHA-256 Merkle
proofs, the hash chain, Keccak-256, ABI encoding and JSON-RPC are all
re-implemented here so an auditor can read and trust this one file.

Usage:
    python leash_verify.py BUNDLE.json --rpc http://127.0.0.1:8545 [--contract 0x...] [--json report.json]

Exit codes: 0 = verified, 2 = tampering or missing evidence detected, 1 = error.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.error
import urllib.request
from typing import Any

BUNDLE_FORMAT = "leash-blackbox-evidence/v1"

# --------------------------------------------------------------------- keccak
_RC = [
    0x0000000000000001, 0x0000000000008082, 0x800000000000808A, 0x8000000080008000,
    0x000000000000808B, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
    0x000000000000008A, 0x0000000000000088, 0x0000000080008009, 0x000000008000000A,
    0x000000008000808B, 0x800000000000008B, 0x8000000000008089, 0x8000000000008003,
    0x8000000000008002, 0x8000000000000080, 0x000000000000800A, 0x800000008000000A,
    0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
]
_ROT = [[0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61], [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]]
_M64 = (1 << 64) - 1


def _rotl(v: int, n: int) -> int:
    return ((v << n) | (v >> (64 - n))) & _M64 if n else v


def _keccak_f(a: list[list[int]]) -> None:
    for rc in _RC:
        c = [a[x][0] ^ a[x][1] ^ a[x][2] ^ a[x][3] ^ a[x][4] for x in range(5)]
        d = [c[(x - 1) % 5] ^ _rotl(c[(x + 1) % 5], 1) for x in range(5)]
        for x in range(5):
            for y in range(5):
                a[x][y] ^= d[x]
        b = [[0] * 5 for _ in range(5)]
        for x in range(5):
            for y in range(5):
                b[y][(2 * x + 3 * y) % 5] = _rotl(a[x][y], _ROT[x][y])
        for x in range(5):
            for y in range(5):
                a[x][y] = b[x][y] ^ ((~b[(x + 1) % 5][y]) & b[(x + 2) % 5][y])
        a[0][0] ^= rc


def keccak256(data: bytes) -> bytes:
    """Ethereum Keccak-256 (original Keccak padding, not NIST SHA3-256)."""
    rate = 136
    msg = bytearray(data) + b"\x01"
    msg += b"\x00" * ((-len(msg)) % rate)
    msg[-1] |= 0x80
    state = [[0] * 5 for _ in range(5)]
    for off in range(0, len(msg), rate):
        block = msg[off:off + rate]
        for i in range(rate // 8):
            state[i % 5][i // 5] ^= int.from_bytes(block[8 * i:8 * i + 8], "little")
        _keccak_f(state)
    out = b"".join(state[i % 5][i // 5].to_bytes(8, "little") for i in range(4))
    return out


assert keccak256(b"").hex() == "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"

# ----------------------------------------------------------- hashing spec v1


def canonical(value: Any) -> bytes:
    def check(v: Any) -> None:
        if isinstance(v, bool) or isinstance(v, float):
            raise ValueError("booleans/floats are outside the canonical subset")
        if isinstance(v, dict):
            for k, item in v.items():
                if not isinstance(k, str):
                    raise ValueError("object keys must be strings")
                check(item)
        elif isinstance(v, list):
            for item in v:
                check(item)
        elif not (v is None or isinstance(v, (str, int))):
            raise ValueError(f"unsupported type {type(v).__name__}")

    check(value)
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def sha256(b: bytes) -> bytes:
    return hashlib.sha256(b).digest()


def leaf_of(record: dict) -> bytes:
    return sha256(b"\x00" + canonical(record))


def root_from_proof(leaf: bytes, proof: list[dict]) -> bytes:
    acc = leaf
    for step in proof:
        sib = bytes.fromhex(step["hash"])
        if step["side"] == "L":
            acc = sha256(b"\x01" + sib + acc)
        elif step["side"] == "R":
            acc = sha256(b"\x01" + acc + sib)
        else:
            raise ValueError("bad proof step")
    return acc


def chain_next(prev: bytes, leaf: bytes) -> bytes:
    return sha256(b"\x02" + prev + leaf)


# ----------------------------------------------------------------- JSON-RPC
class Rpc:
    def __init__(self, url: str, timeout: float = 15.0):
        self.url, self.timeout, self._id = url, timeout, 0

    def call(self, method: str, params: list) -> Any:
        self._id += 1
        body = json.dumps({"jsonrpc": "2.0", "id": self._id, "method": method, "params": params}).encode()
        req = urllib.request.Request(self.url, data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:  # noqa: S310 - auditor-supplied URL
            payload = json.loads(resp.read().decode())
        if "error" in payload:
            raise RuntimeError(f"{method}: {payload['error']}")
        return payload["result"]

    def eth_call(self, to: str, data: bytes) -> bytes:
        res = self.call("eth_call", [{"to": to, "data": "0x" + data.hex()}, "latest"])
        return bytes.fromhex(res[2:])


def selector(signature: str) -> bytes:
    return keccak256(signature.encode())[:4]


def u256(n: int) -> bytes:
    return n.to_bytes(32, "big")


EVENT_TOPIC = "0x" + keccak256(b"BatchAnchored(uint256,bytes32,bytes32,bytes32,uint64,uint64,uint32,address)").hex()


def read_batch(rpc: Rpc, contract: str, batch_id: int) -> dict | None:
    try:
        raw = rpc.eth_call(contract, selector("getBatch(uint256)") + u256(batch_id))
    except RuntimeError:
        return None
    if len(raw) < 32 * 9:
        return None
    w = [raw[32 * i:32 * (i + 1)] for i in range(9)]
    return {
        "merkle_root": w[0].hex(), "chain_head": w[1].hex(), "manifest_hash": w[2].hex(),
        "first_seq": int.from_bytes(w[3], "big"), "last_seq": int.from_bytes(w[4], "big"),
        "event_count": int.from_bytes(w[5], "big"), "anchored_at": int.from_bytes(w[6], "big"),
        "block_number": int.from_bytes(w[7], "big"), "submitter": "0x" + w[8][12:].hex(),
    }


# ----------------------------------------------------------------- verifier
def verify(bundle: dict, rpc_url: str, contract_override: str | None = None) -> dict:
    report: dict[str, Any] = {"bundle_source": bundle.get("source"), "scope": bundle.get("scope"),
                              "warnings": [], "errors": [], "batches": [], "events": [], "missing": [],
                              "uncommitted": []}
    if bundle.get("format") != BUNDLE_FORMAT:
        raise ValueError(f"unsupported bundle format {bundle.get('format')!r}")
    claimed = bundle.get("anchor", {})
    contract = (contract_override or claimed.get("contract_address") or "").lower()
    if contract_override is None:
        report["warnings"].append("contract address taken from the bundle; confirm it out of band")
    elif claimed.get("contract_address", "").lower() != contract:
        report["warnings"].append("bundle names a different contract than --contract; using --contract")

    rpc = Rpc(rpc_url)
    chain_id = int(rpc.call("eth_chainId", []), 16)
    report["chain"] = {"rpc_url": rpc_url, "chain_id": chain_id, "contract": contract,
                       "latest_block": int(rpc.call("eth_blockNumber", []), 16)}
    if claimed.get("chain_id") is not None and int(claimed["chain_id"]) != chain_id:
        report["errors"].append(f"bundle claims chain {claimed['chain_id']} but RPC is chain {chain_id}")
    if rpc.call("eth_getCode", [contract, "latest"]) in ("0x", "0x0", None):
        report["errors"].append("no contract code at the anchor address")
        report["verdict"] = "ERROR"
        return report
    onchain_count = int.from_bytes(rpc.eth_call(contract, selector("batchCount()")), "big")
    report["chain"]["onchain_batch_count"] = onchain_count

    # Batches: on-chain values are authoritative; bundle claims are only compared.
    onchain: dict[int, dict] = {}
    for b in bundle.get("batches", []):
        bid = int(b["batch_id"])
        oc = read_batch(rpc, contract, bid)
        entry: dict[str, Any] = {"batch_id": bid, "status": "VERIFIED", "issues": []}
        if oc is None:
            entry["status"] = "NOT_ON_CHAIN"
            entry["issues"].append("no on-chain commitment for this batch id")
            report["batches"].append(entry)
            continue
        onchain[bid] = oc
        entry["onchain"] = oc
        for key in ("merkle_root", "chain_head", "manifest_hash", "first_seq", "last_seq", "event_count"):
            if str(b.get(key)).lower() != str(oc[key]).lower():
                entry["issues"].append(f"bundle {key} differs from chain (bundle claim ignored)")
        receipt = rpc.call("eth_getTransactionReceipt", [b.get("tx_hash")]) if b.get("tx_hash") else None
        if not receipt:
            entry["issues"].append("anchoring transaction receipt not found")
        else:
            entry["tx_hash"] = b.get("tx_hash")
            ok_status = int(receipt.get("status", "0x0"), 16) == 1
            ok_to = (receipt.get("to") or "").lower() == contract
            ok_block = int(receipt.get("blockNumber", "0x0"), 16) == oc["block_number"]
            ok_log = any(
                (log.get("address") or "").lower() == contract and log.get("topics", [None])[0] == EVENT_TOPIC
                and int(log["topics"][1], 16) == bid and log["topics"][2][2:].lower() == oc["merkle_root"]
                for log in receipt.get("logs", [])
            )
            for ok, msg in ((ok_status, "transaction failed"), (ok_to, "transaction not sent to the contract"),
                            (ok_block, "receipt block differs from commitment"),
                            (ok_log, "receipt lacks the matching BatchAnchored log")):
                if not ok:
                    entry["issues"].append(msg)
        if any("receipt" in i or "transaction" in i for i in entry["issues"]):
            entry["status"] = "RECEIPT_INVALID"
        report["batches"].append(entry)

    if bundle.get("scope") == "full":
        listed = {int(b["batch_id"]) for b in bundle.get("batches", [])}
        for bid in range(onchain_count):
            if bid not in listed:
                oc = read_batch(rpc, contract, bid)
                if oc:
                    onchain[bid] = oc
                report["warnings"].append(f"on-chain batch {bid} is not included in the bundle")
                report["batches"].append({"batch_id": bid, "status": "WITHHELD", "onchain": oc,
                                          "issues": ["committed on-chain but omitted from the bundle"]})

    # Events
    verified_leaves: dict[int, bytes] = {}
    seen: set[int] = set()
    for ev in bundle.get("events", []):
        seq, bid, record = int(ev["seq"]), int(ev["batch_id"]), ev.get("record")
        item: dict[str, Any] = {"seq": seq, "batch_id": bid}
        oc = onchain.get(bid)
        if seq in seen:
            item.update(status="DUPLICATE", reason="sequence number appears twice")
        elif oc is None:
            item.update(status="UNVERIFIABLE", reason="batch has no on-chain commitment")
        elif not isinstance(record, dict) or record.get("seq") != seq:
            item.update(status="TAMPERED", reason="record sequence number does not match its position")
        elif not oc["first_seq"] <= seq <= oc["last_seq"] or int(ev.get("leaf_index", -1)) != seq - oc["first_seq"]:
            item.update(status="TAMPERED", reason="record placed outside its committed range")
        else:
            try:
                leaf = leaf_of(record)
                ok = root_from_proof(leaf, ev.get("proof", [])).hex() == oc["merkle_root"]
            except (ValueError, KeyError, TypeError) as exc:
                ok, leaf = False, None
                item["reason"] = f"cannot evaluate proof: {exc}"
            if ok:
                item["status"] = "VERIFIED"
                verified_leaves[seq] = leaf
            else:
                item.setdefault("reason", "record does not hash to the on-chain Merkle root")
                item["status"] = "TAMPERED"
        seen.add(seq)
        report["events"].append(item)

    # Coverage and hash-chain continuity (full scope only)
    if bundle.get("scope") == "full":
        prev_head = bytes(32)
        for bid in sorted(onchain):
            oc = onchain[bid]
            seqs = range(oc["first_seq"], oc["last_seq"] + 1)
            missing = [s for s in seqs if s not in seen]
            report["missing"].extend({"seq": s, "batch_id": bid, "status": "MISSING"} for s in missing)
            if all(s in verified_leaves for s in seqs):
                head = prev_head
                for s in seqs:
                    head = chain_next(head, verified_leaves[s])
                if head.hex() != oc["chain_head"]:
                    report["errors"].append(f"batch {bid}: hash chain does not reach the committed head")
            prev_head = bytes.fromhex(oc["chain_head"])

    for extra in bundle.get("unanchored_records", []):
        report["uncommitted"].append({"seq": extra.get("seq"), "status": "UNCOMMITTED",
                                      "reason": "no on-chain commitment covers this record"})

    statuses = [e["status"] for e in report["events"]]
    bad_batches = [b for b in report["batches"] if b["status"] not in ("VERIFIED",)]
    report["summary"] = {
        "events_checked": len(statuses),
        "verified": statuses.count("VERIFIED"),
        "tampered": statuses.count("TAMPERED"),
        "duplicate": statuses.count("DUPLICATE"),
        "unverifiable": statuses.count("UNVERIFIABLE"),
        "missing": len(report["missing"]),
        "uncommitted": len(report["uncommitted"]),
        "batches_verified": sum(1 for b in report["batches"] if b["status"] == "VERIFIED"),
        "batches_with_issues": len(bad_batches),
    }
    s = report["summary"]
    if report["errors"] or s["tampered"] or s["duplicate"] or s["missing"] or bad_batches or s["unverifiable"]:
        report["verdict"] = "TAMPERING_DETECTED"
    elif s["uncommitted"]:
        report["verdict"] = "VERIFIED_WITH_UNCOMMITTED_RECORDS"
    else:
        report["verdict"] = "VERIFIED"
    return report


def _print(report: dict) -> None:
    s = report.get("summary", {})
    print("LEASH BLACKBOX independent verification")
    print(f"  chain {report.get('chain', {}).get('chain_id')}  contract {report.get('chain', {}).get('contract')}")
    print(f"  bundle source={report.get('bundle_source')} scope={report.get('scope')}")
    for b in report.get("batches", []):
        print(f"  batch {b['batch_id']:>4}: {b['status']}" + (f"  ({'; '.join(b['issues'])})" if b["issues"] else ""))
    print(f"  events verified {s.get('verified', 0)}/{s.get('events_checked', 0)}, tampered {s.get('tampered', 0)}, "
          f"missing {s.get('missing', 0)}, uncommitted {s.get('uncommitted', 0)}")
    for e in [e for e in report.get("events", []) if e["status"] != "VERIFIED"][:20]:
        print(f"    seq {e['seq']}: {e['status']} - {e.get('reason', '')}")
    for m in report.get("missing", [])[:20]:
        print(f"    seq {m['seq']}: MISSING from bundle (committed in batch {m['batch_id']})")
    for w in report.get("warnings", []):
        print(f"  warning: {w}")
    for err in report.get("errors", []):
        print(f"  error: {err}")
    print(f"VERDICT: {report.get('verdict')}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("bundle", help="evidence bundle JSON exported by LEASH BLACKBOX")
    ap.add_argument("--rpc", default="http://127.0.0.1:8545", help="JSON-RPC endpoint you trust")
    ap.add_argument("--contract", help="anchor contract address obtained out of band")
    ap.add_argument("--json", dest="json_out", help="write the full report as JSON to this path")
    args = ap.parse_args(argv)
    try:
        with open(args.bundle, encoding="utf-8") as fh:
            bundle = json.load(fh)
        report = verify(bundle, args.rpc, args.contract)
    except (OSError, ValueError, RuntimeError, urllib.error.URLError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2)
    _print(report)
    return 0 if report["verdict"].startswith("VERIFIED") else 2


if __name__ == "__main__":
    sys.exit(main())
