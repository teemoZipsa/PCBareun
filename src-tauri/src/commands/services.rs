use serde::Serialize;
use crate::utils::cmd::powershell_no_window;

#[derive(Serialize, serde::Deserialize, Clone)]
pub struct WindowsService {
    pub name: String,
    pub display_name: String,
    pub status: String,
    pub start_type: String,
    pub description: String,
}

#[tauri::command]
pub fn get_services() -> Result<Vec<WindowsService>, String> {
    let output = powershell_no_window()
        .args([
            "-Command",
            r#"[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$wmiMap = @{}
Get-CimInstance Win32_Service -ErrorAction SilentlyContinue | ForEach-Object { $wmiMap[$_.Name] = if($_.Description){$_.Description}else{''} }
Get-Service | ForEach-Object {
    $desc = if($wmiMap.ContainsKey($_.ServiceName) -and $wmiMap[$_.ServiceName]) { $wmiMap[$_.ServiceName] } else { '' }
    [PSCustomObject]@{
        name = $_.ServiceName
        display_name = $_.DisplayName
        status = $_.Status.ToString()
        start_type = $_.StartType.ToString()
        description = $desc
    }
} | ConvertTo-Json -Compress"#,
        ])
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

    // PowerShell may return single object or array
    let services: Vec<WindowsService> = if json_str.starts_with('[') {
        serde_json::from_str(json_str)
            .map_err(|e| format!("JSON parse error: {}", e))?
    } else {
        let single: WindowsService = serde_json::from_str(json_str)
            .map_err(|e| format!("JSON parse error: {}", e))?;
        vec![single]
    };

    Ok(services)
}

#[derive(serde::Deserialize)]
pub struct ServiceAction {
    pub name: String,
    pub action: String, // "start", "stop", "restart"
}

#[tauri::command]
pub fn control_service(payload: ServiceAction) -> Result<String, String> {
    let ps_cmd = match payload.action.as_str() {
        "start" => format!("Start-Service -Name '{}' -ErrorAction Stop", payload.name),
        "stop" => format!("Stop-Service -Name '{}' -Force -ErrorAction Stop", payload.name),
        "restart" => format!("Restart-Service -Name '{}' -Force -ErrorAction Stop", payload.name),
        _ => return Err(format!("Unknown action: {}", payload.action)),
    };

    let output = powershell_no_window()
        .args(["-Command", &ps_cmd])
        .output()
        .map_err(|e| format!("Failed to execute: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("서비스 제어 실패: {}", stderr));
    }

    Ok(format!("서비스 '{}' {} 완료", payload.name, payload.action))
}

#[tauri::command]
pub fn set_service_start_type(name: String, start_type: String) -> Result<String, String> {
    let ps_cmd = format!(
        "Set-Service -Name '{}' -StartupType '{}' -ErrorAction Stop",
        name, start_type
    );

    let output = powershell_no_window()
        .args(["-Command", &ps_cmd])
        .output()
        .map_err(|e| format!("Failed to execute: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("시작 유형 변경 실패: {}", stderr));
    }

    Ok(format!("서비스 '{}' 시작 유형을 '{}'로 변경 완료", name, start_type))
}
