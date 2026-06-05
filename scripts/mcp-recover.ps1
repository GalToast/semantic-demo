# mcp-recover.ps1
#
# Recovery wrapper for the browser-automation MCPs (chrome-devtools + Playwright).
# Use when MCP tools return "No such tool available" or the browser is wedged
# even though chrome processes are alive. Cleans up stale chrome state on the
# filesystem; the user must restart Claude Code afterwards to respawn the
# MCP node process (Claude Code owns the MCP lifecycle, not this script).
#
# Why this exists: chrome-devtools MCP loses its CDP connection to chrome
# without a built-in reconnect path. The launch scripts already have a
# `-Recover` mode for chrome-devtools and a `CLAUDE_MCP_FORCE_CLEAN_START`
# env var for Playwright, but neither is exposed as a one-line command.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/mcp-recover.ps1
#   # or via npm:
#   npm run mcp:recover
#
# After this runs:
#   1. Restart Claude Code (Ctrl+C, then restart). The MCP node process
#      is respawned on the new Claude Code/Codex launch.
#   2. The first `chrome-devtools` tool call after restart will spawn a
#      fresh chrome instance against the cleaned profile dir.
#
# Exit codes:
#   0  recovery completed (chrome state cleaned); client restart still required
#   1  the chrome-devtools launch script wasn't found (script paths may have changed)
#   2  cleanup reported errors but the worst case is just a stale lock file

$ErrorActionPreference = 'Continue'

$launcherDir = 'C:\Users\HP\.codex\mcp-runtimes'
$chromeDevtoolsLauncher = Join-Path $launcherDir 'launch-chrome-devtools-mcp.ps1'

if (-not (Test-Path -LiteralPath $chromeDevtoolsLauncher -ErrorAction SilentlyContinue)) {
    Write-Host "[recover] FATAL: launch-chrome-devtools-mcp.ps1 not found at $chromeDevtoolsLauncher" -ForegroundColor Red
    Write-Host "[recover] Update this script's path if your mcp_servers dir is elsewhere." -ForegroundColor Red
    exit 1
}

Write-Host "[recover] Step 1/3: chrome-devtools cleanup" -ForegroundColor Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -File $chromeDevtoolsLauncher -Recover
$chromeStep = $LASTEXITCODE
if ($chromeStep -ne 0) {
    Write-Host "[recover] chrome-devtools cleanup exited with code $chromeStep" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[recover] Step 2/3: Playwright MCP cleanup" -ForegroundColor Cyan
Write-Host "[recover] Setting force-clean-start env vars for the next Playwright launch" -ForegroundColor Gray
$legacyPlaywrightRoot = Join-Path $env:LOCALAPPDATA 'ms-playwright'
if (Test-Path -LiteralPath $legacyPlaywrightRoot -ErrorAction SilentlyContinue) {
    Get-ChildItem -LiteralPath $legacyPlaywrightRoot -Directory -Filter 'mcp-chrome-*' -ErrorAction SilentlyContinue | ForEach-Object {
        Get-ChildItem -LiteralPath $_.FullName -Force -Filter 'Singleton*' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    }
}
$profileRoot = Join-Path $launcherDir 'profiles'
if (Test-Path -LiteralPath $profileRoot -ErrorAction SilentlyContinue) {
    Get-ChildItem -LiteralPath $profileRoot -Directory -Filter 'playwright-*' -ErrorAction SilentlyContinue | ForEach-Object {
        Get-ChildItem -LiteralPath $_.FullName -Force -Filter 'Singleton*' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    }
}
$env:CODEX_MCP_CLIENT = 'codex'
$env:CODEX_MCP_FORCE_CLEAN_START = '1'
$env:CODEX_MCP_PROFILE_SCOPE = 'session'
$env:CLAUDE_MCP_FORCE_CLEAN_START = '1'
$env:CLAUDE_MCP_PROFILE_SCOPE = 'session'
$env:CLAUDE_MCP_DRY_RUN = '1'
$env:CODEX_MCP_DRY_RUN = '1'
$playwrightLauncher = Join-Path $launcherDir 'launch-playwright-mcp.ps1'
if (Test-Path -LiteralPath $playwrightLauncher -ErrorAction SilentlyContinue) {
    # Dry-run the Playwright launch with FORCE_CLEAN_START to verify the
    # cleanup config is recognized. The actual cleanup happens on the
    # next MCP launch after Claude Code restart.
    $json = & powershell -NoProfile -ExecutionPolicy Bypass -File $playwrightLauncher 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[recover] Playwright MCP launch config validated" -ForegroundColor Green
    } else {
        Write-Host "[recover] Playwright launch validation failed; check launch-playwright-mcp.ps1 manually" -ForegroundColor Yellow
    }
} else {
    Write-Host "[recover] launch-playwright-mcp.ps1 not found at $playwrightLauncher; skipping" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[recover] Step 3/3: Done. Next: restart Claude Code/Codex." -ForegroundColor Cyan
Write-Host "[recover]   1. Press Ctrl+C in the Claude Code/Codex terminal" -ForegroundColor Gray
Write-Host "[recover]   2. Re-launch Claude Code/Codex from the project dir" -ForegroundColor Gray
Write-Host "[recover]   3. The MCP node processes will respawn automatically" -ForegroundColor Gray
Write-Host "[recover]   4. Your first chrome-devtools tool call will spawn a fresh chrome" -ForegroundColor Gray

if ($chromeStep -ne 0) { exit 2 } else { exit 0 }
