param(
    [ValidateSet("status", "start", "stop", "restart")]
    [string]$Action = "status",
    [string]$Source = $env:SEMANTIC_AGENT_RUNTIME_KEY_ROUTER_SOURCE,
    [int]$Port = 8788,
    [int]$HealthTimeoutSeconds = 10
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $scriptDir))
$logDir = Join-Path $repoRoot ".opencode\router"
$stdoutLog = Join-Path $logDir "key-router.stdout.log"
$stderrLog = Join-Path $logDir "key-router.stderr.log"
$pidFile = Join-Path $logDir "key-router.pid"

if (-not $Source) {
    $Source = "C:/Users/HP/.config/opencode/routers/opencode-key-router.mjs"
}

function Get-NodeCommand {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
        throw "node was not found on PATH; key router cannot start."
    }
    return $node.Source
}

function Get-RouterPids {
    $connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    $connections |
        Where-Object { $_.OwningProcess -gt 0 } |
        Select-Object -ExpandProperty OwningProcess -Unique
}

function Get-RouterHealth {
    try {
        Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 3
    } catch {
        $null
    }
}

function Wait-RouterHealth {
    $deadline = (Get-Date).AddSeconds($HealthTimeoutSeconds)
    do {
        $health = Get-RouterHealth
        if ($health) { return $health }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)
    return $null
}

function Write-Status {
    $pids = @(Get-RouterPids)
    $health = Get-RouterHealth
    [pscustomobject]@{
        port = $Port
        pids = $pids
        running = $pids.Count -gt 0
        healthy = [bool]$health
        health = $health
        source = $Source
        stdout_log = $stdoutLog
        stderr_log = $stderrLog
    } | ConvertTo-Json -Depth 8
}

function Start-Router {
    if (-not (Test-Path -LiteralPath $Source)) {
        throw "key router source was not found: $Source"
    }

    $existing = @(Get-RouterPids)
    if ($existing.Count -gt 0) {
        Write-Status
        return
    }

    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $node = Get-NodeCommand
    $process = Start-Process -FilePath $node `
        -ArgumentList @($Source) `
        -WorkingDirectory (Split-Path -Parent $Source) `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog `
        -PassThru
    Set-Content -LiteralPath $pidFile -Value $process.Id -Encoding ASCII

    $health = Wait-RouterHealth
    if (-not $health) {
        throw "key router started as PID $($process.Id), but /health on port $Port did not become ready within $HealthTimeoutSeconds seconds. See $stderrLog"
    }
    Write-Status
}

function Stop-Router {
    $pids = @(Get-RouterPids)
    foreach ($pid in $pids) {
        Stop-Process -Id $pid -ErrorAction Stop
    }
    Write-Status
}

switch ($Action) {
    "status" { Write-Status }
    "start" { Start-Router }
    "stop" { Stop-Router }
    "restart" {
        Stop-Router | Out-Null
        Start-Router
    }
}
