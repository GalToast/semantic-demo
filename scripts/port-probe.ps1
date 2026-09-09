$ports = 8083, 8795, 8796, 8797, 8806
Get-NetTCPConnection | Where-Object { $ports -contains $_.LocalPort } |
    Select-Object LocalAddress, LocalPort, State, OwningProcess |
    Sort-Object LocalPort | Format-Table -AutoSize
Write-Host ""
$m = (Get-Counter '\Memory\Available MBytes').CounterSamples[0].CookedValue
$t = (Get-Counter '\Memory\Total MBytes').CounterSamples[0].CookedValue
Write-Host ("RAM: total={0:N1} MB avail={0:N1} MB" -f $t, $m)
Write-Host ""
Write-Host "Processes owning those ports:"
$seen = @{}
Get-NetTCPConnection | Where-Object { $ports -contains $_.LocalPort } |
    ForEach-Object {
        $pid = $_.OwningProcess
        if (-not $seen[$pid]) {
            $seen[$pid] = $true
            $p = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($p) { Write-Host ("  pid={0} name={1}" -f $pid, $p.ProcessName) }
        }
    }