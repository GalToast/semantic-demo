Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $repoRoot "tools/agent-runtime/runtime-topology.json"

function Test-PathStatus {
    param([Parameter(Mandatory=$true)][string]$Path)
    [pscustomobject]@{ path = $Path; exists = Test-Path -LiteralPath $Path }
}

function Redact-CommandLine {
    param([string]$CommandLine)
    if (-not $CommandLine) { return $CommandLine }
    return ($CommandLine `
        -replace '(?i)(api[_-]?key|authorization|bearer|token|secret)=\S+', '$1=<redacted>' `
        -replace '(?i)(Bearer\s+)[A-Za-z0-9._~+/=-]+', '$1<redacted>')
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$paths = @(
    $manifest.current_runtime.external_subagents_mcp.current_source,
    $manifest.current_runtime.local_key_router.current_source,
    $manifest.current_runtime.pi_harness.current_source,
    "C:/Users/HP/.codex/config.toml",
    "C:/Users/HP/.qwen/settings.json",
    "C:/Users/HP/.config/opencode/opencode.json"
) | Sort-Object -Unique

$processPatterns = @(
    "mmx.ts",
    "opencode-key-router.mjs",
    "pi-coding-agent",
    "launch-playwright-mcp.ps1",
    "launch-chrome-devtools-mcp.ps1",
    "searxng-mcp"
)

$processes = Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='bun.exe' OR Name='powershell.exe' OR Name='pwsh.exe'" |
    Where-Object {
        $cmd = $_.CommandLine
        $cmd -and ($processPatterns | Where-Object { $cmd -like "*$_*" })
    } |
    Select-Object ProcessId, ParentProcessId, Name, ExecutablePath,
        @{ Name = "CommandLine"; Expression = { Redact-CommandLine $_.CommandLine } }

[pscustomobject]@{
    manifest = $manifestPath
    path_status = @($paths | ForEach-Object { Test-PathStatus $_ })
    ports = $manifest.current_runtime.local_key_router.ports
    configured_provider_paths = $manifest.current_runtime.local_key_router.configured_provider_paths
    matching_processes = @($processes)
} | ConvertTo-Json -Depth 8
