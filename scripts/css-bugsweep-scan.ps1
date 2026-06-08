# Simple scan using simpler regex
$content = (Get-ChildItem -Path 'css' -Include *.css | Get-Content) -join "`n"
$set = @{}
$matches_local = [regex]::Matches($content, '\[data-panel-surface=([''"])([a-z-]+)\1\]')
foreach ($m in $matches_local) { $set[$m.Groups[2].Value] = $true }
Write-Host "=== data-panel-surface values in CSS ==="
$set.Keys | Sort-Object | ForEach-Object { Write-Host "  $_" }

$set2 = @{}
$matches_local2 = [regex]::Matches($content, '\[data-panel-surface-detail=([''"])([a-z-]+)\1\]')
foreach ($m in $matches_local2) { $set2[$m.Groups[2].Value] = $true }
Write-Host ""
Write-Host "=== data-panel-surface-detail values in CSS ==="
$set2.Keys | Sort-Object | ForEach-Object { Write-Host "  $_" }

$set3 = @{}
$matches_local3 = [regex]::Matches($content, '\[data-panel-surface\^=([''"])([a-z-]+)\1\]')
foreach ($m in $matches_local3) { $set3[$m.Groups[2].Value] = $true }
Write-Host ""
Write-Host "=== data-panel-surface^= prefix values in CSS ==="
$set3.Keys | Sort-Object | ForEach-Object { Write-Host "  $_" }

$set4 = @{}
$matches_local4 = [regex]::Matches($content, '\[data-active-view=([''"])([a-z-]+)\1\]')
foreach ($m in $matches_local4) { $set4[$m.Groups[2].Value] = $true }
Write-Host ""
Write-Host "=== data-active-view values in CSS ==="
$set4.Keys | Sort-Object | ForEach-Object { Write-Host "  $_" }

$set5 = @{}
$matches_local5 = [regex]::Matches($content, '\[data-focus-panel-mode=([''"])([a-z-]+)\1\]')
foreach ($m in $matches_local5) { $set5[$m.Groups[2].Value] = $true }
Write-Host ""
Write-Host "=== data-focus-panel-mode values in CSS ==="
$set5.Keys | Sort-Object | ForEach-Object { Write-Host "  $_" }

$set6 = @{}
$matches_local6 = [regex]::Matches($content, '\[data-journey-phase=([''"])([a-z-]+)\1\]')
foreach ($m in $matches_local6) { $set6[$m.Groups[2].Value] = $true }
Write-Host ""
Write-Host "=== data-journey-phase values in CSS ==="
$set6.Keys | Sort-Object | ForEach-Object { Write-Host "  $_" }
