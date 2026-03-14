use serde::Serialize;
use std::process::Command;

#[derive(Serialize, serde::Deserialize, Clone)]
pub struct CpuTempInfo {
    pub label: String,
    pub temperature: f64,
}

#[derive(Serialize, serde::Deserialize, Clone)]
pub struct GpuTempInfo {
    pub name: String,
    pub temperature: f64,
    pub driver: String,
}

#[derive(Serialize)]
pub struct HardwareTemps {
    pub cpu_name: String,
    pub cpu_temps: Vec<CpuTempInfo>,
    pub cpu_avg_temp: f64,
    pub gpu: Option<GpuTempInfo>,
}

// ── CPU temperature via WMI ────────────────────────────────

fn get_cpu_temps_wmi() -> Vec<CpuTempInfo> {
    // Try MSAcpi_ThermalZoneTemperature (requires admin)
    let script = r#"
try {
    $zones = Get-CimInstance MSAcpi_ThermalZoneTemperature -Namespace root/wmi -ErrorAction Stop
    $result = @()
    $idx = 0
    foreach ($z in $zones) {
        $celsius = ($z.CurrentTemperature - 2732) / 10.0
        $result += [PSCustomObject]@{
            label = "Thermal Zone $idx"
            temperature = [math]::Round($celsius, 1)
        }
        $idx++
    }
    $result | ConvertTo-Json -Compress
} catch {
    # Fallback: try Get-CimInstance Win32_PerfFormattedData for CPU
    try {
        $cpu = Get-CimInstance -ClassName Win32_Processor -ErrorAction Stop
        # Win32_Processor doesn't have temp on all systems, but let's try
        $result = @()
        foreach ($c in $cpu) {
            if ($c.PSObject.Properties['CurrentTemperature']) {
                $result += [PSCustomObject]@{
                    label = $c.Name
                    temperature = $c.CurrentTemperature
                }
            }
        }
        if ($result.Count -gt 0) {
            $result | ConvertTo-Json -Compress
        } else {
            "[]"
        }
    } catch {
        "[]"
    }
}
"#;

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if stdout.is_empty() || stdout == "[]" {
                return Vec::new();
            }
            // Handle both single object and array
            if let Ok(items) = serde_json::from_str::<Vec<CpuTempInfo>>(&stdout) {
                items
            } else if let Ok(item) = serde_json::from_str::<CpuTempInfo>(&stdout) {
                vec![item]
            } else {
                Vec::new()
            }
        }
        Err(_) => Vec::new(),
    }
}

// ── GPU temperature ────────────────────────────────────────

fn get_gpu_temp_nvidia() -> Option<GpuTempInfo> {
    // Try nvidia-smi
    let output = Command::new("nvidia-smi")
        .args([
            "--query-gpu=name,temperature.gpu,driver_version",
            "--format=csv,noheader,nounits",
        ])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let parts: Vec<&str> = stdout.split(',').map(|s| s.trim()).collect();

    if parts.len() >= 3 {
        Some(GpuTempInfo {
            name: parts[0].to_string(),
            temperature: parts[1].parse().unwrap_or(0.0),
            driver: parts[2].to_string(),
        })
    } else {
        None
    }
}

fn get_gpu_temp_wmi() -> Option<GpuTempInfo> {
    let script = r#"
try {
    $gpu = Get-CimInstance Win32_VideoController -ErrorAction Stop | Select-Object -First 1
    $name = $gpu.Name
    $driver = $gpu.DriverVersion
    # Try to get temperature from WMI performance counters
    $temp = 0
    try {
        $thermal = Get-CimInstance -Namespace root/OpenHardwareMonitor -ClassName Sensor -ErrorAction Stop |
            Where-Object { $_.SensorType -eq 'Temperature' -and $_.Name -like '*GPU*' } |
            Select-Object -First 1
        if ($thermal) { $temp = $thermal.Value }
    } catch {}
    [PSCustomObject]@{
        name = $name
        temperature = $temp
        driver = $driver
    } | ConvertTo-Json -Compress
} catch {
    ""
}
"#;

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        return None;
    }

    serde_json::from_str::<GpuTempInfo>(&stdout).ok()
}

fn get_gpu_temp() -> Option<GpuTempInfo> {
    // Try NVIDIA first, then WMI fallback
    get_gpu_temp_nvidia().or_else(get_gpu_temp_wmi)
}

// ── CPU name helper ────────────────────────────────────────

fn get_cpu_name() -> String {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "(Get-CimInstance Win32_Processor | Select-Object -First 1).Name",
        ])
        .output();

    match output {
        Ok(out) => String::from_utf8_lossy(&out.stdout).trim().to_string(),
        Err(_) => "Unknown CPU".to_string(),
    }
}

// ── Tauri command ──────────────────────────────────────────

#[tauri::command]
pub fn get_hardware_temps() -> Result<HardwareTemps, String> {
    let cpu_temps = get_cpu_temps_wmi();
    let cpu_avg = if cpu_temps.is_empty() {
        0.0
    } else {
        let sum: f64 = cpu_temps.iter().map(|t| t.temperature).sum();
        (sum / cpu_temps.len() as f64 * 10.0).round() / 10.0
    };

    Ok(HardwareTemps {
        cpu_name: get_cpu_name(),
        cpu_temps,
        cpu_avg_temp: cpu_avg,
        gpu: get_gpu_temp(),
    })
}
