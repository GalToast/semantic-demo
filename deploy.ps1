param(
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$Target = "mccullough-cloud:/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo/"
$DomainRoot = "mccullough-cloud:/home/u741831384/domains/mccullough.cloud/public_html/"
$SshTarget = "mccullough-cloud"
$RemoteDir = "/home/u741831384/domains/mccullough.cloud/public_html/semantic-demo"
$RemoteRoot = "/home/u741831384/domains/mccullough.cloud/public_html"
$Port = "65002"
$DeployStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupDir = "$RemoteDir/backups/deploy-$DeployStamp"

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
}

Write-Output "==> Building dist/bundle.js..."
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
    "mkdir -p '$BackupDir/dist' '$BackupDir/js' '$BackupDir/css' && cp -p '$RemoteDir/dist/bundle.js' '$BackupDir/dist/bundle.js' && cp -p '$RemoteDir/semantic-demo.css' '$BackupDir/semantic-demo.css' && cp -p '$RemoteDir/vector-explorer-pandora.css' '$BackupDir/vector-explorer-pandora.css' && if [ -d '$RemoteDir/css' ]; then cp -p '$RemoteDir/css/'*.css '$BackupDir/css/' 2>/dev/null || true; fi && cp -p '$RemoteDir/vector-explorer-polished.html' '$BackupDir/vector-explorer-polished.html' && cp -p '$RemoteDir/.htaccess' '$BackupDir/.htaccess' && cp -p '$RemoteDir/js/scanner.js' '$BackupDir/js/scanner.js' && cp -p '$RemoteRoot/js/scanner.js' '$BackupDir/scanner-root.js'"
)

# Keep the deploy payload explicit. Do not widen this to dist/*:
# dist/bundle.js.map is a local debugging artifact and should not be public.
Invoke-Step @("scp", "-P", $Port, "dist/bundle.js", "${Target}dist/bundle.js")
Invoke-Step @("scp", "-P", $Port, "semantic-demo.css", $Target)
Invoke-Step @("scp", "-P", $Port, "vector-explorer-pandora.css", $Target)
if (Test-Path "css") {
    Invoke-Step @("scp", "-P", $Port, "-r", "css", $Target)
}
Invoke-Step @("scp", "-P", $Port, "vector-explorer-polished.html", $Target)
Invoke-Step @("scp", "-P", $Port, ".htaccess", $Target)

Write-Output "==> Syncing scanner.js to cloudscan/..."
# scanner.js is the canonical source for /js/scanner.js (cloudscan page)
# and /semantic-demo/js/scanner.js (semantic demo) - keep in sync.
# This makes deploy.ps1 broader than semantic-demo-only changes. If ../js/scanner.js
# is dirty or unrelated, use a scoped deploy instead of this full script.
Invoke-Step @("scp", "-P", $Port, "../js/scanner.js", "${DomainRoot}js/scanner.js")
Invoke-Step @("scp", "-P", $Port, "../js/scanner.js", "${Target}js/scanner.js")

if ($DryRun) {
    Write-Output "==> Dry run complete - no files modified."
} else {
    Write-Output "==> Deploy complete. Rollback backup: $BackupDir"
    Write-Output "==> Rollback command: ssh -p $Port $SshTarget ""cp -p '$BackupDir/dist/bundle.js' '$RemoteDir/dist/bundle.js' && cp -p '$BackupDir/semantic-demo.css' '$RemoteDir/semantic-demo.css' && cp -p '$BackupDir/vector-explorer-pandora.css' '$RemoteDir/vector-explorer-pandora.css' && if [ -d '$BackupDir/css' ]; then mkdir -p '$RemoteDir/css' && cp -p '$BackupDir/css/'*.css '$RemoteDir/css/' 2>/dev/null || true; fi && cp -p '$BackupDir/vector-explorer-polished.html' '$RemoteDir/vector-explorer-polished.html' && cp -p '$BackupDir/.htaccess' '$RemoteDir/.htaccess' && cp -p '$BackupDir/js/scanner.js' '$RemoteDir/js/scanner.js' && cp -p '$BackupDir/scanner-root.js' '$RemoteRoot/js/scanner.js'"""
}
