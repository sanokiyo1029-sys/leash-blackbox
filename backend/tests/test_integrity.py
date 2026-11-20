"""Unit tests for canonicalization, Merkle proofs and the hash chain (no chain needed)."""

from __future__ import annotations

import os
import random

import leash_verify
import pytest

from app.canonical import CanonicalizationError, canonical_json
from app.hashchain import GENESIS, chain_next, chain_over
from app.merkle import (ProofStep, leaf_hash, merkle_proof, merkle_root, node_hash, root_from_proof,
                        verify_proof)
from app.records import RawEvent, build_record, record_leaf


def test_canonical_is_key_order_independent():
    a = {"b": 1, "a": {"y": "2", "x": [1, None, "é"]}}
    b = {"a": {"x": [1, None, "é"], "y": "2"}, "b": 1}
    assert canonical_json(a) == canonical_json(b) == '{"a":{"x":[1,null,"é"],"y":"2"},"b":1}'


@pytest.mark.parametrize("bad", [1.5, True, {"k": False}, {1: "x"}, [float("nan")], 2**60, object()])
def test_canonical_rejects_non_interoperable_values(bad):
    with pytest.raises(CanonicalizationError):
        canonical_json(bad)


def test_single_leaf_root_is_the_leaf():
    leaf = leaf_hash(b"only")
    assert merkle_root([leaf]) == leaf
    assert merkle_proof([leaf], 0) == []


def test_leaf_and_node_domains_are_separated():
    left, right = leaf_hash(b"a"), leaf_hash(b"b")
    # A two-leaf root must not equal the leaf hash of the concatenated leaves.
    assert merkle_root([left, right]) == node_hash(left, right)
    assert merkle_root([left, right]) != leaf_hash(left + right)


@pytest.mark.parametrize("n", list(range(1, 34)) + [64, 100, 257])
def test_every_inclusion_proof_verifies(n):
    leaves = [leaf_hash(os.urandom(16)) for _ in range(n)]
    root = merkle_root(leaves)
    for i in range(n):
        proof = merkle_proof(leaves, i)
        assert verify_proof(leaves[i], proof, root)
        # Proof for one leaf must not validate a different leaf
        if n > 1:
            assert not verify_proof(leaves[(i + 1) % n], proof, root)


def test_tampered_proof_or_leaf_fails():
    leaves = [leaf_hash(bytes([i])) for i in range(9)]
    root = merkle_root(leaves)
    proof = merkle_proof(leaves, 4)
    bad_leaf = bytearray(leaves[4])
    bad_leaf[-1] ^= 1
    assert not verify_proof(bytes(bad_leaf), proof, root)
    flipped = [ProofStep("R" if s.side == "L" else "L", s.hash) for s in proof]
    assert not verify_proof(leaves[4], flipped, root)
    assert not verify_proof(leaves[4], proof[:-1], root)


def test_reordering_leaves_changes_root():
    leaves = [leaf_hash(bytes([i])) for i in range(6)]
    swapped = leaves[:]
    swapped[1], swapped[2] = swapped[2], swapped[1]
    assert merkle_root(leaves) != merkle_root(swapped)


def test_hash_chain_detects_any_change():
    leaves = [leaf_hash(bytes([i])) for i in range(10)]
    head = chain_over(leaves)
    assert chain_over(leaves[:5] + leaves[6:]) != head  # deletion
    assert chain_over(leaves[::-1]) != head  # reordering
    assert chain_next(GENESIS, leaves[0]) == chain_over(leaves[:1])
    with pytest.raises(ValueError):
        chain_next(b"short", leaves[0])


def _random_record(rng: random.Random, seq: int) -> dict:
    raw = RawEvent(ts=f"2026-11-20T10:00:{seq % 60:02d}.000Z", host="h", source=rng.choice(["sshd", "nginx"]),
                   type="t", severity=rng.choice(["info", "high"]), actor="ünïcødé-✓",
                   msg="quote \" backslash \\ newline \n tab \t", attrs={"z": "1", "a": str(seq)})
    return build_record(seq, f"id-{seq}", raw)


def test_backend_and_standalone_verifier_agree():
    """Two independent implementations must derive identical leaves, roots and chains."""
    rng = random.Random(7)
    records = [_random_record(rng, i + 1) for i in range(37)]
    backend_leaves = [record_leaf(r) for r in records]
    verifier_leaves = [leash_verify.leaf_of(r) for r in records]
    assert backend_leaves == verifier_leaves
    root = merkle_root(backend_leaves)
    for i, leaf in enumerate(backend_leaves):
        proof = [s.to_dict() for s in merkle_proof(backend_leaves, i)]
        assert leash_verify.root_from_proof(leaf, proof) == root
        assert root_from_proof(leaf, merkle_proof(backend_leaves, i)) == root
    head_backend = chain_over(backend_leaves)
    head_verifier = GENESIS
    for leaf in verifier_leaves:
        head_verifier = leash_verify.chain_next(head_verifier, leaf)
    assert head_backend == head_verifier


def test_verifier_keccak_vectors():
    assert leash_verify.keccak256(b"").hex() == "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
    assert leash_verify.keccak256(b"abc").hex() == "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45"
    assert leash_verify.selector("transfer(address,uint256)").hex() == "a9059cbb"
