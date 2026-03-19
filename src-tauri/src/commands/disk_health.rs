use serde::Serialize;
use crate::utils::cmd::powershell_no_window;

#[derive(Serialize, serde::Deserialize, Clone)]
pub struct DiskHealthInfo {
    pub model: String,
    pub serial: String,
    pub media_type: String,
    pub size_gb: f64,
    pub health_status: String,
    pub temperature: Option<f64>,
    pub power_on_hours: Option<u64>,
    pub read_errors: Option<u64>,
    pub write_errors: Option<u64>,
    pub wear_level: Option<u64>,
    pub needs_admin: bool,
}

#[tauri::command]
pub fn get_disk_health() -> Result<Vec<DiskHealthInfo>, String> {
    let script = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$disks = Get-PhysicalDisk -ErrorAction Stop
$result = @()
foreach ($d in $disks) {
    $rel = $null
    $needsAdmin = $false
    try {
        $rel = $d | Get-StorageReliabilityCounter -ErrorAction Stop
    } catch {
        $needsAdmin = $true
    }

    $sizeGb = [math]::Round($d.Size / 1GB, 1)
    $mediaType = switch ($d.MediaType) {
        4 { "SSD" }
        3 { "HDD" }
        0 { "Unknown" }
        default { $d.MediaType.ToString() }
    }
    $health = switch ($d.HealthStatus) {
        0 { "Healthy" }
        1 { "Warning" }
        2 { "Unhealthy" }
        default { $d.HealthStatus.ToString() }
    }
    if ($d.HealthStatus -is [string]) { $health = $d.HealthStatus }

    $obj = [PSCustomObject]@{
        model = $d.FriendlyName
        serial = if ($d.SerialNumber) { $d.SerialNumber.Trim() } else { "" }
        media_type = $mediaType
        size_gb = $sizeGb
        health_status = $health
        temperature = $null
        power_on_hours = $null
        read_errors = $null
        write_errors = $null
        wear_level = $null
        needs_admin = $needsAdmin
    }

    if ($rel) {
        $obj.temperature = $rel.Temperature
        $obj.power_on_hours = $rel.PowerOnHours
        $obj.read_errors = $rel.ReadErrorsTotal
        $obj.write_errors = $rel.WriteErrorsTotal
        $obj.wear_level = $rel.Wear
    }

    $result += $obj
}
$result | ConvertTo-Json -Compress
"#;

    let output = powershell_no_window()
        .args(["-Command", script])
        .output()
        .map_err(|e| format!("PowerShell 실행 실패: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if stdout.is_empty() {
        return Ok(Vec::new());
    }

    if let Ok(items) = serde_json::from_str::<Vec<DiskHealthInfo>>(&stdout) {
        Ok(items)
    } else if let Ok(item) = serde_json::from_str::<DiskHealthInfo>(&stdout) {
        Ok(vec![item])
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("디스크 정보 파싱 실패: {}", stderr))
    }
}
