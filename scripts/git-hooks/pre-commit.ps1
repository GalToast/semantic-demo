#!/usr/bin/env pwsh

param(
    [switch]$AllowAnyBranch = $false,
    [switch]$SkipHighRiskCheck = $false
)

# Verify we're in a git repository
if (-not (git rev-parse --is-inside-work-tree 2>$null)) {
    exit 0
}

# Get current branch
$branch = git branch --show-current

# Expected branch (default: master)
$expectedBranch = "master"

# Check if we're on the expected branch
if ($branch -ne $expectedBranch -and -not $AllowAnyBranch) {
    Write-Host "Warning: You are on branch '$branch', not '$expectedBranch'." -ForegroundColor Yellow
    Write-Host "This branch may have unmerged changes that could be overwritten by a build." -ForegroundColor Yellow
    $response = Read-Host "Continue? [y/N]"
    if ($response -ne 'y' -and $response -ne 'Y') {
        Write-Host "Commit blocked." -ForegroundColor Red
        exit 1
    }
}

# Check for high-reversion-risk files in staged changes
$highRiskFiles = @(
    "vector-explorer-polished.html",
    "css/mobile_premium_*.css",
    "css/journey_active.css",
    "css/journey_steps.css",
    "css/strands.css",
    "css/progressive_disclosure.css",
    "css/mobile_*.css",
    "css/focus_*.css"
)

$stagedFiles = git diff --cached --name-only

$matchingFiles = @()
foreach ($file in $stagedFiles) {
    foreach ($highRiskPattern in $highRiskFiles) {
        if ($file -like $highRiskPattern) {
            $matchingFiles += $file
            break
        }
    }
}

if ($matchingFiles.Count -gt 0 -and -not $SkipHighRiskCheck) {
    Write-Host "Reminder: these files have a history of build reversion." -ForegroundColor Yellow
    Write-Host "Commit and push immediately, or use -SkipHighRiskCheck to bypass." -ForegroundColor Yellow
    Write-Host "Files:" -ForegroundColor Yellow
    $matchingFiles | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
}

# If we reached here, everything is good
Write-Host "reversion-guard: OK (branch=$branch, high-risk files=$($matchingFiles.Count))" -ForegroundColor Green
exit 0