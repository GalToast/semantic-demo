Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "../../..")
$launcher = Join-Path $repoRoot "tools/agent-runtime/external-subagents/run.ps1"
$command = "C:\windows\System32\WindowsPowerShell\v1.0\powershell.exe"
$args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $launcher)
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

function Write-JsonFileNoBom {
    param(
        [Parameter(Mandatory=$true)][string]$Path,
        [Parameter(Mandatory=$true)]$Json
    )
    $text = $Json | ConvertTo-Json -Depth 100
    [System.IO.File]::WriteAllText($Path, $text, $utf8NoBom)
}

function Update-McpServersShape {
    param([Parameter(Mandatory=$true)]$Root)
    if (-not $Root.PSObject.Properties["mcpServers"]) { return $false }
    $server = $Root.mcpServers.'external-subagents'
    if (-not $server) { return $false }
    $server.command = $command
    $server.args = $args
    return $true
}

function Update-OpenCodeShape {
    param([Parameter(Mandatory=$true)]$Root)
    if (-not $Root.PSObject.Properties["mcp"]) { return $false }
    $server = $Root.mcp.'external-subagents'
    if (-not $server) { return $false }
    $server.command = @($command) + $args
    return $true
}

function Update-JsonConfig {
    param([Parameter(Mandatory=$true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        return [pscustomobject]@{ path = $Path; status = "missing" }
    }

    $text = [System.IO.File]::ReadAllText($Path)
    if ($text.Length -gt 0 -and [int][char]$text[0] -eq 0xFEFF) {
        $text = $text.Substring(1)
    }
    $root = $text | ConvertFrom-Json
    $changed = (Update-McpServersShape $root) -or (Update-OpenCodeShape $root)
    if ($changed) {
        Write-JsonFileNoBom -Path $Path -Json $root
        return [pscustomobject]@{ path = $Path; status = "updated" }
    }
    return [pscustomobject]@{ path = $Path; status = "external-subagents not found" }
}

function Update-CodexToml {
    param([Parameter(Mandatory=$true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        return [pscustomobject]@{ path = $Path; status = "missing" }
    }

    $text = [System.IO.File]::ReadAllText($Path)
    if ($text.Length -gt 0 -and [int][char]$text[0] -eq 0xFEFF) {
        $text = $text.Substring(1)
    }

    $escapedCommand = $command.Replace("\", "\\")
    $escapedArgs = ($args | ForEach-Object { '  "' + $_.Replace("\", "\\") + '",' }) -join "`r`n"
    $replacement = @"
`$1command = "$escapedCommand"
args = [
$escapedArgs
]
`$2
"@
    $pattern = '(?ms)(\[mcp_servers\.external-subagents\]\s*)command\s*=\s*".*?"\s*args\s*=\s*\[[\s\S]*?\]\s*(env\s*=)'
    $updated = [regex]::Replace($text, $pattern, $replacement, 1)
    if ($updated -eq $text) {
        return [pscustomobject]@{ path = $Path; status = "external-subagents not found" }
    }
    [System.IO.File]::WriteAllText($Path, $updated, $utf8NoBom)
    return [pscustomobject]@{ path = $Path; status = "updated" }
}

$results = @(
    Update-CodexToml "C:/Users/HP/.codex/config.toml"
    Update-JsonConfig "C:/Users/HP/.qwen/settings.json"
    Update-JsonConfig "C:/Users/HP/.config/opencode/opencode.json"
    Update-JsonConfig "C:/Users/HP/.gemini/settings.json"
    Update-JsonConfig "C:/Users/HP/AppData/Roaming/Antigravity/User/settings.json"
    Update-JsonConfig "C:/Users/HP/.pi/agent/mcp.json"
)

$results | ConvertTo-Json -Depth 4
