use serde::Serialize;
use std::process::Command;

#[derive(Serialize, serde::Deserialize, Clone)]
pub struct InstalledProgram {
    pub name: String,
    pub publisher: String,
    pub version: String,
    pub install_date: String,
    pub size_mb: f64,
    pub uninstall_string: String,
    pub registry_key: String,
}

#[tauri::command]
pub fn get_installed_programs() -> Result<Vec<InstalledProgram>, String> {
    let ps_script = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$paths = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$results = @()
foreach ($path in $paths) {
    Get-ItemProperty $path -ErrorAction SilentlyContinue | Where-Object {
        $_.DisplayName -and $_.DisplayName.Trim() -ne ''
    } | ForEach-Object {
        $sizeKB = if($_.EstimatedSize) { [math]::Round($_.EstimatedSize / 1024, 1) } else { 0 }
        $regKey = $_.PSPath -replace '^.*\\\\', ''
        $results += [PSCustomObject]@{
            name = $_.DisplayName
            publisher = if($_.Publisher) { $_.Publisher } else { '' }
            version = if($_.DisplayVersion) { $_.DisplayVersion } else { '' }
            install_date = if($_.InstallDate) { $_.InstallDate } else { '' }
            size_mb = $sizeKB
            uninstall_string = if($_.UninstallString) { $_.UninstallString } else { '' }
            registry_key = $regKey
        }
    }
}
$results | Sort-Object name -Unique | ConvertTo-Json -Compress
"#;

    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", ps_script])
        .output()
        .map_err(|e| format!("Failed to execute PowerShell: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("PowerShell error: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json_str = stdout.trim();

    if json_str.is_empty() {
        return Ok(Vec::new());
    }

    let programs: Vec<InstalledProgram> = if json_str.starts_with('[') {
        serde_json::from_str(json_str)
            .map_err(|e| format!("JSON parse error: {}", e))?
    } else {
        let single: InstalledProgram = serde_json::from_str(json_str)
            .map_err(|e| format!("JSON parse error: {}", e))?;
        vec![single]
    };

    Ok(programs)
}

#[tauri::command]
pub fn uninstall_program(uninstall_string: String) -> Result<String, String> {
    if uninstall_string.is_empty() {
        return Err("제거 명령어가 없습니다.".to_string());
    }

    // MsiExec 기반 제거
    if uninstall_string.to_lowercase().contains("msiexec") {
        let output = Command::new("cmd")
            .args(["/C", &uninstall_string])
            .output()
            .map_err(|e| format!("제거 실행 실패: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("프로그램 제거 실패: {}", stderr));
        }
    } else {
        // 일반 uninstaller 실행
        Command::new("cmd")
            .args(["/C", &uninstall_string])
            .spawn()
            .map_err(|e| format!("제거 실행 실패: {}", e))?;
    }

    Ok("프로그램 제거가 시작되었습니다.".to_string())
}
