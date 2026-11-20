"""Forward-linked SHA-256 hash chain over event leaf hashes.

chain_0 = 32 zero bytes (genesis)
chain_n = SHA256(0x02 || chain_{n-1} || leaf_n)

The chain makes every event depend on all earlier events, so a deletion or
edit anywhere breaks every later link. The on-chain anchor stores the chain
head after each batch.
"""

from __future__ import annotations

import hashlib

CHAIN_PREFIX = b"\x02"
GENESIS = bytes(32)


def chain_next(prev: bytes, leaf: bytes) -> bytes:
    if len(prev) != 32 or len(leaf) != 32:
        raise ValueError("chain inputs must be 32-byte digests")
    return hashlib.sha256(CHAIN_PREFIX + prev + leaf).digest()


def chain_over(leaves: list[bytes], start: bytes = GENESIS) -> bytes:
    acc = start
    for leaf in leaves:
        acc = chain_next(acc, leaf)
    return acc
