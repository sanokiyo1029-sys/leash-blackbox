"""SHA-256 Merkle tree with domain separation (RFC 6962 style prefixes).

leaf  = SHA256(0x00 || canonical_record_bytes)
node  = SHA256(0x01 || left || right)
An unpaired node at the end of a level is promoted unchanged to the next level
(no duplication, which avoids the CVE-2012-2459 ambiguity).
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

LEAF_PREFIX = b"\x00"
NODE_PREFIX = b"\x01"


def sha256(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()


def leaf_hash(record_bytes: bytes) -> bytes:
    return sha256(LEAF_PREFIX + record_bytes)


def node_hash(left: bytes, right: bytes) -> bytes:
    return sha256(NODE_PREFIX + left + right)


def _next_level(level: list[bytes]) -> list[bytes]:
    out = [node_hash(level[i], level[i + 1]) for i in range(0, len(level) - 1, 2)]
    if len(level) % 2 == 1:
        out.append(level[-1])
    return out


def merkle_root(leaves: list[bytes]) -> bytes:
    if not leaves:
        raise ValueError("cannot build a Merkle tree with no leaves")
    level = list(leaves)
    while len(level) > 1:
        level = _next_level(level)
    return level[0]


@dataclass(frozen=True)
class ProofStep:
    side: str  # "L": sibling is on the left, "R": sibling is on the right
    hash: bytes

    def to_dict(self) -> dict:
        return {"side": self.side, "hash": self.hash.hex()}


def merkle_proof(leaves: list[bytes], index: int) -> list[ProofStep]:
    if not 0 <= index < len(leaves):
        raise IndexError("leaf index out of range")
    proof: list[ProofStep] = []
    level = list(leaves)
    idx = index
    while len(level) > 1:
        if idx % 2 == 1:
            proof.append(ProofStep("L", level[idx - 1]))
        elif idx + 1 < len(level):
            proof.append(ProofStep("R", level[idx + 1]))
        # else: unpaired last node, promoted without a sibling
        level = _next_level(level)
        idx //= 2
    return proof


def root_from_proof(leaf: bytes, proof: list[ProofStep]) -> bytes:
    acc = leaf
    for step in proof:
        if step.side == "L":
            acc = node_hash(step.hash, acc)
        elif step.side == "R":
            acc = node_hash(acc, step.hash)
        else:
            raise ValueError(f"invalid proof side {step.side!r}")
    return acc


def verify_proof(leaf: bytes, proof: list[ProofStep], root: bytes) -> bool:
    return root_from_proof(leaf, proof) == root


def proof_from_dicts(items: list[dict]) -> list[ProofStep]:
    return [ProofStep(str(i["side"]), bytes.fromhex(str(i["hash"]))) for i in items]
