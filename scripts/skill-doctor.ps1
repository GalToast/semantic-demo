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

# Skills can live in several roots under the Pi agent home. The plain
# `skills/` directory only catches user-installed skills; the bulk live under
# `pi-hermes-memory/skills/` (the local companion package) and the `npm/`
# module tree (npm-installed packages like context-mode and pi-lens).
# Keep this list in sync with `~/.pi/agent/` if new skill hosts appear.
$skillRoots = @(
    @{ Path = (Join-Path $env:USERPROFILE '.pi\agent\skills');             Scope = 'user'    }
    @{ Path = (Join-Path $env:USERPROFILE '.pi\agent\pi-hermes-memory\skills'); Scope = 'user'    }
    @{ Path = (Join-Path $env:USERPROFILE '.pi\agent\npm');                Scope = 'package' }
)

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

# Discover SKILL.md files across all configured roots. Files are tagged with
# their scope so the fix pass can avoid writing into package-managed trees.
$allFiles = [System.Collections.Generic.List[object]]::new()
foreach ($root in $skillRoots) {
    if (-not (Test-Path -LiteralPath $root.Path)) { continue }
    $found = @(Get-ChildItem -LiteralPath $root.Path -Recurse -Filter 'SKILL.md' -ErrorAction SilentlyContinue)
    foreach ($f in $found) {
        $allFiles.Add([pscustomobject]@{ File = $f; Scope = $root.Scope; Root = $root.Path }) | Out-Null
    }
}

if ($allFiles.Count -eq 0) {
    Write-Host "skill-doctor: No SKILL.md files found under any configured root"
    foreach ($root in $skillRoots) {
        Write-Host "  - $($root.Path)"
    }
    exit 0
}

$total       = $allFiles.Count
$valid       = 0
$problemFiles = [System.Collections.Generic.List[pscustomobject]]::new()
$fixLog       = [System.Collections.Generic.List[string]]::new()
$rootCounts  = @{}
foreach ($root in $skillRoots) { $rootCounts[$root.Path] = 0 }

foreach ($entry in $allFiles) {
    $file  = $entry.File
    $scope = $entry.Scope
    $rootCounts[$entry.Root]++
    $issues = Test-Frontmatter -FilePath $file.FullName
    if ($issues.Count -eq 0) {
        $valid++
    }
    else {
        $problemFiles.Add([pscustomobject]@{
            Path   = $file.FullName
            Issues = $issues
            Scope  = $scope
            Root   = $entry.Root
        })
    }
}

# ---------- report ----------

Write-Host "skill-doctor: scan complete"
Write-Host "  Total scanned : $total"
Write-Host "  Valid         : $valid"
Write-Host "  With issues   : $($problemFiles.Count)"
Write-Host "  Roots covered :"
foreach ($root in $skillRoots) {
    Write-Host ("    {0,-90} {1} files" -f $root.Path, ($rootCounts[$root.Path] ?? 0))
}

if ($problemFiles.Count -gt 0) {
    Write-Host ""
    Write-Host "Issues:"
    foreach ($pf in $problemFiles) {
        $short = $pf.Path.Replace("$env:USERPROFILE\", '~\')
        $tag   = if ($pf.Scope -eq 'package') { ' [package -- --fix disabled]' } else { '' }
        Write-Host "  $short$tag"
        foreach ($issue in $pf.Issues) {
            Write-Host "    - $issue"
        }
    }

    # ---------- fix pass ----------

    if ($Fix) {
        $fixable    = @($problemFiles | Where-Object { $_.Scope -eq 'user'    })
        $nonFixable = @($problemFiles | Where-Object { $_.Scope -eq 'package' })

        Write-Host ""
        Write-Host "Fixable (user scope):"
        if ($fixable.Count -eq 0) {
            Write-Host "  (none)"
        } else {
            foreach ($pf in $fixable) {
                $short = $pf.Path.Replace("$env:USERPROFILE\", '~\')
                Write-Host "  $short  ->  $($pf.Issues -join ', ')"
            }
        }

        if ($nonFixable.Count -gt 0) {
            Write-Host ""
            Write-Host "Detection only (package scope, --fix disabled to avoid writing to package-managed trees):"
            foreach ($pf in $nonFixable) {
                $short = $pf.Path.Replace("$env:USERPROFILE\", '~\')
                Write-Host "  $short  ->  $($pf.Issues -join ', ')"
            }
        }

        if ($fixable.Count -eq 0) {
            Write-Host ""
            Write-Host "skill-doctor: No fixable issues. No files changed."
            exit 1
        }

        if (-not $Yes) {
            Write-Host ""
            $response = Read-Host "Apply fixes? (y/N)"
            if ($response -ne 'y' -and $response -ne 'Y') {
                Write-Host "skill-doctor: Aborted. No files changed."
                exit 1
            }
        }

        foreach ($pf in $fixable) {
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
