use serde::Serialize;
use crate::utils::cmd::powershell_no_window;

#[derive(Serialize)]
pub struct WinControlStatus {
    pub update_paused: bool,
    pub current_power_plan: String,
    pub ultimate_available: bool,
    pub recall_disabled: bool,
    pub copilot_disabled: bool,
}

#[tauri::command]
pub async fn get_wincontrol_status() -> Result<WinControlStatus, String> {
    tauri::async_runtime::spawn_blocking(|| {
        // Windows Update 상태 확인
        let update_paused = {
            let script = r#"
try {
    $key = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'
    if (Test-Path $key) {
        $val = Get-ItemProperty $key -Name 'NoAutoUpdate' -ErrorAction SilentlyContinue
        if ($val -and $val.NoAutoUpdate -eq 1) { 'true' } else { 'false' }
    } else { 'false' }
} catch { 'false' }
"#;
            let out = powershell_no_window()
                .args(["-Command", script])
                .output()
                .map_err(|e| e.to_string())?;
            String::from_utf8_lossy(&out.stdout).trim() == "true"
        };

        // 현재 전원 관리 옵션 확인 (UTF-8 인코딩 강제)
        let current_power_plan = {
            let out = powershell_no_window()
                .args(["-Command", "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $plan = powercfg /getactivescheme; if ($plan -match '\\((.+)\\)') { $Matches[1] } else { $plan }"])
                .output()
                .map_err(|e| e.to_string())?;
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        };

        // Ultimate Performance 유무 확인
        let ultimate_available = {
            let out = powershell_no_window()
                .args(["-Command", "powercfg /list | Select-String 'e9a42b02-d5df-448d-aa00-03f14749eb61'"])
                .output()
                .map_err(|e| e.to_string())?;
            !String::from_utf8_lossy(&out.stdout).trim().is_empty()
        };

        // Windows Recall 상태 확인
        let recall_disabled = {
            let script = r#"
try {
    $key = 'HKCU:\Software\Policies\Microsoft\Windows\WindowsAI'
    if (Test-Path $key) {
        $val = Get-ItemProperty $key -Name 'DisableAIDataAnalysis' -ErrorAction SilentlyContinue
        if ($val -and $val.DisableAIDataAnalysis -eq 1) { 'true' } else { 'false' }
    } else { 'false' }
} catch { 'false' }
"#;
            let out = powershell_no_window()
                .args(["-Command", script])
                .output()
                .map_err(|e| e.to_string())?;
            String::from_utf8_lossy(&out.stdout).trim() == "true"
        };

        // Copilot 상태 확인
        let copilot_disabled = {
            let script = r#"
try {
    $key = 'HKCU:\Software\Policies\Microsoft\Windows\WindowsCopilot'
    if (Test-Path $key) {
        $val = Get-ItemProperty $key -Name 'TurnOffWindowsCopilot' -ErrorAction SilentlyContinue
        if ($val -and $val.TurnOffWindowsCopilot -eq 1) { 'true' } else { 'false' }
    } else { 'false' }
} catch { 'false' }
"#;
            let out = powershell_no_window()
                .args(["-Command", script])
                .output()
                .map_err(|e| e.to_string())?;
            String::from_utf8_lossy(&out.stdout).trim() == "true"
        };

        Ok(WinControlStatus {
            update_paused,
            current_power_plan,
            ultimate_available,
            recall_disabled,
            copilot_disabled,
        })
    })
    .await
    .map_err(|e| format!("상태 조회 실패: {}", e))?
}

#[tauri::command]
pub async fn toggle_windows_update(pause: bool) -> Result<String, String> {
    let pause_val = pause;
    tauri::async_runtime::spawn_blocking(move || {
        let script = if pause_val {
            r#"
# Windows Update 중지
$path = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'
if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
Set-ItemProperty -Path $path -Name 'NoAutoUpdate' -Value 1 -Type DWord -Force
Stop-Service wuauserv -Force -ErrorAction SilentlyContinue
Set-Service wuauserv -StartupType Disabled -ErrorAction SilentlyContinue
'ok'
"#
        } else {
            r#"
# Windows Update 재개
$path = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'
if (Test-Path $path) { Remove-ItemProperty -Path $path -Name 'NoAutoUpdate' -ErrorAction SilentlyContinue }
Set-Service wuauserv -StartupType Manual -ErrorAction SilentlyContinue
Start-Service wuauserv -ErrorAction SilentlyContinue
'ok'
"#
        };

        let output = powershell_no_window()
            .args(["-Command", script])
            .output()
            .map_err(|e| format!("실행 실패: {}", e))?;

        if output.status.success() {
            if pause_val {
                Ok("Windows 자동 업데이트가 중지되었습니다.".to_string())
            } else {
                Ok("Windows 자동 업데이트가 재개되었습니다.".to_string())
            }
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            Err(format!("관리자 권한이 필요합니다: {}", stderr))
        }
    })
    .await
    .map_err(|e| format!("작업 실패: {}", e))?
}

#[tauri::command]
pub async fn activate_ultimate_performance() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        // 1. Ultimate Performance 플랜이 없으면 활성화
        let check = powershell_no_window()
            .args(["-Command", "powercfg /list | Select-String 'e9a42b02-d5df-448d-aa00-03f14749eb61'"])
            .output()
            .map_err(|e| e.to_string())?;

        let guid = if String::from_utf8_lossy(&check.stdout).trim().is_empty() {
            // Ultimate Performance 플랜 생성
            let create = powershell_no_window()
                .args(["-Command", "powercfg /duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61"])
                .output()
                .map_err(|e| e.to_string())?;
            let out = String::from_utf8_lossy(&create.stdout).trim().to_string();
            // GUID 추출
            if let Some(start) = out.find("GUID:") {
                let rest = &out[start + 6..];
                rest.split_whitespace().next().unwrap_or("e9a42b02-d5df-448d-aa00-03f14749eb61").to_string()
            } else {
                "e9a42b02-d5df-448d-aa00-03f14749eb61".to_string()
            }
        } else {
            "e9a42b02-d5df-448d-aa00-03f14749eb61".to_string()
        };

        // 2. 활성화
        powershell_no_window()
            .args(["-Command", &format!("powercfg /setactive {}", guid)])
            .output()
            .map_err(|e| e.to_string())?;

        Ok("최고 성능(Ultimate Performance) 전원 옵션이 활성화되었습니다!".to_string())
    })
    .await
    .map_err(|e| format!("전원 설정 실패: {}", e))?
}

#[tauri::command]
pub async fn toggle_recall(disable: bool) -> Result<String, String> {
    let disable_val = disable;
    tauri::async_runtime::spawn_blocking(move || {
        let script = if disable_val {
            r#"
$path = 'HKCU:\Software\Policies\Microsoft\Windows\WindowsAI'
if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
Set-ItemProperty -Path $path -Name 'DisableAIDataAnalysis' -Value 1 -Type DWord -Force
'ok'
"#
        } else {
            r#"
$path = 'HKCU:\Software\Policies\Microsoft\Windows\WindowsAI'
if (Test-Path $path) { Remove-ItemProperty -Path $path -Name 'DisableAIDataAnalysis' -ErrorAction SilentlyContinue }
'ok'
"#
        };
        let output = powershell_no_window()
            .args(["-Command", script])
            .output()
            .map_err(|e| format!("실행 실패: {}", e))?;
        if output.status.success() {
            if disable_val { Ok("Windows Recall이 비활성화되었습니다.".to_string()) }
            else { Ok("Windows Recall이 활성화되었습니다.".to_string()) }
        } else {
            Err("설정 변경 실패".to_string())
        }
    })
    .await
    .map_err(|e| format!("작업 실패: {}", e))?
}

#[tauri::command]
pub async fn toggle_copilot(disable: bool) -> Result<String, String> {
    let disable_val = disable;
    tauri::async_runtime::spawn_blocking(move || {
        let script = if disable_val {
            r#"
$path = 'HKCU:\Software\Policies\Microsoft\Windows\WindowsCopilot'
if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
Set-ItemProperty -Path $path -Name 'TurnOffWindowsCopilot' -Value 1 -Type DWord -Force
'ok'
"#
        } else {
            r#"
$path = 'HKCU:\Software\Policies\Microsoft\Windows\WindowsCopilot'
if (Test-Path $path) { Remove-ItemProperty -Path $path -Name 'TurnOffWindowsCopilot' -ErrorAction SilentlyContinue }
'ok'
"#
        };
        let output = powershell_no_window()
            .args(["-Command", script])
            .output()
            .map_err(|e| format!("실행 실패: {}", e))?;
        if output.status.success() {
            if disable_val { Ok("Windows Copilot이 비활성화되었습니다.".to_string()) }
            else { Ok("Windows Copilot이 활성화되었습니다.".to_string()) }
        } else {
            Err("설정 변경 실패".to_string())
        }
    })
    .await
    .map_err(|e| format!("작업 실패: {}", e))?
}
