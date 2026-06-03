param(
    [switch]$Json = $false
)

$ErrorActionPreference = 'Stop'

function Get-ProfileFromCommandLine {
    param([string]$CommandLine)
    if ([string]::IsNullOrWhiteSpace($CommandLine)) { return $null }
    $patterns = @(
        '--user-data-dir="?([^"\s]+(?:\s[^"\s]+)*)"?',
        '--userDataDir=([^"\s]+)',
        '--user-data-dir=([^"\s]+)'
    )
    foreach ($pattern in $patterns) {
        $match = [regex]::Match($CommandLine, $pattern)
        if ($match.Success) {
            return $match.Groups[1].Value.Trim('"')
        }
    }
    return $null
}

function Get-AgentKind {
    param(
        [string]$CommandLine,
        [string]$Profile
    )
    if ($Profile -like '*\.codex\*') { return 'codex' }
    if ($Profile -like '*\.claude\*') { return 'claude' }
    if ($CommandLine -like '*\.codex\mcp-runtimes*') { return 'codex' }
    if ($CommandLine -like '*\.claude\mcp_servers*') { return 'claude' }
    if ($CommandLine -like '*Antigravity*' -or $CommandLine -like '*\.gemini\antigravity*') { return 'antigravity' }
    return 'unknown'
}

$processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
        $_.CommandLine -and (
            $_.CommandLine -like '*chrome-devtools-mcp*' -or
            $_.CommandLine -like '*mcp-playwright-video-wrapper*' -or
            $_.CommandLine -like '*playwright-codex*' -or
            $_.CommandLine -like '*chrome-devtools-isolate*' -or
            $_.CommandLine -like '*chrome-devtools-claude*' -or
            $_.CommandLine -like '*chrome-devtools-codex*'
        )
    } |
    Select-Object ProcessId, Name, CommandLine

$rows = foreach ($proc in $processes) {
    $profile = Get-ProfileFromCommandLine -CommandLine $proc.CommandLine
    [pscustomobject]@{
        pid = $proc.ProcessId
        name = $proc.Name
        agent = Get-AgentKind -CommandLine $proc.CommandLine -Profile $profile
        kind = if ($proc.CommandLine -like '*mcp-playwright-video-wrapper*') { 'playwright' } elseif ($proc.CommandLine -like '*chrome-devtools-mcp*') { 'chrome-devtools' } elseif ($proc.Name -eq 'chrome.exe') { 'chrome' } else { 'launcher' }
        profile = $profile
        commandLine = $proc.CommandLine
    }
}

$conflicts = $rows |
    Where-Object { $_.profile } |
    Group-Object profile |
    Where-Object { ($_.Group | Select-Object -ExpandProperty agent -Unique).Count -gt 1 -or ($_.Group | Where-Object kind -in @('chrome-devtools', 'playwright')).Count -gt 1 } |
    ForEach-Object {
        [pscustomobject]@{
            profile = $_.Name
            pids = ($_.Group | Select-Object -ExpandProperty pid)
            agents = ($_.Group | Select-Object -ExpandProperty agent -Unique)
            kinds = ($_.Group | Select-Object -ExpandProperty kind -Unique)
        }
    }

$report = [pscustomobject]@{
    generatedAt = (Get-Date).ToString('o')
    processCount = @($rows).Count
    conflictCount = @($conflicts).Count
    conflicts = @($conflicts)
    processes = @($rows | Sort-Object agent, kind, pid)
}

if ($Json) {
    $report | ConvertTo-Json -Depth 6
    exit 0
}

Write-Host "Browser MCP Doctor" -ForegroundColor Cyan
Write-Host "Processes: $($report.processCount)"
Write-Host "Profile conflicts: $($report.conflictCount)"
if ($report.conflictCount -gt 0) {
    Write-Host ""
    Write-Host "Conflicting profiles:" -ForegroundColor Yellow
    $report.conflicts | Format-Table -AutoSize
}
Write-Host ""
$report.processes |
    Select-Object pid, name, agent, kind, profile |
    Format-Table -AutoSize
