use serde::{Serialize, Deserialize};
use crate::utils::cmd::powershell_no_window;

#[derive(Serialize, Deserialize, Clone)]
pub struct StartupItem {
    pub name: String,
    pub command: String,
    pub location: String, // "HKCU_Run", "HKLM_Run", "Startup_Folder"
    pub enabled: bool,
    pub publisher: String,
}

#[tauri::command]
pub fn get_startup_items() -> Result<Vec<StartupItem>, String> {
    let ps_script = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$items = @()

# 1. HKCU Run
try {
    $path = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run'
    if (Test-Path $path) {
        $props = Get-ItemProperty $path -ErrorAction SilentlyContinue
        if ($props) {
            $props.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {
                $items += [PSCustomObject]@{
                    name = $_.Name
                    command = $_.Value
                    location = 'HKCU_Run'
                    enabled = $true
                    publisher = ''
                }
            }
        }
    }
    # Disabled items
    $disPath = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
    if (Test-Path $disPath) {
        $disProps = Get-ItemProperty $disPath -ErrorAction SilentlyContinue
        if ($disProps) {
            $disProps.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {
                $bytes = $_.Value
                if ($bytes -is [byte[]] -and $bytes.Length -ge 1) {
                    $isDisabled = ($bytes[0] -band 1) -eq 0 -and ($bytes[0] -ne 2)
                    if ($bytes[0] -eq 3) { $isDisabled = $true }
                    # Find matching item and update enabled status
                    $matchName = $_.Name
                    $found = $false
                    foreach ($item in $items) {
                        if ($item.name -eq $matchName -and $item.location -eq 'HKCU_Run') {
                            if ($isDisabled) { $item.enabled = $false }
                            $found = $true
                            break
                        }
                    }
                    # If not in Run but in StartupApproved, it's a disabled entry
                    if (-not $found -and $isDisabled) {
                        $items += [PSCustomObject]@{
                            name = $matchName
                            command = '(비활성화됨)'
                            location = 'HKCU_Run'
                            enabled = $false
                            publisher = ''
                        }
                    }
                }
            }
        }
    }
} catch {}

# 2. HKLM Run
try {
    $path = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run'
    if (Test-Path $path) {
        $props = Get-ItemProperty $path -ErrorAction SilentlyContinue
        if ($props) {
            $props.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {
                $items += [PSCustomObject]@{
                    name = $_.Name
                    command = $_.Value
                    location = 'HKLM_Run'
                    enabled = $true
                    publisher = ''
                }
            }
        }
    }
    # Disabled items
    $disPath = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
    if (Test-Path $disPath) {
        $disProps = Get-ItemProperty $disPath -ErrorAction SilentlyContinue
        if ($disProps) {
            $disProps.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {
                $bytes = $_.Value
                if ($bytes -is [byte[]] -and $bytes.Length -ge 1) {
                    $isDisabled = ($bytes[0] -band 1) -eq 0 -and ($bytes[0] -ne 2)
                    if ($bytes[0] -eq 3) { $isDisabled = $true }
                    $matchName = $_.Name
                    foreach ($item in $items) {
                        if ($item.name -eq $matchName -and $item.location -eq 'HKLM_Run') {
                            if ($isDisabled) { $item.enabled = $false }
                            break
                        }
                    }
                }
            }
        }
    }
} catch {}

# 3. Startup Folder
try {
    $startupPath = [Environment]::GetFolderPath('Startup')
    if (Test-Path $startupPath) {
        Get-ChildItem $startupPath -File -ErrorAction SilentlyContinue | ForEach-Object {
            $items += [PSCustomObject]@{
                name = $_.BaseName
                command = $_.FullName
                location = 'Startup_Folder'
                enabled = $true
                publisher = ''
            }
        }
    }
} catch {}

# Try to get publisher info from exe paths
foreach ($item in $items) {
    try {
        $cmd = $item.command
        if ($cmd -match '"([^"]+\.exe)"') { $exePath = $Matches[1] }
        elseif ($cmd -match '^([^\s]+\.exe)') { $exePath = $Matches[1] }
        else { continue }
        $exePath = [Environment]::ExpandEnvironmentVariables($exePath)
        if (Test-Path $exePath -ErrorAction SilentlyContinue) {
            $ver = (Get-Item $exePath -ErrorAction SilentlyContinue).VersionInfo
            if ($ver.CompanyName) { $item.publisher = $ver.CompanyName }
        }
    } catch {}
}

if ($items.Count -eq 0) { '[]' } else { $items | ConvertTo-Json -Compress }
"#;

    let output = powershell_no_window()
        .args(["-Command", ps_script])
        .output()
        .map_err(|e| format!("PowerShell 실행 실패: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() || stdout == "[]" {
        return Ok(Vec::new());
    }

    if stdout.starts_with('[') {
        serde_json::from_str(&stdout).map_err(|e| format!("JSON 파싱 오류: {}", e))
    } else {
        match serde_json::from_str::<StartupItem>(&stdout) {
            Ok(item) => Ok(vec![item]),
            Err(e) => Err(format!("JSON 파싱 오류: {}", e)),
        }
    }
}

#[tauri::command]
pub fn toggle_startup_item(name: String, location: String, enable: bool) -> Result<String, String> {
    let ps_cmd = match location.as_str() {
        "HKCU_Run" => {
            if enable {
                // Set StartupApproved byte to 02 (enabled)
                format!(
                    "Set-ItemProperty -Path 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run' -Name '{}' -Value ([byte[]](0x02,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00)) -Type Binary -Force",
                    name
                )
            } else {
                // Set StartupApproved byte to 03 (disabled)
                format!(
                    "Set-ItemProperty -Path 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run' -Name '{}' -Value ([byte[]](0x03,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00)) -Type Binary -Force",
                    name
                )
            }
        }
        "HKLM_Run" => {
            if enable {
                format!(
                    "Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run' -Name '{}' -Value ([byte[]](0x02,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00)) -Type Binary -Force",
                    name
                )
            } else {
                format!(
                    "Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run' -Name '{}' -Value ([byte[]](0x03,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00)) -Type Binary -Force",
                    name
                )
            }
        }
        "Startup_Folder" => {
            return Err("시작 폴더 항목은 파일을 직접 삭제하거나 복원해야 합니다.".into());
        }
        _ => return Err(format!("알 수 없는 위치: {}", location)),
    };

    let output = powershell_no_window()
        .args(["-Command", &ps_cmd])
        .output()
        .map_err(|e| format!("실행 실패: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("Access") || stderr.contains("denied") {
            return Err("관리자 권한이 필요합니다.".into());
        }
        return Err(format!("설정 변경 실패: {}", stderr));
    }

    Ok(if enable {
        format!("'{}' 시작 프로그램이 활성화되었습니다.", name)
    } else {
        format!("'{}' 시작 프로그램이 비활성화되었습니다.", name)
    })
}
