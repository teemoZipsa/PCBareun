use serde::Serialize;
use sysinfo::{Disks, System};

#[derive(Serialize)]
pub struct DiskInfo {
    pub name: String,
    pub mount_point: String,
    pub total_gb: f64,
    pub used_gb: f64,
    pub free_gb: f64,
    pub usage_percent: f64,
    pub fs_type: String,
}

#[derive(Serialize)]
pub struct SystemOverview {
    pub cpu_usage: f32,
    pub total_memory_gb: f64,
    pub used_memory_gb: f64,
    pub memory_usage_percent: f64,
    pub os_name: String,
    pub os_version: String,
    pub hostname: String,
    pub cpu_name: String,
    pub cpu_cores: usize,
    pub gpu_name: String,
    pub total_ram_gb: String,
    pub disks: Vec<DiskInfo>,
    pub uptime_seconds: u64,
}

#[tauri::command]
pub fn get_system_overview() -> SystemOverview {
    let mut sys = System::new_all();
    sys.refresh_all();

    let total_mem = sys.total_memory() as f64;
    let used_mem = sys.used_memory() as f64;
    let gb = 1_073_741_824.0;

    let disks = Disks::new_with_refreshed_list();
    let disk_list: Vec<DiskInfo> = disks
        .iter()
        .map(|d| {
            let total = d.total_space() as f64;
            let free = d.available_space() as f64;
            let used = total - free;
            DiskInfo {
                name: d.name().to_string_lossy().to_string(),
                mount_point: d.mount_point().to_string_lossy().to_string(),
                total_gb: total / gb,
                used_gb: used / gb,
                free_gb: free / gb,
                usage_percent: if total > 0.0 {
                    (used / total) * 100.0
                } else {
                    0.0
                },
                fs_type: d.file_system().to_string_lossy().to_string(),
            }
        })
        .collect();

    // GPU name — NVIDIA 외장 우선 → AMD 전용(RX) 우선 → 나머지
    let gpu_name = match crate::utils::cmd::powershell_no_window()
        .args(["-Command", r#"
$gpus = Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name
# 1순위: NVIDIA 외장 (GeForce, RTX, GTX, Quadro)
$nvidia = $gpus | Where-Object { $_ -match 'NVIDIA|GeForce|RTX|GTX|Quadro' } | Select-Object -First 1
if ($nvidia) { $nvidia; exit }
# 2순위: AMD 전용 GPU (RX 시리즈 등, '(TM) Graphics' 내장 제외)
$amdDedicated = $gpus | Where-Object { $_ -match 'RX\s?\d|Radeon\s+Pro|Radeon\s+VII' } | Select-Object -First 1
if ($amdDedicated) { $amdDedicated; exit }
# 3순위: 내장 제외한 나머지
$other = $gpus | Where-Object { $_ -notmatch 'Radeon\(TM\)\s+Graphics|Microsoft Basic|Intel.*UHD|Intel.*HD\s+Graphics' } | Select-Object -First 1
if ($other) { $other; exit }
# 최후: 아무거나 첫번째
if ($gpus) { $gpus | Select-Object -First 1 } else { '' }
"#])
        .output()
    {
        Ok(out) => {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if s.is_empty() { "알 수 없음".into() } else { s }
        }
        Err(_) => "알 수 없음".into(),
    };

    let total_ram_gb = format!("{:.1} GB", total_mem / gb);

    SystemOverview {
        cpu_usage: sys.global_cpu_usage(),
        total_memory_gb: total_mem / gb,
        used_memory_gb: used_mem / gb,
        memory_usage_percent: if total_mem > 0.0 {
            (used_mem / total_mem) * 100.0
        } else {
            0.0
        },
        os_name: System::name().unwrap_or_default(),
        os_version: System::os_version().unwrap_or_default(),
        hostname: System::host_name().unwrap_or_default(),
        cpu_name: sys
            .cpus()
            .first()
            .map(|c| c.brand().to_string())
            .unwrap_or_default(),
        cpu_cores: sys.cpus().len(),
        gpu_name,
        total_ram_gb,
        disks: disk_list,
        uptime_seconds: System::uptime(),
    }
}
