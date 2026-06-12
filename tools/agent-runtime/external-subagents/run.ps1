Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$defaultSource = "C:/Users/HP/repos/opencode/packages/opencode/src/mcp/mmx.ts"
$source = if ($env:SEMANTIC_AGENT_RUNTIME_MMX_SOURCE) { $env:SEMANTIC_AGENT_RUNTIME_MMX_SOURCE } else { $defaultSource }

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    throw "bun was not found on PATH; external-subagents MCP cannot start."
}

if (-not (Test-Path -LiteralPath $source)) {
    throw "external-subagents MCP source was not found: $source"
}

& bun run --conditions=browser $source
