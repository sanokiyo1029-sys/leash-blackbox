"""Runtime configuration, read from environment variables (see .env.example)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    data_dir: Path = field(default_factory=lambda: REPO_ROOT / "data")
    rpc_url: str = "http://127.0.0.1:8545"
    # Optional. When unset, the anchor service uses the first account managed by
    # the local development node (Hardhat). Never commit a real key.
    anchor_private_key: str | None = None
    contract_artifact: Path = field(default_factory=lambda: REPO_ROOT / "shared" / "LeashAnchor.json")
    max_batch_size: int = 256
    rpc_timeout_s: float = 10.0
    receipt_timeout_s: float = 60.0
    cors_origins: tuple[str, ...] = ("http://localhost:3000", "http://127.0.0.1:3000")
    # Lab endpoints (reset, synthetic traffic, attack simulation) are for demos only.
    # Set LEASH_DEMO_MODE=0 to refuse them; verification and read endpoints stay available.
    demo_mode: bool = True

    @property
    def host_db_path(self) -> Path:
        """Monitored host's local log store: INSIDE the attacker's reach."""
        return self.data_dir / "host" / "host_logs.db"

    @property
    def vault_db_path(self) -> Path:
        """Protected evidence vault + anchor bookkeeping: OUTSIDE the attacker's reach."""
        return self.data_dir / "vault" / "evidence.db"

    @property
    def lab_db_path(self) -> Path:
        """Attack-lab ground truth, used only to score detection, never by the verifier."""
        return self.data_dir / "lab" / "lab.db"


def load_settings() -> Settings:
    env = os.environ
    kwargs: dict = {}
    if env.get("LEASH_DATA_DIR"):
        kwargs["data_dir"] = Path(env["LEASH_DATA_DIR"])
    if env.get("LEASH_RPC_URL"):
        kwargs["rpc_url"] = env["LEASH_RPC_URL"]
    if env.get("LEASH_ANCHOR_PRIVATE_KEY"):
        kwargs["anchor_private_key"] = env["LEASH_ANCHOR_PRIVATE_KEY"]
    if env.get("LEASH_CONTRACT_ARTIFACT"):
        kwargs["contract_artifact"] = Path(env["LEASH_CONTRACT_ARTIFACT"])
    if env.get("LEASH_MAX_BATCH_SIZE"):
        kwargs["max_batch_size"] = int(env["LEASH_MAX_BATCH_SIZE"])
    if env.get("LEASH_DEMO_MODE"):
        kwargs["demo_mode"] = env["LEASH_DEMO_MODE"].strip().lower() not in ("0", "false", "no", "off")
    if env.get("LEASH_CORS_ORIGINS"):
        kwargs["cors_origins"] = tuple(o.strip() for o in env["LEASH_CORS_ORIGINS"].split(",") if o.strip())
    return Settings(**kwargs)
