use serde::{Serialize, Deserialize};
use crate::utils::cmd::powershell_no_window;

#[derive(Serialize, Deserialize, Clone)]
pub struct BloatwareApp {
    pub name: String,
    pub package_name: String,
    pub publisher: String,
    pub is_removable: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TelemetrySetting {
    pub id: String,
    pub name: String,
    pub description: String,
    pub is_enabled: bool,
    pub category: String, // "telemetry", "privacy", "ads", "suggestions"
    pub requires_admin: bool,
}

#[derive(Serialize)]
pub struct DebloatStatus {
    pub bloatware: Vec<BloatwareApp>,
    pub telemetry_settings: Vec<TelemetrySetting>,
}

#[tauri::command]
pub fn get_debloat_status() -> Result<DebloatStatus, String> {
    // 1. Get installed bloatware apps
    let apps_script = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$bloatList = @(
    'Microsoft.BingNews',
    'Microsoft.BingWeather',
    'Microsoft.GetHelp',
    'Microsoft.Getstarted',
    'Microsoft.MicrosoftOfficeHub',
    'Microsoft.MicrosoftSolitaireCollection',
    'Microsoft.People',
    'Microsoft.PowerAutomateDesktop',
    'Microsoft.Todos',
    'Microsoft.WindowsAlarms',
    'Microsoft.WindowsCommunicationsApps',
    'Microsoft.WindowsFeedbackHub',
    'Microsoft.WindowsMaps',
    'Microsoft.WindowsSoundRecorder',
    'Microsoft.Xbox.TCUI',
    'Microsoft.XboxGameOverlay',
    'Microsoft.XboxGamingOverlay',
    'Microsoft.XboxIdentityProvider',
    'Microsoft.XboxSpeechToTextOverlay',
    'Microsoft.YourPhone',
    'Microsoft.ZuneMusic',
    'Microsoft.ZuneVideo',
    'MicrosoftTeams',
    'Clipchamp.Clipchamp',
    'Microsoft.549981C3F5F10',
    'Microsoft.GamingApp',
    'Microsoft.ScreenSketch',
    'Microsoft.MicrosoftStickyNotes',
    'Microsoft.WindowsCamera',
    'microsoft.windowscommunicationsapps'
)
$installed = Get-AppxPackage -ErrorAction SilentlyContinue | Where-Object { $bloatList -contains $_.Name }
$result = @()
foreach ($app in $installed) {
    $result += [PSCustomObject]@{
        name = if($app.Name -match 'BingNews') { 'Bing 뉴스' }
               elseif($app.Name -match 'BingWeather') { 'Bing 날씨' }
               elseif($app.Name -match 'GetHelp') { '도움말' }
               elseif($app.Name -match 'Getstarted') { '시작' }
               elseif($app.Name -match 'MicrosoftOfficeHub') { 'Office Hub' }
               elseif($app.Name -match 'SolitaireCollection') { '솔리테어 컬렉션' }
               elseif($app.Name -match 'People') { 'Microsoft People' }
               elseif($app.Name -match 'PowerAutomate') { 'Power Automate' }
               elseif($app.Name -match 'Todos') { 'Microsoft To Do' }
               elseif($app.Name -match 'WindowsAlarms') { '알람 및 시계' }
               elseif($app.Name -match 'WindowsCommunications') { '메일 및 캘린더' }
               elseif($app.Name -match 'FeedbackHub') { '피드백 허브' }
               elseif($app.Name -match 'WindowsMaps') { 'Windows 지도' }
               elseif($app.Name -match 'SoundRecorder') { '녹음기' }
               elseif($app.Name -match 'Xbox.TCUI') { 'Xbox UI 프레임워크' }
               elseif($app.Name -match 'XboxGameOverlay') { 'Xbox 게임 오버레이' }
               elseif($app.Name -match 'XboxGamingOverlay') { 'Xbox 게이밍 오버레이' }
               elseif($app.Name -match 'XboxIdentityProvider') { 'Xbox 자격 증명 (로그인)' }
               elseif($app.Name -match 'XboxSpeechToTextOverlay') { 'Xbox 음성 인식 오버레이' }
               elseif($app.Name -match 'Xbox') { 'Xbox 플러그인' }
               elseif($app.Name -match 'YourPhone') { 'Phone Link' }
               elseif($app.Name -match 'ZuneMusic') { 'Groove 음악' }
               elseif($app.Name -match 'ZuneVideo') { '영화 및 TV' }
               elseif($app.Name -match 'Teams') { 'Microsoft Teams' }
               elseif($app.Name -match 'Clipchamp') { 'Clipchamp' }
               elseif($app.Name -match '549981C3F5F10') { 'Cortana' }
               elseif($app.Name -match 'GamingApp') { 'Xbox App' }
               elseif($app.Name -match 'ScreenSketch') { '캡처 및 스케치' }
               elseif($app.Name -match 'StickyNotes') { '스티커 메모' }
               elseif($app.Name -match 'WindowsCamera') { 'Windows 카메라' }
               else { $app.Name }
        package_name = $app.Name
        publisher = if($app.Publisher) { $app.Publisher } else { '' }
        is_removable = $true
    }
}
if ($result.Count -eq 0) { '[]' } else { $result | ConvertTo-Json -Compress }
"#;

    let apps_output = powershell_no_window()
        .args(["-Command", apps_script])
        .output()
        .map_err(|e| format!("PowerShell 실행 실패: {}", e))?;

    let apps_stdout = String::from_utf8_lossy(&apps_output.stdout).trim().to_string();
    let bloatware: Vec<BloatwareApp> = if apps_stdout.is_empty() || apps_stdout == "[]" {
        Vec::new()
    } else if apps_stdout.starts_with('[') {
        serde_json::from_str(&apps_stdout).unwrap_or_default()
    } else {
        serde_json::from_str::<BloatwareApp>(&apps_stdout)
            .map(|a| vec![a])
            .unwrap_or_default()
    };

    // 2. Check telemetry settings
    let telemetry_script = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$settings = @()

# Telemetry level
try {
    $val = (Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection' -Name AllowTelemetry -ErrorAction SilentlyContinue).AllowTelemetry
    $settings += [PSCustomObject]@{
        id = 'telemetry_level'
        name = 'Windows 원격 분석 데이터'
        description = 'Microsoft에 진단 데이터를 전송합니다'
        is_enabled = if($val -eq $null -or $val -gt 0) { $true } else { $false }
        category = 'telemetry'
        requires_admin = $true
    }
} catch {
    $settings += [PSCustomObject]@{
        id = 'telemetry_level'
        name = 'Windows 원격 분석 데이터'
        description = 'Microsoft에 진단 데이터를 전송합니다'
        is_enabled = $true
        category = 'telemetry'
        requires_admin = $true
    }
}

# Advertising ID
try {
    $val = (Get-ItemProperty 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\AdvertisingInfo' -Name Enabled -ErrorAction SilentlyContinue).Enabled
    $settings += [PSCustomObject]@{
        id = 'advertising_id'
        name = '광고 ID'
        description = '앱에서 개인 맞춤 광고에 광고 ID를 사용합니다'
        is_enabled = if($val -eq $null -or $val -eq 1) { $true } else { $false }
        category = 'ads'
        requires_admin = $false
    }
} catch {
    $settings += [PSCustomObject]@{
        id = 'advertising_id'
        name = '광고 ID'
        description = '앱에서 개인 맞춤 광고에 광고 ID를 사용합니다'
        is_enabled = $true
        category = 'ads'
        requires_admin = $false
    }
}

# Start menu suggestions
try {
    $val = (Get-ItemProperty 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\ContentDeliveryManager' -Name SubscribedContent-338388Enabled -ErrorAction SilentlyContinue).'SubscribedContent-338388Enabled'
    $settings += [PSCustomObject]@{
        id = 'start_suggestions'
        name = '시작 메뉴 제안 앱'
        description = '시작 메뉴에 앱 추천 광고를 표시합니다'
        is_enabled = if($val -eq $null -or $val -eq 1) { $true } else { $false }
        category = 'suggestions'
        requires_admin = $false
    }
} catch {
    $settings += [PSCustomObject]@{
        id = 'start_suggestions'
        name = '시작 메뉴 제안 앱'
        description = '시작 메뉴에 앱 추천 광고를 표시합니다'
        is_enabled = $true
        category = 'suggestions'
        requires_admin = $false
    }
}

# Lock screen tips
try {
    $val = (Get-ItemProperty 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\ContentDeliveryManager' -Name RotatingLockScreenOverlayEnabled -ErrorAction SilentlyContinue).RotatingLockScreenOverlayEnabled
    $settings += [PSCustomObject]@{
        id = 'lockscreen_tips'
        name = '잠금 화면 팁/광고'
        description = '잠금 화면에 팁, 요령 및 광고를 표시합니다'
        is_enabled = if($val -eq $null -or $val -eq 1) { $true } else { $false }
        category = 'suggestions'
        requires_admin = $false
    }
} catch {
    $settings += [PSCustomObject]@{
        id = 'lockscreen_tips'
        name = '잠금 화면 팁/광고'
        description = '잠금 화면에 팁, 요령 및 광고를 표시합니다'
        is_enabled = $true
        category = 'suggestions'
        requires_admin = $false
    }
}

# Timeline / Activity History
try {
    $val = (Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' -Name EnableActivityFeed -ErrorAction SilentlyContinue).EnableActivityFeed
    $settings += [PSCustomObject]@{
        id = 'activity_history'
        name = '활동 기록'
        description = 'Windows에서 사용자의 활동 기록을 수집합니다'
        is_enabled = if($val -eq $null -or $val -eq 1) { $true } else { $false }
        category = 'privacy'
        requires_admin = $true
    }
} catch {
    $settings += [PSCustomObject]@{
        id = 'activity_history'
        name = '활동 기록'
        description = 'Windows에서 사용자의 활동 기록을 수집합니다'
        is_enabled = $true
        category = 'privacy'
        requires_admin = $true
    }
}

# Location tracking
try {
    $val = (Get-ItemProperty 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\location' -Name Value -ErrorAction SilentlyContinue).Value
    $settings += [PSCustomObject]@{
        id = 'location_tracking'
        name = '위치 추적'
        description = '앱에서 사용자의 위치 정보에 접근합니다'
        is_enabled = if($val -eq 'Allow') { $true } else { $false }
        category = 'privacy'
        requires_admin = $false
    }
} catch {
    $settings += [PSCustomObject]@{
        id = 'location_tracking'
        name = '위치 추적'
        description = '앱에서 사용자의 위치 정보에 접근합니다'
        is_enabled = $true
        category = 'privacy'
        requires_admin = $false
    }
}

# Clipboard history sync
try {
    $val = (Get-ItemProperty 'HKCU:\SOFTWARE\Microsoft\Clipboard' -Name EnableClipboardHistory -ErrorAction SilentlyContinue).EnableClipboardHistory
    $settings += [PSCustomObject]@{
        id = 'clipboard_sync'
        name = '클립보드 기록 동기화'
        description = '장치 간 클립보드 기록을 동기화합니다'
        is_enabled = if($val -eq 1) { $true } else { $false }
        category = 'privacy'
        requires_admin = $false
    }
} catch {
    $settings += [PSCustomObject]@{
        id = 'clipboard_sync'
        name = '클립보드 기록 동기화'
        description = '장치 간 클립보드 기록을 동기화합니다'
        is_enabled = $false
        category = 'privacy'
        requires_admin = $false
    }
}

$settings | ConvertTo-Json -Compress
"#;

    let tele_output = powershell_no_window()
        .args(["-Command", telemetry_script])
        .output()
        .map_err(|e| format!("PowerShell 실행 실패: {}", e))?;

    let tele_stdout = String::from_utf8_lossy(&tele_output.stdout).trim().to_string();
    let telemetry_settings: Vec<TelemetrySetting> = if tele_stdout.is_empty() || tele_stdout == "[]" {
        Vec::new()
    } else if tele_stdout.starts_with('[') {
        serde_json::from_str(&tele_stdout).unwrap_or_default()
    } else {
        serde_json::from_str::<TelemetrySetting>(&tele_stdout)
            .map(|t| vec![t])
            .unwrap_or_default()
    };

    Ok(DebloatStatus {
        bloatware,
        telemetry_settings,
    })
}

#[tauri::command]
pub fn remove_bloatware_apps(package_names: Vec<String>) -> Result<String, String> {
    let mut removed = 0;
    let mut failed = 0;

    for pkg in &package_names {
        let cmd = format!(
            "Get-AppxPackage '{}' -ErrorAction SilentlyContinue | Remove-AppxPackage -ErrorAction Stop",
            pkg
        );
        let output = powershell_no_window()
            .args(["-Command", &cmd])
            .output();

        match output {
            Ok(out) if out.status.success() => removed += 1,
            _ => failed += 1,
        }
    }

    Ok(format!("{}개 앱 제거 완료, {}개 실패", removed, failed))
}

#[tauri::command]
pub fn toggle_telemetry_setting(setting_id: String, enable: bool) -> Result<String, String> {
    let ps_cmd = match setting_id.as_str() {
        "telemetry_level" => {
            if enable {
                "Remove-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection' -Name AllowTelemetry -ErrorAction SilentlyContinue".to_string()
            } else {
                "New-Item -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection' -Force | Out-Null; Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection' -Name AllowTelemetry -Value 0 -Type DWord -Force".to_string()
            }
        }
        "advertising_id" => {
            let val = if enable { 1 } else { 0 };
            format!("Set-ItemProperty -Path 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo' -Name Enabled -Value {} -Type DWord -Force", val)
        }
        "start_suggestions" => {
            let val = if enable { 1 } else { 0 };
            format!("Set-ItemProperty -Path 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager' -Name 'SubscribedContent-338388Enabled' -Value {} -Type DWord -Force", val)
        }
        "lockscreen_tips" => {
            let val = if enable { 1 } else { 0 };
            format!("Set-ItemProperty -Path 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager' -Name RotatingLockScreenOverlayEnabled -Value {} -Type DWord -Force", val)
        }
        "activity_history" => {
            if enable {
                "Remove-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System' -Name EnableActivityFeed -ErrorAction SilentlyContinue".to_string()
            } else {
                "New-Item -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System' -Force | Out-Null; Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System' -Name EnableActivityFeed -Value 0 -Type DWord -Force".to_string()
            }
        }
        "location_tracking" => {
            let val = if enable { "Allow" } else { "Deny" };
            format!("Set-ItemProperty -Path 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location' -Name Value -Value '{}' -Force", val)
        }
        "clipboard_sync" => {
            let val = if enable { 1 } else { 0 };
            format!("Set-ItemProperty -Path 'HKCU:\\SOFTWARE\\Microsoft\\Clipboard' -Name EnableClipboardHistory -Value {} -Type DWord -Force", val)
        }
        _ => return Err(format!("알 수 없는 설정: {}", setting_id)),
    };

    let output = powershell_no_window()
        .args(["-Command", &ps_cmd])
        .output()
        .map_err(|e| format!("설정 변경 실패: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("설정 변경 실패: {}", stderr));
    }

    Ok(if enable {
        "설정이 활성화되었습니다.".to_string()
    } else {
        "설정이 비활성화되었습니다.".to_string()
    })
}

/* ── Unused Programs Detection ── */

#[derive(Serialize, Deserialize, Clone)]
pub struct UnusedProgram {
    pub name: String,
    pub publisher: String,
    pub version: String,
    pub install_date: String,
    pub last_modified: String,
    pub size_mb: f64,
    pub install_location: String,
    pub days_unused: u64,
    pub uninstall_string: String,
}

#[tauri::command]
pub fn get_unused_programs(min_years: u32) -> Result<Vec<UnusedProgram>, String> {
    let ps_script = format!(r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$minDays = {} * 365
$now = Get-Date
$results = @()

$uninstPaths = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
)

foreach ($up in $uninstPaths) {{
    Get-ItemProperty $up -ErrorAction SilentlyContinue | Where-Object {{ $_.DisplayName }} | ForEach-Object {{
        $loc = $_.InstallLocation
        if (-not $loc -or $loc -eq '') {{ return }}
        $loc = $loc.TrimEnd('\')
        if (-not (Test-Path $loc -ErrorAction SilentlyContinue)) {{ return }}

        try {{
            $dir = Get-Item $loc -ErrorAction SilentlyContinue
            if (-not $dir) {{ return }}

            # 1. Check last write time of the directory and immediate children
            $lastWrite = $dir.LastWriteTime
            $children = Get-ChildItem $loc -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 5
            foreach ($c in $children) {{
                if ($c.LastWriteTime -gt $lastWrite) {{
                    $lastWrite = $c.LastWriteTime
                }}
            }}

            # 2. Check Prefetch for actual execution timestamps (more accurate)
            try {{
                $exeFiles = Get-ChildItem $loc -Filter '*.exe' -File -Recurse -Depth 1 -ErrorAction SilentlyContinue | Select-Object -First 3
                foreach ($exe in $exeFiles) {{
                    $pfPattern = $exe.BaseName.ToUpper() + '-*.pf'
                    $pfFiles = Get-ChildItem 'C:\Windows\Prefetch' -Filter $pfPattern -File -ErrorAction SilentlyContinue
                    foreach ($pf in $pfFiles) {{
                        if ($pf.LastWriteTime -gt $lastWrite) {{
                            $lastWrite = $pf.LastWriteTime
                        }}
                    }}
                }}
            }} catch {{}}  # Prefetch may require admin — fallback silently

            $daysSince = ($now - $lastWrite).Days
            if ($daysSince -ge $minDays) {{
                # Estimate size
                $sizeMB = 0
                try {{
                    $sizeVal = $_.EstimatedSize
                    if ($sizeVal) {{ $sizeMB = [math]::Round($sizeVal / 1024, 1) }}
                }} catch {{}}

                $installDate = if ($_.InstallDate) {{ $_.InstallDate }} else {{ '' }}

                $results += [PSCustomObject]@{{
                    name = $_.DisplayName
                    publisher = if ($_.Publisher) {{ $_.Publisher }} else {{ '' }}
                    version = if ($_.DisplayVersion) {{ $_.DisplayVersion }} else {{ '' }}
                    install_date = $installDate
                    last_modified = $lastWrite.ToString('yyyy-MM-dd')
                    size_mb = $sizeMB
                    install_location = $loc
                    days_unused = $daysSince
                    uninstall_string = if ($_.UninstallString) {{ $_.UninstallString }} else {{ '' }}
                }}
            }}
        }} catch {{}}
    }}
}}

# Deduplicate by name
$results = $results | Sort-Object name -Unique
if ($results.Count -eq 0) {{ '[]' }} else {{ $results | ConvertTo-Json -Compress }}
"#, min_years);

    let output = powershell_no_window()
        .args(["-Command", &ps_script])
        .output()
        .map_err(|e| format!("PowerShell 실행 실패: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() || stdout == "[]" {
        return Ok(Vec::new());
    }

    if stdout.starts_with('[') {
        serde_json::from_str(&stdout).map_err(|e| format!("JSON 파싱 오류: {}", e))
    } else {
        match serde_json::from_str::<UnusedProgram>(&stdout) {
            Ok(item) => Ok(vec![item]),
            Err(e) => Err(format!("JSON 파싱 오류: {}", e)),
        }
    }
}
