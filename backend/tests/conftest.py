"""Shared fixtures. Integration tests run against a real Hardhat EVM node.

Set LEASH_TEST_RPC_URL to reuse an already running node; otherwise a private
node is started on a free port for the test session.
"""

from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
BACKEND = REPO / "backend"
CHAIN_DIR = REPO / "blockchain"
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(REPO / "verifier"))

from app.config import Settings  # noqa: E402
from app.service import LeashService  # noqa: E402


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _ready(url: str) -> bool:
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "eth_chainId", "params": []}).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=2) as r:
            return "result" in json.loads(r.read())
    except Exception:  # noqa: BLE001
        return False


@pytest.fixture(scope="session")
def rpc_url():
    if os.environ.get("LEASH_TEST_RPC_URL"):
        yield os.environ["LEASH_TEST_RPC_URL"]
        return
    cli = CHAIN_DIR / "node_modules" / "hardhat" / "internal" / "cli" / "cli.js"
    node = shutil.which("node")
    if not cli.exists() or node is None:
        pytest.skip("Hardhat not installed (run `npm install` in blockchain/)")
    port = _free_port()
    url = f"http://127.0.0.1:{port}"
    flags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    proc = subprocess.Popen([node, str(cli), "node", "--hostname", "127.0.0.1", "--port", str(port)],
                            cwd=CHAIN_DIR, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            creationflags=flags)
    deadline = time.time() + 90
    while time.time() < deadline and not _ready(url):
        if proc.poll() is not None:
            pytest.fail("hardhat node exited during startup")
        time.sleep(0.5)
    if not _ready(url):
        proc.kill()
        pytest.fail("hardhat node did not become ready")
    yield url
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"], capture_output=True)
    else:
        proc.terminate()
    proc.wait(timeout=30)


@pytest.fixture()
def settings(tmp_path, rpc_url) -> Settings:
    return Settings(data_dir=tmp_path / "data", rpc_url=rpc_url, receipt_timeout_s=30)


@pytest.fixture()
def svc(settings):
    service = LeashService(settings)
    service.reset()  # fresh stores + freshly deployed contract
    yield service
    service.stores.dispose()


@pytest.fixture()
def offline_settings(tmp_path) -> Settings:
    """Settings pointing at a port where nothing listens."""
    return Settings(data_dir=tmp_path / "offline", rpc_url=f"http://127.0.0.1:{_free_port()}",
                    rpc_timeout_s=1.0, receipt_timeout_s=2.0)
