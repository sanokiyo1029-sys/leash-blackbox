<#
.SYNOPSIS
  One-command local start for the LEASH BLACKBOX demo (Windows PowerShell 5.1+).

.DESCRIPTION
  Starts the Hardhat chain (:8545), the FastAPI backend (:8000) and the Next.js console (:3000),
  waits until each one answers, resets the demo stores for the fresh chain and seeds traffic.
  Ctrl+C stops everything this script started. It never stops a process it did not start.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\start-all.ps1          # production build of the console
  powershell -ExecutionPolicy Bypass -File scripts\start-all.ps1 -Dev     # next dev (no build step)
  powershell -ExecutionPolicy Bypass -File scripts\start-all.ps1 -NoSeed  # start with an empty lab
  powershell -ExecutionPolicy Bypass -File scripts\start-all.ps1 -Stop    # stop services left by a closed window
#>
param([switch]$Dev, [switch]$NoSeed, [switch]$Stop)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $root "logs"
$pidFile = Join-Path $logs "pids.json"
$python = Join-Path $root "backend\.venv\Scripts\python.exe"
$next = "node_modules\next\dist\bin\next"
$script:started = @()

function Stop-Ours {
  if (-not (Test-Path $pidFile)) { return }
  foreach ($p in (Get-Content $pidFile -Raw | ConvertFrom-Json)) {
    $proc = Get-Process -Id $p.pid -ErrorAction SilentlyContinue
    # Start time must match too, so a reused PID never takes down an unrelated program.
    if ($proc -and $proc.StartTime.Ticks -eq $p.start) {
      Write-Host "Stopping $($p.name) (pid $($p.pid))"
      & taskkill.exe /PID $p.pid /T /F | Out-Null
    }
  }
  Remove-Item $pidFile -ErrorAction SilentlyContinue
}

function Start-Leash($name, $file, $argList, $cwd) {
  $p = Start-Process -FilePath $file -ArgumentList $argList -WorkingDirectory $cwd -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $logs "$name.log") -RedirectStandardError (Join-Path $logs "$name.err.log")
  $script:started += [pscustomobject]@{ name = $name; pid = $p.Id; start = $p.StartTime.Ticks }
  ConvertTo-Json -InputObject @($script:started) | Set-Content $pidFile
  return $p
}

function Fail($name, $why) {
  Write-Host ""
  Write-Host "$name $why. Last log lines (logs\$name*.log):" -ForegroundColor Red
  foreach ($f in "$name.log", "$name.err.log") {
    $path = Join-Path $logs $f
    if (Test-Path $path) { Get-Content $path -Tail 15 | ForEach-Object { Write-Host "  $_" } }
  }
  throw "$name failed"
}

function Wait-Ready($name, $proc, [scriptblock]$probe, $timeoutSec) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    if ($proc.HasExited) { Fail $name "exited with code $($proc.ExitCode)" }
    try { & $probe | Out-Null; Write-Host "  ready  $name"; return } catch { Start-Sleep -Milliseconds 500 }
  }
  Fail $name "did not answer within $timeoutSec s"
}

if ($Stop) { Stop-Ours; Write-Host "Stopped."; exit 0 }

# ---------------------------------------------------------------- prerequisites
$problems = @()
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { $problems += "Node.js 20+ is not on PATH (https://nodejs.org)" }
if (-not (Test-Path $python)) { $problems += "Backend venv missing: python -m venv backend\.venv; backend\.venv\Scripts\python -m pip install -r backend\requirements.txt" }
if (-not (Test-Path (Join-Path $root "blockchain\node_modules\hardhat"))) { $problems += "Blockchain packages missing: cd blockchain; npm install" }
if (-not (Test-Path (Join-Path $root "frontend\node_modules\next"))) { $problems += "Frontend packages missing: cd frontend; npm install" }
foreach ($port in 8545, 8000, 3000) {
  $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) {
    $owner = (Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue).ProcessName
    $problems += "Port $port is already used by $owner (pid $($c.OwningProcess)). If it is from an earlier start, run this script with -Stop; otherwise close that program."
  }
}
if ($problems) {
  Write-Host "Cannot start LEASH BLACKBOX:" -ForegroundColor Red
  $problems | ForEach-Object { Write-Host "  - $_" }
  exit 1
}

New-Item -ItemType Directory -Force $logs | Out-Null
try {
  Write-Host "Starting LEASH BLACKBOX (logs in logs\)"
  $chain = Start-Leash "chain" "node" @("node_modules\hardhat\internal\cli\cli.js", "node", "--hostname", "127.0.0.1", "--port", "8545") (Join-Path $root "blockchain")
  Wait-Ready "chain" $chain {
    Invoke-RestMethod -Uri "http://127.0.0.1:8545" -Method Post -ContentType "application/json" -TimeoutSec 2 `
      -Body '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
  } 90

  $api = Start-Leash "api" $python @("-m", "uvicorn", "app.main:create_app", "--factory", "--host", "127.0.0.1", "--port", "8000") (Join-Path $root "backend")
  Wait-Ready "api" $api { Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/health" -TimeoutSec 2 } 60

  # The chain is in memory and starts empty, so the stores are reset to match a freshly deployed contract.
  Write-Host "Resetting demo stores and deploying a fresh LeashAnchor contract"
  $reset = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8000/api/demo/reset"
  Write-Host "  contract $($reset.deployment.contract_address)"
  if (-not $NoSeed) {
    $seed = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8000/api/simulate/traffic" -ContentType "application/json" -Body '{"count":120,"include_intrusion":true}'
    if ($seed.anchor_error) { throw "Seeding traffic could not anchor: $($seed.anchor_error)" }
    Write-Host "  seeded $($seed.ingested) events, $(@($seed.batches).Count) batch(es) anchored"
  }

  $frontend = Join-Path $root "frontend"
  if ($Dev) {
    $web = Start-Leash "web" "node" @($next, "dev", "--port", "3000") $frontend
  } else {
    Write-Host "Building the web console (use -Dev to skip the build)"
    $build = Start-Process -FilePath "node" -ArgumentList @($next, "build") -WorkingDirectory $frontend -WindowStyle Hidden -PassThru -Wait `
      -RedirectStandardOutput (Join-Path $logs "web-build.log") -RedirectStandardError (Join-Path $logs "web-build.err.log")
    if ($build.ExitCode -ne 0) { Fail "web-build" "failed with exit code $($build.ExitCode)" }
    $web = Start-Leash "web" "node" @($next, "start", "--port", "3000") $frontend
  }
  Wait-Ready "web" $web { Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 60 } 180

  Write-Host ""
  Write-Host "LEASH BLACKBOX is running" -ForegroundColor Green
  Write-Host "  Web console   http://localhost:3000        guided demo: http://localhost:3000/demo"
  Write-Host "  API + docs    http://127.0.0.1:8000/docs"
  Write-Host "  Chain RPC     http://127.0.0.1:8545        chain id 31337"
  Write-Host ""
  Write-Host "Press Ctrl+C to stop all three services."
  Write-Host "If this window is closed instead, run: powershell -ExecutionPolicy Bypass -File scripts\start-all.ps1 -Stop"
  while ($true) {
    foreach ($s in @(@("chain", $chain), @("api", $api), @("web", $web))) {
      if ($s[1].HasExited) { Fail $s[0] "stopped unexpectedly (exit code $($s[1].ExitCode))" }
    }
    Start-Sleep -Seconds 2
  }
} finally {
  Stop-Ours
}
