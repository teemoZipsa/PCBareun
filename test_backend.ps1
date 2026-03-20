# PC바른 백엔드 통합 테스트 스크립트
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Continue"
$passed = 0
$failed = 0
$errors = @()

function Test-Command([string]$Name, [scriptblock]$Script) {
    Write-Host ""
    Write-Host "===== TEST: $Name =====" -ForegroundColor Cyan
    try {
        $result = & $Script
        $resultStr = "$result"
        if ($null -eq $result -or $resultStr -eq "" -or $resultStr -eq "[]") {
            Write-Host "  PASS (empty/no data)" -ForegroundColor Green
            $script:passed++
        }
        else {
            try {
                $parsed = $resultStr | ConvertFrom-Json -ErrorAction Stop
                $count = if ($parsed -is [array]) { $parsed.Count } else { 1 }
                Write-Host "  PASS ($count items)" -ForegroundColor Green
                $script:passed++
            }
            catch {
                Write-Host "  FAIL (JSON parse error)" -ForegroundColor Red
                $snippet = $resultStr.Substring(0, [Math]::Min(300, $resultStr.Length))
                Write-Host "  Raw: $snippet" -ForegroundColor Yellow
                $script:failed++
                $script:errors += "[$Name] JSON parse: $_"
            }
        }
    }
    catch {
        Write-Host "  FAIL (execution error)" -ForegroundColor Red
        Write-Host "  Error: $_" -ForegroundColor Yellow
        $script:failed++
        $script:errors += "[$Name] Exec: $_"
    }
}

# 1. Dashboard
Test-Command "Dashboard - System Info" {
    $cpu = Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1
    $mem = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
    [PSCustomObject]@{
        cpu_name = $cpu.Name
        total_memory_gb = [math]::Round($mem.TotalVisibleMemorySize / 1MB, 1)
        used_memory_gb = [math]::Round(($mem.TotalVisibleMemorySize - $mem.FreePhysicalMemory) / 1MB, 1)
        os_version = $mem.Caption
    } | ConvertTo-Json -Compress
}

# 2. Disk Health
Test-Command "Disk Health" {
    $disks = Get-PhysicalDisk -ErrorAction Stop
    $result = @()
    foreach ($d in $disks) {
        $result += [PSCustomObject]@{
            model = $d.FriendlyName
            size_gb = [math]::Round($d.Size / 1GB, 1)
            media_type = if ($d.MediaType) { $d.MediaType.ToString() } else { $null }
            bus_type = $d.BusType.ToString()
            health = $d.HealthStatus.ToString()
        }
    }
    if ($result.Count -eq 0) { '[]' } else { $result | ConvertTo-Json -Compress }
}

# 3. Secure Erase - Get Drives (exact script from secure_erase.rs)
Test-Command "Secure Erase - Get Drives" {
    $disks = Get-Disk -ErrorAction Stop
    $result = @()
    foreach ($d in $disks) {
        $parts = @()
        $isSystem = $false
        try {
            $partitions = Get-Partition -DiskNumber $d.Number -ErrorAction SilentlyContinue
            foreach ($p in $partitions) {
                if ($p.IsBoot -or $p.IsSystem) { $isSystem = $true }
                if ($p.DriveLetter) {
                    $vol = Get-Volume -DriveLetter $p.DriveLetter -ErrorAction SilentlyContinue
                    $parts += [PSCustomObject]@{
                        drive_letter = "$($p.DriveLetter):"
                        size_gb = [math]::Round($p.Size / 1GB, 1)
                        file_system = if ($vol) { $vol.FileSystemType } else { "" }
                    }
                }
            }
        } catch {}
        $envDrive = $env:SystemDrive
        foreach ($p2 in $parts) {
            if ($p2.drive_letter -eq $envDrive) { $isSystem = $true }
        }
        $mediaType = switch ($d.MediaType) {
            "SSD" { "SSD" }
            "HDD" { "HDD" }
            "Unspecified" { "Unknown" }
            default { if ($d.MediaType) { $d.MediaType.ToString() } else { $null } }
        }
        $isFrozen = $false
        if ($d.BusType -eq "SATA") { $isFrozen = $true }
        $result += [PSCustomObject]@{
            disk_number = [int]$d.Number
            model = $d.FriendlyName
            size_gb = [math]::Round($d.Size / 1GB, 1)
            media_type = $mediaType
            bus_type = $d.BusType.ToString()
            partitions = $parts
            is_system = $isSystem
            is_frozen = $isFrozen
        }
    }
    $result | ConvertTo-Json -Depth 3 -Compress
}

# 4. Debloat - Bloatware List
Test-Command "Debloat - Bloatware Apps" {
    $bloatList = @(
        'Microsoft.BingNews','Microsoft.GetHelp','Microsoft.MicrosoftOfficeHub',
        'Microsoft.MicrosoftSolitaireCollection','Microsoft.PowerAutomateDesktop',
        'Microsoft.Todos','Microsoft.WindowsAlarms',
        'Microsoft.WindowsFeedbackHub','Microsoft.WindowsSoundRecorder',
        'Microsoft.Xbox.TCUI','Microsoft.XboxGameOverlay','Microsoft.XboxGamingOverlay',
        'Microsoft.XboxIdentityProvider','Microsoft.XboxSpeechToTextOverlay',
        'Microsoft.GamingApp','Microsoft.ScreenSketch',
        'Microsoft.MicrosoftStickyNotes','Microsoft.WindowsCamera'
    )
    $installed = Get-AppxPackage -ErrorAction SilentlyContinue | Where-Object { $bloatList -contains $_.Name }
    $result = @()
    foreach ($app in $installed) {
        $n = if($app.Name -match 'Xbox.TCUI') { 'Xbox UI' }
             elseif($app.Name -match 'XboxGameOverlay') { 'Xbox Game Overlay' }
             elseif($app.Name -match 'XboxGamingOverlay') { 'Xbox Gaming Overlay' }
             elseif($app.Name -match 'XboxIdentityProvider') { 'Xbox Identity' }
             elseif($app.Name -match 'XboxSpeechToTextOverlay') { 'Xbox Speech' }
             else { $app.Name }
        $result += [PSCustomObject]@{
            name = $n
            package_name = $app.Name
            publisher = if($app.Publisher) { $app.Publisher } else { '' }
            is_removable = $true
        }
    }
    if ($result.Count -eq 0) { '[]' } else { $result | ConvertTo-Json -Compress }
}

# 5. Services
Test-Command "Services - List" {
    $svcs = Get-Service -ErrorAction SilentlyContinue | Select-Object -First 10
    $result = @()
    foreach ($s in $svcs) {
        $result += [PSCustomObject]@{
            name = $s.Name; display_name = $s.DisplayName
            status = $s.Status.ToString(); start_type = $s.StartType.ToString()
        }
    }
    $result | ConvertTo-Json -Compress
}

# 6. Startup Programs
Test-Command "Startup Programs" {
    $items = Get-CimInstance Win32_StartupCommand -ErrorAction SilentlyContinue | Select-Object -First 10
    $result = @()
    foreach ($i in $items) {
        $result += [PSCustomObject]@{ name = $i.Name; command = $i.Command; location = $i.Location }
    }
    if ($result.Count -eq 0) { '[]' } else { $result | ConvertTo-Json -Compress }
}

# 7. Network Adapters
Test-Command "Network Adapters" {
    $adapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 5
    $result = @()
    foreach ($a in $adapters) {
        $result += [PSCustomObject]@{
            name = $a.Name; description = $a.InterfaceDescription
            speed = $a.LinkSpeed; mac = $a.MacAddress
        }
    }
    if ($result.Count -eq 0) { '[]' } else { $result | ConvertTo-Json -Compress }
}

# 8. DNS
Test-Command "DNS Resolve" {
    $dns = Resolve-DnsName "www.google.com" -Type A -ErrorAction Stop | Select-Object -First 1
    [PSCustomObject]@{ name = $dns.Name; ip = $dns.IPAddress; status = "OK" } | ConvertTo-Json -Compress
}

# 9. Registry Orphans
Test-Command "Registry - Orphaned Keys" {
    $orphaned = @()
    $paths = @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
               'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')
    foreach ($p in $paths) {
        Get-ItemProperty $p -ErrorAction SilentlyContinue |
            Where-Object { $_.InstallLocation -and $_.InstallLocation -ne '' -and !(Test-Path $_.InstallLocation -ErrorAction SilentlyContinue) } |
            Select-Object -First 3 |
            ForEach-Object {
                $orphaned += [PSCustomObject]@{ display_name = $_.DisplayName; install_location = $_.InstallLocation }
            }
    }
    if ($orphaned.Count -eq 0) { '[]' } else { $orphaned | ConvertTo-Json -Compress }
}

# 10. Temp Cleaner
Test-Command "Temp Cleaner - Scan" {
    $totalSize = 0; $fileCount = 0
    foreach ($tp in @($env:TEMP)) {
        if (Test-Path $tp) {
            $files = Get-ChildItem $tp -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 200
            $fileCount += $files.Count
            $totalSize += ($files | Measure-Object -Property Length -Sum -ErrorAction SilentlyContinue).Sum
        }
    }
    [PSCustomObject]@{ files = $fileCount; size_mb = [math]::Round($totalSize / 1MB, 2) } | ConvertTo-Json -Compress
}

# 11. Port Monitor
Test-Command "Port Monitor" {
    $conns = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object -First 10
    $result = @()
    foreach ($c in $conns) {
        $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
        $result += [PSCustomObject]@{
            port = $c.LocalPort; pid_num = $c.OwningProcess
            name = if ($proc) { $proc.ProcessName } else { "?" }
        }
    }
    if ($result.Count -eq 0) { '[]' } else { $result | ConvertTo-Json -Compress }
}

# 12. Hardware Info
Test-Command "Hardware Info" {
    $gpu = Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue | Select-Object -First 1
    $mb = Get-CimInstance Win32_BaseBoard -ErrorAction SilentlyContinue | Select-Object -First 1
    [PSCustomObject]@{
        gpu = $gpu.Name; driver = $gpu.DriverVersion
        board = "$($mb.Manufacturer) $($mb.Product)"
    } | ConvertTo-Json -Compress
}

# 13. VHDX
Test-Command "VHDX Compactor" {
    $vhdx = @()
    $sp = "$env:LOCALAPPDATA\Packages"
    if (Test-Path $sp) {
        Get-ChildItem $sp -Filter "*.vhdx" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 5 | ForEach-Object {
            $vhdx += [PSCustomObject]@{ path = $_.FullName; size_gb = [math]::Round($_.Length / 1GB, 2) }
        }
    }
    if ($vhdx.Count -eq 0) { '[]' } else { $vhdx | ConvertTo-Json -Compress }
}

# 14. Process Booster
Test-Command "Process Booster" {
    $procs = Get-Process -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowHandle -eq 0 -and $_.WorkingSet64 -gt 50MB } |
        Sort-Object WorkingSet64 -Descending | Select-Object -First 5
    $result = @()
    foreach ($p in $procs) {
        $result += [PSCustomObject]@{ name = $p.ProcessName; pid_num = $p.Id; mem_mb = [math]::Round($p.WorkingSet64 / 1MB, 1) }
    }
    if ($result.Count -eq 0) { '[]' } else { $result | ConvertTo-Json -Compress }
}

# 15. Env PATH Check
Test-Command "ENV PATH Check" {
    $paths = $env:PATH -split ';' | Where-Object { $_ -ne '' } | Select-Object -First 10
    $result = @()
    foreach ($p in $paths) {
        $result += [PSCustomObject]@{ path = $p; exists = (Test-Path $p -ErrorAction SilentlyContinue) }
    }
    $result | ConvertTo-Json -Compress
}

# ── Summary ──
Write-Host ""
Write-Host "================================================" -ForegroundColor White
Write-Host " TEST SUMMARY" -ForegroundColor White
Write-Host "================================================" -ForegroundColor White
Write-Host "  PASSED: $passed" -ForegroundColor Green
if ($failed -gt 0) {
    Write-Host "  FAILED: $failed" -ForegroundColor Red
} else {
    Write-Host "  FAILED: $failed" -ForegroundColor Green
}
Write-Host "================================================" -ForegroundColor White
if ($errors.Count -gt 0) {
    Write-Host ""
    Write-Host " ERRORS:" -ForegroundColor Red
    foreach ($e in $errors) {
        Write-Host "  - $e" -ForegroundColor Yellow
    }
}
Write-Host ""
Write-Host "Done."
