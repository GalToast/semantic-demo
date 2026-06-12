Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$source = if ($env:SEMANTIC_AGENT_RUNTIME_KEY_ROUTER_SOURCE) {
    $env:SEMANTIC_AGENT_RUNTIME_KEY_ROUTER_SOURCE
} else {
    "C:/Users/HP/.config/opencode/routers/opencode-key-router.mjs"
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "node was not found on PATH; key router cannot start."
}

if (-not (Test-Path -LiteralPath $source)) {
    throw "key router source was not found: $source"
}

& node $source
