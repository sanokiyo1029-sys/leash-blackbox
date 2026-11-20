import { defineConfig } from "@playwright/test";
import os from "node:os";
import path from "node:path";

// End-to-end smoke tests run against a private stack on non-default ports:
// Hardhat node :8546 -> FastAPI :8011 -> Next.js production server :3011.
const CHAIN = "http://127.0.0.1:8546";
const API = "http://127.0.0.1:8011";
const WEB = "http://localhost:3011";
const python =
  process.env.LEASH_PYTHON ??
  (process.platform === "win32" ? path.join("..", "backend", ".venv", "Scripts", "python.exe") : "../backend/.venv/bin/python");
const dataDir = path.join(os.tmpdir(), `leash-e2e-${Date.now()}`);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: WEB,
    // Uses the locally installed Microsoft Edge (no browser download). Set PW_CHANNEL=chromium to use Playwright's own.
    channel: process.env.PW_CHANNEL ?? "msedge",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node node_modules/hardhat/internal/cli/cli.js node --hostname 127.0.0.1 --port 8546",
      cwd: "../blockchain",
      url: CHAIN,
      timeout: 90_000,
      reuseExistingServer: false,
    },
    {
      command: `"${python}" -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8011`,
      cwd: "../backend",
      url: `${API}/api/health`,
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        LEASH_RPC_URL: CHAIN,
        LEASH_DATA_DIR: dataDir,
        LEASH_CORS_ORIGINS: `${WEB},http://127.0.0.1:3011`,
      },
    },
    {
      command: "npx next build && npx next start --port 3011",
      url: WEB,
      timeout: 180_000,
      reuseExistingServer: false,
      env: { NEXT_PUBLIC_LEASH_API_URL: API },
    },
  ],
});

