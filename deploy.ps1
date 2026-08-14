param(
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Load .env if present (does not override existing environment variables).
# ---------------------------------------------------------------------------
$envFile = Join-Path $PSScriptRoot ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq '' -or $line.StartsWith('#')) { return }
        if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
            $key = $Matches[1]
            $val = $Matches[2]
            if (-not [Environment]::GetEnvironmentVariable($key)) {
                [Environment]::SetEnvironmentVariable($key, $val, "Process")
            }
        }
    }
}

# ---------------------------------------------------------------------------
# Topology — env overrides with backward-compatible defaults.
# ---------------------------------------------------------------------------
$SshTarget  = if ($env:DEPLOY_SSH_TARGET) { $env:DEPLOY_SSH_TARGET } else { "mccullough-cloud" }
$RemoteDir  = if ($env:DEPLOY_REMOTE_DIR) { $env:DEPLOY_REMOTE_DIR } else { "/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo" }
$RemoteRoot = if ($env:DEPLOY_REMOTE_ROOT) { $env:DEPLOY_REMOTE_ROOT } else { "/home/u741831384/domains/mccullough.cloud/public_html" }
$Port       = if ($env:DEPLOY_PORT) { $env:DEPLOY_PORT } else { "65002" }
$Target     = if ($env:DEPLOY_DOMAIN_TARGET) { $env:DEPLOY_DOMAIN_TARGET } else { "${SshTarget}:${RemoteDir}/" }
$DomainRoot = "${SshTarget}:${RemoteRoot}/"
$DeployStamp = Get-Date -Format "yyyyMMdd-HHmmss"
# Backups go OUTSIDE public_html so they are not web-accessible.
# Default: /home/u741831384/backups/semantic-demo/deploy-<stamp>
# Override with DEPLOY_BACKUP_DIR to point at any private directory.
$BackupParent = if ($env:DEPLOY_BACKUP_DIR) { $env:DEPLOY_BACKUP_DIR } else { "/home/u741831384/backups/semantic-demo" }
$BackupDir = "$BackupParent/deploy-$DeployStamp"
$SemanticArtifacts = @(
    "data.dat",
    "data.dat.gz",
    "semantic_threads.dat",
    "semantic_threads_ui.dat",
    "semantic_space_layout_manifest.json"
)

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Command
    )

    $line = $Command -join " "
    if ($DryRun) {
        Write-Output "[DRYRUN] $line"
        return
    }

    Write-Output "==> $line"
    & $Command[0] @($Command | Select-Object -Skip 1)
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $line"
    }
}

Write-Output "==> Building dist/svelte..."
Invoke-Step @("npm", "run", "build")

Write-Output "==> Refreshing cache busters..."
Invoke-Step @("npm", "run", "refresh:cache")

Write-Output "==> Checking canonical shell contract..."
Invoke-Step @("npm", "run", "check:shell")

Write-Output "==> Checking cache busters..."
Invoke-Step @("npm", "run", "check:cache")

Write-Output "==> Creating remote rollback backup: $BackupDir"
Invoke-Step @(
    "ssh", "-p", $Port, $SshTarget,
    "mkdir -p '$BackupDir/assets' '$BackupDir/css' '$BackupDir/data' '$BackupDir/js' '$BackupDir/scripts' && cp -p '$RemoteDir/index.html' '$BackupDir/index.html' 2>/dev/null || true && cp -p '$RemoteDir/semantic-demo.css' '$BackupDir/semantic-demo.css' 2>/dev/null || true && cp -p '$RemoteDir/vector-explorer-pandora.css' '$BackupDir/vector-explorer-pandora.css' 2>/dev/null || true && if [ -d '$RemoteDir/assets' ]; then cp -p '$RemoteDir/assets/'* '$BackupDir/assets/' 2>/dev/null || true; fi && if [ -d '$RemoteDir/css' ]; then cp -p '$RemoteDir/css/'*.css '$BackupDir/css/' 2>/dev/null || true; fi && cp -p '$RemoteDir/.htaccess' '$BackupDir/.htaccess' 2>/dev/null || true && cp -p '$RemoteDir/data/leadEnrichment.public.json' '$BackupDir/data/leadEnrichment.public.json' 2>/dev/null || true && cp -p '$RemoteDir/data.dat' '$BackupDir/data.dat' 2>/dev/null || true && cp -p '$RemoteDir/data.dat.gz' '$BackupDir/data.dat.gz' 2>/dev/null || true && cp -p '$RemoteDir/semantic_threads.dat' '$BackupDir/semantic_threads.dat' 2>/dev/null || true && cp -p '$RemoteDir/semantic_threads_ui.dat' '$BackupDir/semantic_threads_ui.dat' 2>/dev/null || true && cp -p '$RemoteDir/semantic_space_layout_manifest.json' '$BackupDir/semantic_space_layout_manifest.json' 2>/dev/null || true"
)

Invoke-Step @("ssh", "-p", $Port, $SshTarget, "mkdir -p '$RemoteDir/assets' '$RemoteDir/css' '$RemoteDir/data' '$RemoteDir/js'")

# Keep the deploy payload explicit. Do not widen this to dist/svelte/*:
# stale files such as local metadata must never be published.
Invoke-Step @("scp", "-P", $Port, "dist/svelte/index.html", "${Target}index.html")
Invoke-Step @("scp", "-P", $Port, "-r", "dist/svelte/assets", $Target)
Invoke-Step @("scp", "-P", $Port, "-r", "dist/svelte/css", $Target)
Invoke-Step @("scp", "-P", $Port, "dist/svelte/semantic-demo.css", $Target)
Invoke-Step @("scp", "-P", $Port, "dist/svelte/vector-explorer-pandora.css", $Target)
foreach ($Artifact in $SemanticArtifacts) {
    $BuiltArtifact = "dist/svelte/$Artifact"
    if (Test-Path $BuiltArtifact) {
        Invoke-Step @("scp", "-P", $Port, $BuiltArtifact, $Target)
    } else {
        throw "Required semantic artifact missing: $Artifact"
    }
}
Invoke-Step @("scp", "-P", $Port, ".htaccess", $Target)

# Public enrichment — 13MB JSON keyed by lead_id, generated by
# scripts/extract-lead-enrichment.mjs. Read by data-loader.js at app init.
# The internal enrichment (leadEnrichment.internal.json) stays in the repo
# and is never deployed — it carries pipeline state that must not reach
# the public demo.
Invoke-Step @("scp", "-P", $Port, "dist/svelte/data/leadEnrichment.public.json", "${Target}data/leadEnrichment.public.json")


Invoke-Step @(
    "ssh", "-p", $Port, $SshTarget,
    "find '$RemoteDir' -maxdepth 1 -type d -exec chmod 755 {} \; && find '$RemoteDir/assets' '$RemoteDir/css' '$RemoteDir/js' '$RemoteDir/data' -type d -exec chmod 755 {} \; 2>/dev/null || true && find '$RemoteDir/assets' '$RemoteDir/css' '$RemoteDir/js' '$RemoteDir/data' -type f -exec chmod 644 {} \; 2>/dev/null || true && chmod 644 '$RemoteDir/index.html' '$RemoteDir/data.dat' '$RemoteDir/data.dat.gz' '$RemoteDir/semantic_threads.dat' '$RemoteDir/semantic_threads_ui.dat' '$RemoteDir/semantic_space_layout_manifest.json' '$RemoteDir/semantic-demo.css' '$RemoteDir/vector-explorer-pandora.css' '$RemoteDir/.htaccess' 2>/dev/null || true"
)

if ($DryRun) {
    Write-Output "==> Dry run complete - no files modified."
} else {
    Write-Output "==> Deploy complete. Rollback backup: $BackupDir"
    Write-Output "==> Rollback command: ssh -p $Port $SshTarget ""cp -p '$BackupDir/index.html' '$RemoteDir/index.html' 2>/dev/null || true && cp -p '$BackupDir/semantic-demo.css' '$RemoteDir/semantic-demo.css' 2>/dev/null || true && cp -p '$BackupDir/vector-explorer-pandora.css' '$RemoteDir/vector-explorer-pandora.css' 2>/dev/null || true && if [ -d '$BackupDir/assets' ]; then mkdir -p '$RemoteDir/assets' && cp -p '$BackupDir/assets/'* '$RemoteDir/assets/' 2>/dev/null || true; fi && if [ -d '$BackupDir/css' ]; then mkdir -p '$RemoteDir/css' && cp -p '$BackupDir/css/'*.css '$RemoteDir/css/' 2>/dev/null || true; fi && cp -p '$BackupDir/data.dat' '$RemoteDir/data.dat' 2>/dev/null || true && cp -p '$BackupDir/data.dat.gz' '$RemoteDir/data.dat.gz' 2>/dev/null || true && cp -p '$BackupDir/semantic_threads.dat' '$RemoteDir/semantic_threads.dat' 2>/dev/null || true && cp -p '$BackupDir/semantic_threads_ui.dat' '$RemoteDir/semantic_threads_ui.dat' 2>/dev/null || true && cp -p '$BackupDir/semantic_space_layout_manifest.json' '$RemoteDir/semantic_space_layout_manifest.json' 2>/dev/null || true && mkdir -p '$RemoteDir/data' && cp -p '$BackupDir/data/leadEnrichment.public.json' '$RemoteDir/data/leadEnrichment.public.json' 2>/dev/null || true && cp -p '$BackupDir/.htaccess' '$RemoteDir/.htaccess' 2>/dev/null || true"""
}
