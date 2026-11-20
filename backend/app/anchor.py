"""Anchor service: talks to the LeashAnchor contract over JSON-RPC.

The signing key (or node-managed account) belongs to the anchor service, which
sits outside the monitored host's trust boundary.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from web3 import Web3
from web3.exceptions import ContractCustomError, ContractLogicError, TimeExhausted

from .config import Settings


class AnchorError(RuntimeError):
    """Raised when the chain is unreachable or a transaction fails."""


@dataclass(frozen=True)
class DeployResult:
    address: str
    deployer: str
    chain_id: int
    tx_hash: str
    block_number: int


@dataclass(frozen=True)
class AnchorReceipt:
    batch_id: int
    tx_hash: str
    block_number: int
    block_timestamp: int
    gas_used: int
    latency_ms: int


@dataclass(frozen=True)
class OnChainBatch:
    batch_id: int
    merkle_root: str
    chain_head: str
    manifest_hash: str
    first_seq: int
    last_seq: int
    event_count: int
    anchored_at: int
    block_number: int
    submitter: str

    def to_dict(self) -> dict[str, Any]:
        return self.__dict__.copy()


def _hex32(value: bytes) -> str:
    return bytes(value).hex()


class AnchorClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        artifact = json.loads(Path(settings.contract_artifact).read_text(encoding="utf-8"))
        self.abi = artifact["abi"]
        self.bytecode = artifact["bytecode"]
        self.w3 = Web3(Web3.HTTPProvider(settings.rpc_url, request_kwargs={"timeout": settings.rpc_timeout_s}))
        self._account = None
        if settings.anchor_private_key:
            self._account = self.w3.eth.account.from_key(settings.anchor_private_key)

    # ------------------------------------------------------------------ status
    def is_connected(self) -> bool:
        try:
            return bool(self.w3.is_connected())
        except Exception:  # noqa: BLE001 - any transport error means "not connected"
            return False

    def chain_id(self) -> int:
        return int(self.w3.eth.chain_id)

    def latest_block(self) -> int:
        return int(self.w3.eth.block_number)

    def signer_address(self) -> str:
        if self._account is not None:
            return self._account.address
        accounts = self.w3.eth.accounts
        if not accounts:
            raise AnchorError("node exposes no managed accounts; set LEASH_ANCHOR_PRIVATE_KEY")
        return accounts[0]

    def has_code(self, address: str) -> bool:
        try:
            return len(self.w3.eth.get_code(Web3.to_checksum_address(address))) > 0
        except Exception:  # noqa: BLE001
            return False

    # ------------------------------------------------------------ transactions
    def _send(self, fn_or_ctor, value_from: str) -> dict:
        try:
            if self._account is not None:
                tx = fn_or_ctor.build_transaction({
                    "from": value_from,
                    "nonce": self.w3.eth.get_transaction_count(value_from, "pending"),
                    "chainId": self.chain_id(),
                })
                signed = self._account.sign_transaction(tx)
                tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
            else:
                tx_hash = fn_or_ctor.transact({"from": value_from})
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=self.settings.receipt_timeout_s)
        except (ContractCustomError, ContractLogicError) as exc:
            raise AnchorError(f"contract rejected transaction: {exc}") from exc
        except TimeExhausted as exc:
            raise AnchorError("timed out waiting for transaction receipt") from exc
        except AnchorError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise AnchorError(f"blockchain RPC failure: {exc}") from exc
        if int(receipt["status"]) != 1:
            raise AnchorError(f"transaction {receipt['transactionHash'].hex()} reverted")
        return receipt

    def deploy(self) -> DeployResult:
        sender = self.signer_address()
        factory = self.w3.eth.contract(abi=self.abi, bytecode=self.bytecode)
        receipt = self._send(factory.constructor(), sender)
        return DeployResult(
            address=receipt["contractAddress"],
            deployer=sender,
            chain_id=self.chain_id(),
            tx_hash="0x" + bytes(receipt["transactionHash"]).hex(),
            block_number=int(receipt["blockNumber"]),
        )

    def contract(self, address: str):
        return self.w3.eth.contract(address=Web3.to_checksum_address(address), abi=self.abi)

    def anchor_batch(self, address: str, merkle_root: bytes, chain_head: bytes, manifest_hash: bytes,
                     first_seq: int, last_seq: int, event_count: int) -> AnchorReceipt:
        c = self.contract(address)
        started = time.perf_counter()
        fn = c.functions.anchorBatch(merkle_root, chain_head, manifest_hash, first_seq, last_seq, event_count)
        receipt = self._send(fn, self.signer_address())
        latency_ms = int((time.perf_counter() - started) * 1000)
        logs = c.events.BatchAnchored().process_receipt(receipt)
        if len(logs) != 1:
            raise AnchorError("anchor transaction did not emit exactly one BatchAnchored event")
        args = logs[0]["args"]
        if bytes(args["merkleRoot"]) != merkle_root:
            raise AnchorError("BatchAnchored event root does not match the submitted root")
        block = self.w3.eth.get_block(receipt["blockNumber"])
        return AnchorReceipt(
            batch_id=int(args["batchId"]),
            tx_hash="0x" + bytes(receipt["transactionHash"]).hex(),
            block_number=int(receipt["blockNumber"]),
            block_timestamp=int(block["timestamp"]),
            gas_used=int(receipt["gasUsed"]),
            latency_ms=latency_ms,
        )

    # ------------------------------------------------------------------- reads
    def batch_count(self, address: str) -> int:
        try:
            return int(self.contract(address).functions.batchCount().call())
        except Exception as exc:  # noqa: BLE001
            raise AnchorError(f"cannot read batchCount: {exc}") from exc

    def get_batch(self, address: str, batch_id: int) -> OnChainBatch | None:
        try:
            raw = self.contract(address).functions.getBatch(batch_id).call()
        except (ContractCustomError, ContractLogicError):
            return None
        except Exception as exc:  # noqa: BLE001
            raise AnchorError(f"cannot read batch {batch_id}: {exc}") from exc
        merkle_root, chain_head, manifest_hash, first_seq, last_seq, count, anchored_at, block_number, submitter = raw
        return OnChainBatch(
            batch_id=batch_id,
            merkle_root=_hex32(merkle_root),
            chain_head=_hex32(chain_head),
            manifest_hash=_hex32(manifest_hash),
            first_seq=int(first_seq),
            last_seq=int(last_seq),
            event_count=int(count),
            anchored_at=int(anchored_at),
            block_number=int(block_number),
            submitter=str(submitter),
        )

    def commit_dispute(self, address: str, digest: bytes) -> dict[str, Any]:
        c = self.contract(address)
        receipt = self._send(c.functions.commitDispute(digest), self.signer_address())
        logs = c.events.DisputeCommitted().process_receipt(receipt)
        if len(logs) != 1 or bytes(logs[0]["args"]["digest"]) != digest:
            raise AnchorError("dispute transaction did not emit exactly one matching DisputeCommitted event")
        return {"dispute_id": int(logs[0]["args"]["disputeId"]),
                "tx_hash": "0x" + bytes(receipt["transactionHash"]).hex(),
                "block_number": int(receipt["blockNumber"]), "gas_used": int(receipt["gasUsed"])}

    def get_dispute(self, address: str, dispute_id: int) -> dict[str, Any] | None:
        try:
            raw = self.contract(address).functions.getDispute(dispute_id).call()
        except (ContractCustomError, ContractLogicError):
            return None
        except Exception as exc:  # noqa: BLE001
            raise AnchorError(f"cannot read dispute {dispute_id}: {exc}") from exc
        digest, committed_at, block_number, anchored_batches, submitter = raw
        return {"digest": bytes(digest).hex(), "committed_at": int(committed_at), "block_number": int(block_number),
                "anchored_batches": int(anchored_batches), "submitter": str(submitter)}

    def get_receipt(self, tx_hash: str) -> dict | None:
        try:
            return dict(self.w3.eth.get_transaction_receipt(tx_hash))
        except Exception:  # noqa: BLE001
            return None
