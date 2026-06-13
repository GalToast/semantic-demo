$b = Get-Content 'C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer\dist\svelte\assets\index-ClZcR-Ce.js' -Raw
$terms = @('applyLocalNeighborhoodFocus','applyUrlState','earlyPublish','SEARCH_FOCUS_REQUESTED','FocusPocket','getDataLoadState','_restoreSearchFromParams','resetStateBeforeUrlRestore','clearExplorationFocusSelection')
foreach($t in $terms) {
    $idx = $b.IndexOf($t)
    if($idx -ge 0) {
        $start = [Math]::Max(0,$idx-120)
        $end = [Math]::Min($b.Length,$idx+$t.Length+120)
        Write-Output ""
        Write-Output "=== $t at offset $idx ==="
        Write-Output $b.Substring($start,$end-$start)
    } else {
        Write-Output ""
        Write-Output "=== $t  NOT FOUND ==="
    }
}
