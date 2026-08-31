Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$server = Join-Path $PSScriptRoot "index.mjs"
if (-not (Test-Path -LiteralPath $server)) {
    throw "NVIDIA capabilities MCP server not found: $server"
}

& node $server
