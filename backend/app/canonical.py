"""Deterministic canonical JSON for security event records.

The canonical form is a strict subset of RFC 8785 (JCS): object keys sorted by
code point, no insignificant whitespace, UTF-8 output, and only strings,
integers, lists, objects and null as values. Floats and booleans are rejected
so that every independent implementation (Python, TypeScript, auditors' own
tools) produces byte-identical output without needing JCS number formatting.
"""

from __future__ import annotations

import json
from typing import Any

MAX_SAFE_INT = 2**53 - 1


class CanonicalizationError(ValueError):
    """Raised when a value cannot be represented in the canonical subset."""


def _check(value: Any, path: str) -> None:
    if value is None or isinstance(value, str):
        return
    if isinstance(value, bool):
        raise CanonicalizationError(f"{path}: booleans are not allowed; encode as string")
    if isinstance(value, int):
        if abs(value) > MAX_SAFE_INT:
            raise CanonicalizationError(f"{path}: integer outside the interoperable range")
        return
    if isinstance(value, float):
        raise CanonicalizationError(f"{path}: floats are not allowed; encode as string")
    if isinstance(value, list):
        for i, item in enumerate(value):
            _check(item, f"{path}[{i}]")
        return
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                raise CanonicalizationError(f"{path}: object keys must be strings")
            _check(item, f"{path}.{key}")
        return
    raise CanonicalizationError(f"{path}: unsupported type {type(value).__name__}")


def canonical_json(value: Any) -> str:
    _check(value, "$")
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def canonical_bytes(value: Any) -> bytes:
    return canonical_json(value).encode("utf-8")
