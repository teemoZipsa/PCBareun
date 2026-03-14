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
        disks: disk_list,
        uptime_seconds: System::uptime(),
    }
}
