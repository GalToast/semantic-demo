param(
    [string]$Pattern = "data-panel-surface='([a-z-]+)'"
)

$content = (Get-ChildItem -Path 'css' -Include *.css -Recurse | Get-Content) -join "`n"
$regex = [regex]$Pattern
$matches_local = $regex.Matches($content)
$set = @{}
foreach ($m in $matches_local) {
    $v = $m.Groups[1].Value
    if (-not $set.ContainsKey($v)) { $set[$v] = 0 }
    $set[$v]++
}
$set.Keys | Sort-Object | ForEach-Object { Write-Host "  $_ = $($set[$_])" }
