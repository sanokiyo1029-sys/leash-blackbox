"""Event record schema and conversion between host rows and canonical records."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field, field_validator

from .canonical import canonical_bytes, canonical_json
from .merkle import leaf_hash

SCHEMA_VERSION = 1
SEVERITIES = ("info", "low", "medium", "high", "critical")
RECORD_FIELDS = ("v", "seq", "id", "ts", "host", "source", "type", "severity", "actor", "msg", "attrs")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


class RawEvent(BaseModel):
    """An event as emitted by a host agent, before the collector sequences it."""

    ts: str = Field(min_length=1, max_length=40)
    host: str = Field(min_length=1, max_length=128)
    source: str = Field(min_length=1, max_length=64)
    type: str = Field(min_length=1, max_length=64)
    severity: str
    actor: str = Field(default="-", max_length=128)
    msg: str = Field(max_length=4096)
    attrs: dict[str, str] = Field(default_factory=dict)

    @field_validator("severity")
    @classmethod
    def _sev(cls, v: str) -> str:
        if v not in SEVERITIES:
            raise ValueError(f"severity must be one of {SEVERITIES}")
        return v


def build_record(seq: int, event_id: str, raw: RawEvent) -> dict[str, Any]:
    return {
        "v": SCHEMA_VERSION,
        "seq": seq,
        "id": event_id,
        "ts": raw.ts,
        "host": raw.host,
        "source": raw.source,
        "type": raw.type,
        "severity": raw.severity,
        "actor": raw.actor,
        "msg": raw.msg,
        "attrs": dict(raw.attrs),
    }


def record_leaf(record: dict[str, Any]) -> bytes:
    return leaf_hash(canonical_bytes(record))


def record_to_canonical(record: dict[str, Any]) -> str:
    return canonical_json(record)


def host_columns(record: dict[str, Any]) -> dict[str, Any]:
    """Map a canonical record onto HostEvent columns."""
    return {
        "seq": record["seq"],
        "event_id": record["id"],
        "ts": record["ts"],
        "host": record["host"],
        "source": record["source"],
        "event_type": record["type"],
        "severity": record["severity"],
        "actor": record["actor"],
        "message": record["msg"],
        "attrs_json": json.dumps(record["attrs"], sort_keys=True),
    }


def record_from_host(row: Any) -> dict[str, Any]:
    """Rebuild the canonical record from whatever is currently on the host."""
    try:
        attrs = json.loads(row.attrs_json or "{}")
        if not isinstance(attrs, dict):
            attrs = {"_unparseable": str(row.attrs_json)}
    except (TypeError, ValueError):
        attrs = {"_unparseable": str(row.attrs_json)}
    return {
        "v": SCHEMA_VERSION,
        "seq": row.seq,
        "id": row.event_id,
        "ts": row.ts,
        "host": row.host,
        "source": row.source,
        "type": row.event_type,
        "severity": row.severity,
        "actor": row.actor,
        "msg": row.message,
        "attrs": {str(k): str(v) for k, v in attrs.items()},
    }


def diff_records(expected: dict[str, Any], found: dict[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for key in RECORD_FIELDS:
        if expected.get(key) != found.get(key):
            out[key] = {"expected": expected.get(key), "found": found.get(key)}
    return out
