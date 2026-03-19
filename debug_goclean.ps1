[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$paths = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'
)
foreach ($p in $paths) {
    Get-ChildItem $p -ErrorAction SilentlyContinue | ForEach-Object {
        $props = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
        if ($props.Publisher -like '*NATE*' -or $props.Publisher -like '*Irongate*') {
            Write-Output "=== FOUND ==="
            Write-Output "PSPath: $($_.PSPath)"
            Write-Output "RegName: $($_.Name)"
            Write-Output "DisplayName: $($props.DisplayName)"
            Write-Output "Publisher: $($props.Publisher)"
            Write-Output "InstallLocation: [$($props.InstallLocation)]"
            Write-Output "UninstallString: [$($props.UninstallString)]"
            Write-Output "DisplayIcon: [$($props.DisplayIcon)]"
            Write-Output ""
        }
    }
}
