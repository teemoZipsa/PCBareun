use crate::utils::cmd::powershell_no_window;
use serde::Serialize;

#[derive(Serialize)]
pub struct AutostartStatus {
    pub enabled: bool,
}

#[tauri::command]
pub fn get_autostart_status() -> Result<AutostartStatus, String> {
    let ps = r#"
$val = Get-ItemProperty -Path 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' -Name 'PCBareun' -ErrorAction SilentlyContinue
if ($val) { 'true' } else { 'false' }
"#;
    let output = powershell_no_window()
        .args(["-Command", ps])
        .output()
        .map_err(|e| format!("PowerShell 실행 실패: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(AutostartStatus {
        enabled: stdout == "true",
    })
}

#[tauri::command]
pub fn set_autostart(enable: bool) -> Result<String, String> {
    let ps = if enable {
        // Get current exe path and set it in Run key
        r#"
$exePath = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
Set-ItemProperty -Path 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' -Name 'PCBareun' -Value "`"$exePath`"" -ErrorAction Stop
Write-Output 'ok'
"#
        .to_string()
    } else {
        r#"
Remove-ItemProperty -Path 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' -Name 'PCBareun' -ErrorAction SilentlyContinue
Write-Output 'ok'
"#
        .to_string()
    };

    let output = powershell_no_window()
        .args(["-Command", &ps])
        .output()
        .map_err(|e| format!("PowerShell 실행 실패: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout == "ok" {
        Ok(if enable {
            "자동 실행이 활성화되었습니다.".to_string()
        } else {
            "자동 실행이 비활성화되었습니다.".to_string()
        })
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(format!("설정 실패: {}", stderr))
    }
}
