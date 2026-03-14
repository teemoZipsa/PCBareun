use serde::{Serialize, Deserialize};
use std::process::Command;

#[derive(Serialize, Deserialize, Clone)]
pub struct SoftwareInfo {
    pub name: String,
    pub current_version: String,
    pub publisher: String,
    pub install_date: String,
    pub uninstall_string: String,
}

#[tauri::command]
pub fn get_updatable_software() -> Result<Vec<SoftwareInfo>, String> {
    // Reuse installed programs list, filtering to those with version info
    let ps_script = r#"
$paths = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$results = @()
foreach ($path in $paths) {
    Get-ItemProperty $path -ErrorAction SilentlyContinue | Where-Object {
        $_.DisplayName -and $_.DisplayName.Trim() -ne '' -and $_.DisplayVersion
    } | ForEach-Object {
        $results += [PSCustomObject]@{
            name = $_.DisplayName
            current_version = if($_.DisplayVersion) { $_.DisplayVersion } else { '' }
            publisher = if($_.Publisher) { $_.Publisher } else { '' }
            install_date = if($_.InstallDate) { $_.InstallDate } else { '' }
            uninstall_string = if($_.UninstallString) { $_.UninstallString } else { '' }
        }
    }
}
$results | Sort-Object Name -Unique | ConvertTo-Json -Compress
"#;

    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", ps_script])
        .output()
        .map_err(|e| format!("PowerShell 실행 실패: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json_str = stdout.trim();

    if json_str.is_empty() {
        return Ok(Vec::new());
    }

    if json_str.starts_with('[') {
        serde_json::from_str(json_str).map_err(|e| format!("JSON 파싱 오류: {}", e))
    } else {
        match serde_json::from_str::<SoftwareInfo>(json_str) {
            Ok(s) => Ok(vec![s]),
            Err(e) => Err(format!("JSON 파싱 오류: {}", e)),
        }
    }
}

#[tauri::command]
pub fn check_winget_available() -> bool {
    Command::new("winget")
        .args(["--version"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[tauri::command]
pub fn winget_upgrade(package_name: String) -> Result<String, String> {
    let output = Command::new("winget")
        .args([
            "upgrade",
            "--name",
            &package_name,
            "--accept-source-agreements",
            "--accept-package-agreements",
            "--silent",
        ])
        .output()
        .map_err(|e| format!("winget 실행 실패: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(format!("{} 업데이트 완료", package_name))
    } else {
        Err(format!(
            "업데이트 실패: {}{}",
            stdout.trim(),
            if stderr.is_empty() {
                String::new()
            } else {
                format!("\n{}", stderr.trim())
            }
        ))
    }
}

#[tauri::command]
pub fn winget_list_upgrades() -> Result<String, String> {
    let output = Command::new("winget")
        .args(["upgrade", "--accept-source-agreements"])
        .output()
        .map_err(|e| format!("winget 실행 실패: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(stdout)
}
