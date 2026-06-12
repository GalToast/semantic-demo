<#
.SYNOPSIS
    Validates Pi skill SKILL.md files for required YAML frontmatter.
.DESCRIPTION
    Scans all SKILL.md files under the Pi agent skills directory and checks that each
    has valid YAML frontmatter: opening/closing --- markers, and name:/description: keys.
    Supports --fix to auto-repair common issues in-place.
.PARAMETER Fix
    When present, attempts to auto-fix issues in each SKILL.md file.
.PARAMETER Yes
    When present with --fix, skips interactive confirmation before writing changes.
#>
[CmdletBinding()]
param(
    [switch]$Fix,
    [switch]$Yes
)

$ErrorActionPreference = 'Stop'

$skillsRoot = Join-Path $env:USERPROFILE '.pi\agent\skills'

# ---------- helpers ----------

function Get-SkillNameFromPath {
    param([string]$FilePath)
    $dir = Split-Path $FilePath -Parent
    return (Split-Path $dir -Leaf)
}

function Get-DescriptionFromContent {
    param([string[]]$Lines)
    foreach ($line in $Lines) {
        $trimmed = $line.Trim()
        if ($trimmed -match '^#\s+(.+)$') {
            return $Matches[1].Trim()
        }
        # stop scanning after a blank line or non-heading, non-empty line
        if ($trimmed -eq '') { break }
        if ($trimmed -ne '' -and -not $trimmed.StartsWith('#')) { break }
    }
    return $null
}

function Test-Frontmatter {
    param([string]$FilePath)
    $content = Get-Content -LiteralPath $FilePath -Raw
    $lines = $content -split "`n"
    # normalise: strip trailing CR if present
    $lines = $lines | ForEach-Object { $_ -replace "`r$", '' }

    $issues = [System.Collections.Generic.List[string]]::new()

    # Check 1: first line is ---
    if ($lines.Count -eq 0 -or $lines[0].Trim() -ne '---') {
        $issues.Add('missing-opening-frontmatter')
    }

    # Check 2: closing --- exists (after the first line)
    $hasClosing = $false
    if ($lines.Count -gt 1) {
        for ($i = 1; $i -lt $lines.Count; $i++) {
            if ($lines[$i].Trim() -eq '---') {
                $hasClosing = $true
                break
            }
        }
    }
    if (-not $hasClosing) {
        $issues.Add('missing-closing-frontmatter')
    }

    # Check 3 & 4: name: and description: keys (only if frontmatter block exists)
    $hasName = $false
    $hasDescription = $false
    if ($hasClosing) {
        # search between first --- and closing ---
        $closingIdx = 0
        for ($i = 1; $i -lt $lines.Count; $i++) {
            if ($lines[$i].Trim() -eq '---') { $closingIdx = $i; break }
        }
        for ($i = 1; $i -lt $closingIdx; $i++) {
            $l = $lines[$i].Trim()
            if ($l -match '^name:')    { $hasName = $true }
            if ($l -match '^description:') { $hasDescription = $true }
        }
    }
    if (-not $hasName) {
        $issues.Add('missing-name')
    }
    if (-not $hasDescription) {
        $issues.Add('missing-description')
    }

    return , $issues.ToArray()
}

function Repair-SkillFile {
    param(
        [string]$FilePath,
        [string[]]$Issues,
        [ref]$FixLog
    )

    $lines = Get-Content -LiteralPath $FilePath
    # normalise CR
    $lines = $lines | ForEach-Object { $_ -replace "`r$", '' }

    $skillName = Get-SkillNameFromPath -FilePath $FilePath
    $contentAfterFrontmatter = @()
    $needsFullFrontmatter = $false

    # Determine where the body starts
    if ($Issues -contains 'missing-opening-frontmatter') {
        # No frontmatter at all — treat entire content as body
        $contentAfterFrontmatter = $lines
        $needsFullFrontmatter = $true
    }
    elseif ($Issues -contains 'missing-closing-frontmatter') {
        # Had opening --- but no closing — everything after first line is body
        if ($lines.Count -gt 1) {
            $contentAfterFrontmatter = $lines[1..($lines.Count - 1)]
        }
        $needsFullFrontmatter = $true
    }
    else {
        # Frontmatter exists but may be missing keys — find closing ---
        $closingIdx = 0
        for ($i = 1; $i -lt $lines.Count; $i++) {
            if ($lines[$i].Trim() -eq '---') { $closingIdx = $i; break }
        }
        $frontmatterLines = $lines[1..($closingIdx - 1)]
        if ($closingIdx + 1 -lt $lines.Count) {
            $contentAfterFrontmatter = $lines[($closingIdx + 1)..($lines.Count - 1)]
        }
    }

    # Derive description from body content
    $derivedDesc = Get-DescriptionFromContent -Lines $contentAfterFrontmatter
    if (-not $derivedDesc) {
        $derivedDesc = "$skillName skill (description needed -- please edit)"
    }

    # Build new frontmatter
    $fm = [System.Collections.Generic.List[string]]::new()
    $fm.Add('---')
    $fm.Add("name: $skillName")

    $fm.Add("description: $derivedDesc")
    $fm.Add('---')

    # Assemble output
    $outputLines = [System.Collections.Generic.List[string]]::new()
    foreach ($item in $fm) { $outputLines.Add($item) }
    foreach ($item in $contentAfterFrontmatter) { $outputLines.Add($item) }

    # Write back
    Set-Content -LiteralPath $FilePath -Value ($outputLines -join "`n") -NoNewline -Encoding UTF8

    $FixLog.Value.Add("$FilePath -- fixed: $($Issues -join ', ')")
}

# ---------- main ----------

$files = Get-ChildItem -LiteralPath $skillsRoot -Recurse -Filter 'SKILL.md' -ErrorAction SilentlyContinue
if (-not $files -or $files.Count -eq 0) {
    Write-Host "skill-doctor: No SKILL.md files found under $skillsRoot"
    exit 0
}

$total = $files.Count
$valid = 0
$problemFiles = [System.Collections.Generic.List[pscustomobject]]::new()
$fixLog = [System.Collections.Generic.List[string]]::new()

foreach ($file in $files) {
    $issues = Test-Frontmatter -FilePath $file.FullName
    if ($issues.Count -eq 0) {
        $valid++
    }
    else {
        $problemFiles.Add([pscustomobject]@{
            Path   = $file.FullName
            Issues = $issues
        })
    }
}

# ---------- report ----------

Write-Host "skill-doctor: scan complete"
Write-Host "  Total scanned : $total"
Write-Host "  Valid         : $valid"
Write-Host "  With issues   : $($problemFiles.Count)"

if ($problemFiles.Count -gt 0) {
    Write-Host ""
    Write-Host "Issues:"
    foreach ($pf in $problemFiles) {
        $short = $pf.Path.Replace("$env:USERPROFILE\", '~\')
        Write-Host "  $short"
        foreach ($issue in $pf.Issues) {
            Write-Host "    - $issue"
        }
    }

    # ---------- fix pass ----------

    if ($Fix) {
        Write-Host ""
        Write-Host "Planned fixes:"
        foreach ($pf in $problemFiles) {
            $short = $pf.Path.Replace("$env:USERPROFILE\", '~\')
            Write-Host "  $short  ->  $($pf.Issues -join ', ')"
        }

        if (-not $Yes) {
            Write-Host ""
            $response = Read-Host "Apply fixes? (y/N)"
            if ($response -ne 'y' -and $response -ne 'Y') {
                Write-Host "skill-doctor: Aborted. No files changed."
                exit 1
            }
        }

        foreach ($pf in $problemFiles) {
            Repair-SkillFile -FilePath $pf.Path -Issues $pf.Issues -FixLog ([ref]$fixLog)
        }

        Write-Host ""
        Write-Host "Fixed:"
        foreach ($entry in $fixLog) {
            Write-Host "  $entry"
        }
    }

    exit 1
}

Write-Host ""
Write-Host "All skills have valid frontmatter."
exit 0
