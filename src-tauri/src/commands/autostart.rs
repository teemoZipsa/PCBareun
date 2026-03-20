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
        // 현재 앱의 exe 경로를 Rust에서 가져옴 (PowerShell에서 가져오면 powershell.exe가 됨)
        let exe_path = std::env::current_exe()
            .map_err(|e| format!("exe 경로 가져오기 실패: {}", e))?;
        let exe_str = exe_path.to_string_lossy().to_string();
        format!(
            r#"
Set-ItemProperty -Path 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' -Name 'PCBareun' -Value '"{}"' -ErrorAction Stop
Write-Output 'ok'
"#,
            exe_str
        )
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
