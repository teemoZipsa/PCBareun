use serde::Serialize;
use crate::utils::cmd::{powershell_no_window, command_no_window};
use std::env;

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

    let output = powershell_no_window()
        .args(["-Command", script])
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
    let output = command_no_window("nvidia-smi")
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

    let output = powershell_no_window()
        .args(["-Command", script])
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
    let output = powershell_no_window()
        .args([
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
pub fn restart_as_admin() -> Result<(), String> {
    let exe_path = env::current_exe()
        .map_err(|e| format!("실행 파일 경로를 찾을 수 없습니다: {}", e))?;

    powershell_no_window()
        .args([
            "-Command",
            &format!(
                "Start-Process '{}' -Verb RunAs",
                exe_path.to_string_lossy()
            ),
        ])
        .spawn()
        .map_err(|e| format!("관리자 권한 재시작 실패: {}", e))?;

    // Close current instance after a short delay
    std::thread::spawn(|| {
        std::thread::sleep(std::time::Duration::from_millis(500));
        std::process::exit(0);
    });

    Ok(())
}

#[tauri::command]
pub async fn get_hardware_temps() -> Result<HardwareTemps, String> {
    // 3개 PowerShell 호출을 병렬로 실행 → 렉 제거
    let cpu_temps_handle = tauri::async_runtime::spawn_blocking(get_cpu_temps_wmi);
    let gpu_handle = tauri::async_runtime::spawn_blocking(get_gpu_temp);
    let cpu_name_handle = tauri::async_runtime::spawn_blocking(get_cpu_name);

    let cpu_temps = cpu_temps_handle.await.unwrap_or_else(|_| Vec::new());
    let gpu = gpu_handle.await.unwrap_or(None);
    let cpu_name = cpu_name_handle.await.unwrap_or_else(|_| "Unknown CPU".into());

    let cpu_avg = if cpu_temps.is_empty() {
        0.0
    } else {
        let sum: f64 = cpu_temps.iter().map(|t| t.temperature).sum();
        (sum / cpu_temps.len() as f64 * 10.0).round() / 10.0
    };

    Ok(HardwareTemps {
        cpu_name,
        cpu_temps,
        cpu_avg_temp: cpu_avg,
        gpu,
    })
}

// ── GPU VRAM 사용량 ────────────────────────────────

#[derive(Serialize)]
pub struct GpuUsageInfo {
    pub name: String,
    pub utilization: f64,
    pub vram_total_mb: f64,
    pub vram_used_mb: f64,
    pub vram_free_mb: f64,
    pub vram_usage_percent: f64,
}

#[tauri::command]
pub fn get_gpu_usage() -> Result<Option<GpuUsageInfo>, String> {
    let output = command_no_window("nvidia-smi")
        .args(["--query-gpu=name,utilization.gpu,memory.total,memory.used,memory.free", "--format=csv,noheader,nounits"])
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let parts: Vec<&str> = s.split(',').map(|p| p.trim()).collect();
            if parts.len() >= 5 {
                let vram_total = parts[2].parse::<f64>().unwrap_or(0.0);
                let vram_used = parts[3].parse::<f64>().unwrap_or(0.0);
                let vram_free = parts[4].parse::<f64>().unwrap_or(0.0);
                Ok(Some(GpuUsageInfo {
                    name: parts[0].to_string(),
                    utilization: parts[1].parse::<f64>().unwrap_or(0.0),
                    vram_total_mb: vram_total,
                    vram_used_mb: vram_used,
                    vram_free_mb: vram_free,
                    vram_usage_percent: if vram_total > 0.0 { (vram_used / vram_total) * 100.0 } else { 0.0 },
                }))
            } else {
                Ok(None)
            }
        }
        _ => Ok(None),
    }
}

// ── VRAM 좀비 프로세스 킬러 ────────────────────────────────

#[derive(Serialize)]
pub struct VramKillResult {
    pub killed_count: usize,
    pub vram_before_mb: f64,
    pub vram_after_mb: f64,
    pub freed_mb: f64,
}

#[tauri::command]
pub fn kill_vram_zombies() -> Result<VramKillResult, String> {
    // 1. 현재 VRAM 사용량
    let before = get_gpu_usage().unwrap_or(None);
    let vram_before = before.as_ref().map(|g| g.vram_used_mb).unwrap_or(0.0);

    // 2. nvidia-smi로 GPU를 사용 중인 프로세스 조회
    let ps = r#"
$procs = nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader,nounits 2>$null
$killed = 0
foreach ($line in $procs -split "`n") {
    $parts = $line.Trim() -split ','
    if ($parts.Length -ge 2) {
        $pid = $parts[0].Trim()
        $name = $parts[1].Trim().ToLower()
        # AI/개발 관련 프로세스만 종료 (python, node, ollama 등)
        if ($name -match 'python|node|ollama|llama|server|uvicorn|gunicorn|flask|fastapi|gradio') {
            try {
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                $killed++
            } catch {}
        }
    }
}
Write-Output $killed
"#;

    let output = powershell_no_window()
        .args(["-Command", ps])
        .output()
        .map_err(|e| format!("PowerShell 실행 실패: {}", e))?;

    let killed_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let killed_count = killed_str.parse::<usize>().unwrap_or(0);

    // 3. 잠시 대기 후 VRAM 재측정
    std::thread::sleep(std::time::Duration::from_secs(2));
    let after = get_gpu_usage().unwrap_or(None);
    let vram_after = after.as_ref().map(|g| g.vram_used_mb).unwrap_or(0.0);

    Ok(VramKillResult {
        killed_count,
        vram_before_mb: vram_before,
        vram_after_mb: vram_after,
        freed_mb: (vram_before - vram_after).max(0.0),
    })
}
