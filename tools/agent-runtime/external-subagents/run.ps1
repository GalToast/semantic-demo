Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    throw "node was not found on PATH; external-subagents MCP cannot start."
}

$repoRoot = "C:/Users/HP/harness/servers/external-subagents"
$dist = Join-Path (Join-Path $repoRoot "dist") "mmx.js"
$tsconfig = Join-Path $repoRoot "tsconfig.json"

if (-not (Test-Path -LiteralPath $dist)) {
    $tsc = Get-Command npx -ErrorAction SilentlyContinue
    if (-not $tsc) {
        throw "compiled dist/mmx.js is missing and npx is not available to build it."
    }
    & npx tsc --project $tsconfig
    if (-not (Test-Path -LiteralPath $dist)) {
        throw "external-subagents MCP build failed; dist/mmx.js still missing."
    }
}

& node $dist
