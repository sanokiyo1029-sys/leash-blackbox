"""Physically separate SQLite stores for each trust zone.

host_logs.db  - the monitored host's local log store (attacker can modify it)
evidence.db   - protected evidence vault, batches, deployments, reports
lab.db        - attack-lab ground truth (scoring only; the verifier never reads it)
witness.db    - GHOST witness observations, signed by the witness (outside the host's reach)
"""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from sqlalchemy import Boolean, Integer, String, Text, create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from .config import Settings


# --------------------------------------------------------------------------- host
class HostBase(DeclarativeBase):
    pass


class HostEvent(HostBase):
    """A log record as kept on the monitored host."""

    __tablename__ = "host_events"

    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    event_id: Mapped[str] = mapped_column(String(64))
    ts: Mapped[str] = mapped_column(String(40))
    host: Mapped[str] = mapped_column(String(128))
    source: Mapped[str] = mapped_column(String(64))
    event_type: Mapped[str] = mapped_column(String(64))
    severity: Mapped[str] = mapped_column(String(16))
    actor: Mapped[str] = mapped_column(String(128))
    message: Mapped[str] = mapped_column(Text)
    attrs_json: Mapped[str] = mapped_column(Text, default="{}")


# -------------------------------------------------------------------------- vault
class VaultBase(DeclarativeBase):
    pass


class VaultEvent(VaultBase):
    """Canonical copy of every event, captured at ingest time. Append-only."""

    __tablename__ = "vault_events"

    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    event_id: Mapped[str] = mapped_column(String(64), unique=True)
    canonical_json: Mapped[str] = mapped_column(Text)
    leaf_hash: Mapped[str] = mapped_column(String(64))
    prev_chain_hash: Mapped[str] = mapped_column(String(64))
    chain_hash: Mapped[str] = mapped_column(String(64))
    ingested_at: Mapped[str] = mapped_column(String(40))
    batch_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    leaf_index: Mapped[int | None] = mapped_column(Integer, nullable=True)


class WitnessRegistration(VaultBase):
    """Witness identities the verifier accepts. Kept in the vault, not in the witness's own store."""

    __tablename__ = "witness_registry"

    witness_id: Mapped[str] = mapped_column(String(42), primary_key=True)  # signer address
    role: Mapped[str] = mapped_column(String(32))
    registered_at: Mapped[str] = mapped_column(String(40))


class Heartbeat(VaultBase):
    """A signed host heartbeat as received by the collector. `received_at` is the collector's clock. Append-only."""

    __tablename__ = "heartbeats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    host: Mapped[str] = mapped_column(String(128), index=True)
    claim_json: Mapped[str] = mapped_column(Text)
    signature: Mapped[str] = mapped_column(String(132))
    received_at: Mapped[str] = mapped_column(String(40))


class Dispute(VaultBase):
    """An off-chain dispute package whose SHA-256 is committed on-chain (LeashAnchor.commitDispute). Append-only."""

    __tablename__ = "disputes"

    dispute_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)  # the on-chain id
    deployment_id: Mapped[int] = mapped_column(Integer)
    digest: Mapped[str] = mapped_column(String(64))
    package_json: Mapped[str] = mapped_column(Text)  # canonical JSON, exactly the hashed bytes
    tx_hash: Mapped[str] = mapped_column(String(66))
    block_number: Mapped[int] = mapped_column(Integer)
    gas_used: Mapped[int] = mapped_column(Integer)
    committed_at: Mapped[str] = mapped_column(String(40))


class Batch(VaultBase):
    __tablename__ = "batches"

    batch_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    deployment_id: Mapped[int] = mapped_column(Integer)
    first_seq: Mapped[int] = mapped_column(Integer)
    last_seq: Mapped[int] = mapped_column(Integer)
    event_count: Mapped[int] = mapped_column(Integer)
    merkle_root: Mapped[str] = mapped_column(String(64))
    prev_chain_head: Mapped[str] = mapped_column(String(64))
    chain_head: Mapped[str] = mapped_column(String(64))
    manifest_json: Mapped[str] = mapped_column(Text)
    manifest_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16))  # pending | anchored | failed
    sealed_at: Mapped[str] = mapped_column(String(40))
    tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True)
    block_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    block_timestamp: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gas_used: Mapped[int | None] = mapped_column(Integer, nullable=True)
    anchored_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    anchor_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)


class Deployment(VaultBase):
    __tablename__ = "deployments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    chain_id: Mapped[int] = mapped_column(Integer)
    contract_address: Mapped[str] = mapped_column(String(42))
    deployer: Mapped[str] = mapped_column(String(42))
    tx_hash: Mapped[str] = mapped_column(String(66))
    block_number: Mapped[int] = mapped_column(Integer)
    deployed_at: Mapped[str] = mapped_column(String(40))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class VerificationRun(VaultBase):
    __tablename__ = "verification_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    verified_at: Mapped[str] = mapped_column(String(40))
    duration_ms: Mapped[int] = mapped_column(Integer)
    verdict: Mapped[str] = mapped_column(String(32))
    summary_json: Mapped[str] = mapped_column(Text)
    report_json: Mapped[str] = mapped_column(Text)


# ---------------------------------------------------------------------------- lab
class LabBase(DeclarativeBase):
    pass


class AttackAction(LabBase):
    """Ground-truth record of what the simulated attacker did to the host store."""

    __tablename__ = "attack_actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    performed_at: Mapped[str] = mapped_column(String(40))
    scenario: Mapped[str] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(16))  # modify | delete | inject
    seq: Mapped[int] = mapped_column(Integer)
    detail_json: Mapped[str] = mapped_column(Text, default="{}")


# ------------------------------------------------------------------------ witness
class WitnessBase(DeclarativeBase):
    pass


class WitnessObservation(WitnessBase):
    """One signed claim by an independent witness. Append-only."""

    __tablename__ = "witness_observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    obs_id: Mapped[str] = mapped_column(String(64), unique=True)
    witness_id: Mapped[str] = mapped_column(String(42))
    claim_json: Mapped[str] = mapped_column(Text)  # canonical JSON, exactly the signed bytes
    signature: Mapped[str] = mapped_column(String(132))
    recorded_at: Mapped[str] = mapped_column(String(40))


WITNESS_TRIGGERS = [
    """
    CREATE TRIGGER IF NOT EXISTS witness_no_delete
    BEFORE DELETE ON witness_observations
    BEGIN SELECT RAISE(ABORT, 'witness store is append-only'); END;
    """,
    """
    CREATE TRIGGER IF NOT EXISTS witness_no_update
    BEFORE UPDATE ON witness_observations
    BEGIN SELECT RAISE(ABORT, 'witness store is append-only'); END;
    """,
]


# Append-only enforcement inside the vault database. The application never
# issues UPDATE/DELETE on evidence, except assigning an event to a batch once.
VAULT_TRIGGERS = [
    """
    CREATE TRIGGER IF NOT EXISTS vault_events_no_delete
    BEFORE DELETE ON vault_events
    BEGIN SELECT RAISE(ABORT, 'evidence vault is append-only'); END;
    """,
    """
    CREATE TRIGGER IF NOT EXISTS vault_events_no_rewrite
    BEFORE UPDATE ON vault_events
    WHEN NEW.seq IS NOT OLD.seq
      OR NEW.event_id IS NOT OLD.event_id
      OR NEW.canonical_json IS NOT OLD.canonical_json
      OR NEW.leaf_hash IS NOT OLD.leaf_hash
      OR NEW.prev_chain_hash IS NOT OLD.prev_chain_hash
      OR NEW.chain_hash IS NOT OLD.chain_hash
      OR NEW.ingested_at IS NOT OLD.ingested_at
      OR (OLD.batch_id IS NOT NULL AND NEW.batch_id IS NOT OLD.batch_id)
      OR (OLD.leaf_index IS NOT NULL AND NEW.leaf_index IS NOT OLD.leaf_index)
    BEGIN SELECT RAISE(ABORT, 'evidence vault is append-only'); END;
    """,
    """
    CREATE TRIGGER IF NOT EXISTS heartbeats_no_update
    BEFORE UPDATE ON heartbeats
    BEGIN SELECT RAISE(ABORT, 'heartbeats are append-only'); END;
    """,
    """
    CREATE TRIGGER IF NOT EXISTS heartbeats_no_delete
    BEFORE DELETE ON heartbeats
    BEGIN SELECT RAISE(ABORT, 'heartbeats are append-only'); END;
    """,
    """
    CREATE TRIGGER IF NOT EXISTS disputes_no_update
    BEFORE UPDATE ON disputes
    BEGIN SELECT RAISE(ABORT, 'dispute packages are append-only'); END;
    """,
    """
    CREATE TRIGGER IF NOT EXISTS disputes_no_delete
    BEFORE DELETE ON disputes
    BEGIN SELECT RAISE(ABORT, 'dispute packages are append-only'); END;
    """,
    """
    CREATE TRIGGER IF NOT EXISTS batches_no_delete
    BEFORE DELETE ON batches
    BEGIN SELECT RAISE(ABORT, 'batch records are append-only'); END;
    """,
    """
    CREATE TRIGGER IF NOT EXISTS batches_freeze_anchored
    BEFORE UPDATE ON batches
    WHEN OLD.status = 'anchored'
    BEGIN SELECT RAISE(ABORT, 'anchored batches are immutable'); END;
    """,
]


def _sqlite_engine(path: Path) -> Engine:
    path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        f"sqlite:///{path.as_posix()}",
        connect_args={"check_same_thread": False, "timeout": 30},
        future=True,
    )

    @event.listens_for(engine, "connect")
    def _pragmas(dbapi_conn, _record):  # pragma: no cover - trivial
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA synchronous=FULL")
        cur.close()

    return engine


class Stores:
    """Owns the three databases. Each trust zone gets its own engine and file."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self._open()

    def _open(self) -> None:
        s = self.settings
        self.host_engine = _sqlite_engine(s.host_db_path)
        self.vault_engine = _sqlite_engine(s.vault_db_path)
        self.lab_engine = _sqlite_engine(s.lab_db_path)
        self.witness_engine = _sqlite_engine(s.witness_db_path)
        self._create_schemas()
        self._host = sessionmaker(self.host_engine, expire_on_commit=False)
        self._vault = sessionmaker(self.vault_engine, expire_on_commit=False)
        self._lab = sessionmaker(self.lab_engine, expire_on_commit=False)
        self._witness = sessionmaker(self.witness_engine, expire_on_commit=False)

    def _schemas(self):
        return ((self.host_engine, HostBase), (self.vault_engine, VaultBase), (self.lab_engine, LabBase),
                (self.witness_engine, WitnessBase))

    def _create_schemas(self) -> None:
        for engine, base in self._schemas():
            base.metadata.create_all(engine)
        with self.vault_engine.begin() as conn:
            for ddl in VAULT_TRIGGERS:
                conn.execute(text(ddl))
        with self.witness_engine.begin() as conn:
            for ddl in WITNESS_TRIGGERS:
                conn.execute(text(ddl))

    def dispose(self) -> None:
        for engine, _ in self._schemas():
            engine.dispose()

    def wipe(self) -> None:
        """Demo reset: empty every store in place (drop its tables, with their triggers, and recreate them).

        The files are not deleted: on Windows a connection opened by a request arriving mid-reset (the UI polls
        /api/status) locks the file, and a delete then fails halfway and leaves the stores broken.
        This is an operator action on the whole lab, not something the simulated attacker can do to the vault.
        """
        for engine, base in self._schemas():
            base.metadata.drop_all(engine)
        self._create_schemas()

    @contextmanager
    def host(self) -> Iterator[Session]:
        with self._host() as session, session.begin():
            yield session

    @contextmanager
    def vault(self) -> Iterator[Session]:
        with self._vault() as session, session.begin():
            yield session

    @contextmanager
    def witness(self) -> Iterator[Session]:
        with self._witness() as session, session.begin():
            yield session

    @contextmanager
    def lab(self) -> Iterator[Session]:
        with self._lab() as session, session.begin():
            yield session
