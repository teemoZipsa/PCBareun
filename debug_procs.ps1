[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$protected = @(
    'System','Idle','svchost','csrss','wininit','winlogon','lsass','lsaiso',
    'smss','services','dwm','fontdrvhost','sihost','taskhostw','RuntimeBroker',
    'explorer','SearchHost','SearchIndexer','StartMenuExperienceHost',
    'ShellExperienceHost','TextInputHost','ctfmon','conhost','SecurityHealthService',
    'SecurityHealthSystray','MsMpEng','NisSrv','spoolsv','wlanext',
    'audiodg','Secure System','Registry','Memory Compression','Tauri',
    'PCBareun','pc-bareun','LsaIso','CompPkgSrv','dllhost','WmiPrvSE','dasHost',
    'WindowsTerminal','OpenConsole','powershell','pwsh','cmd'
)

Write-Output "=== All non-protected processes with >10MB ==="
$all = Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -notin $protected -and
    $_.Id -ne $PID -and
    $_.WorkingSet64 -gt 10MB
} | Sort-Object WorkingSet64 -Descending | Select-Object -First 20

foreach ($p in $all) {
    $memMB = [math]::Round($p.WorkingSet64 / 1MB, 1)
    Write-Output "$($p.ProcessName) (PID $($p.Id)) - $memMB MB - Window: $($p.MainWindowHandle -ne [IntPtr]::Zero)"
}

Write-Output ""
Write-Output "Total found: $($all.Count)"
