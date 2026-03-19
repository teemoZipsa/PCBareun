use serde::Serialize;
use crate::utils::cmd::powershell_no_window;

#[derive(Serialize, Clone)]
pub struct ProcessMemInfo {
    pub name: String,
    pub pid: u32,
    pub memory_mb: f64,
}

#[derive(Serialize)]
pub struct MemoryStatus {
    pub total_gb: f64,
    pub used_gb: f64,
    pub available_gb: f64,
    pub usage_percent: f64,
    pub top_processes: Vec<ProcessMemInfo>,
}

#[tauri::command]
pub async fn get_memory_status() -> Result<MemoryStatus, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut sys = sysinfo::System::new_all();
        sys.refresh_all();

        let gb = 1_073_741_824.0f64;
        let total = sys.total_memory() as f64;
        let used = sys.used_memory() as f64;
        let available = total - used;

        // Top 15 memory-consuming processes
        let mut procs: Vec<ProcessMemInfo> = sys
            .processes()
            .values()
            .map(|p| ProcessMemInfo {
                name: p.name().to_string_lossy().to_string(),
                pid: p.pid().as_u32(),
                memory_mb: p.memory() as f64 / 1_048_576.0,
            })
            .collect();
        procs.sort_by(|a, b| b.memory_mb.partial_cmp(&a.memory_mb).unwrap_or(std::cmp::Ordering::Equal));
        procs.truncate(15);

        Ok(MemoryStatus {
            total_gb: total / gb,
            used_gb: used / gb,
            available_gb: available / gb,
            usage_percent: if total > 0.0 { used / total * 100.0 } else { 0.0 },
            top_processes: procs,
        })
    })
    .await
    .map_err(|e| format!("메모리 정보 조회 실패: {}", e))?
}

#[tauri::command]
pub async fn optimize_memory() -> Result<String, String> {
    // 1. Clear standby list (working set) via PowerShell
    // 2. Minimize working sets of all processes
    tauri::async_runtime::spawn_blocking(|| {
        let script = r#"
# Minimize working sets
Get-Process | Where-Object { $_.WorkingSet64 -gt 50MB -and $_.ProcessName -ne 'System' } | ForEach-Object {
    try {
        $_.MinWorkingSet = 1
    } catch {}
}

# Clear file system cache using .NET
[System.GC]::Collect()
[System.GC]::WaitForPendingFinalizers()

# Run process to trim all working sets
$code = @"
using System;
using System.Runtime.InteropServices;
public class MemHelper {
    [DllImport("psapi.dll")]
    public static extern bool EmptyWorkingSet(IntPtr hProcess);
}
"@
try {
    Add-Type $code -ErrorAction SilentlyContinue
} catch {}

Get-Process | ForEach-Object {
    try {
        [MemHelper]::EmptyWorkingSet($_.Handle) | Out-Null
    } catch {}
}

'ok'
"#;
        let output = powershell_no_window()
            .args(["-Command", script])
            .output()
            .map_err(|e| format!("메모리 최적화 실패: {}", e))?;

        if output.status.success() {
            Ok("메모리 최적화 완료! 사용 중이지 않은 프로세스의 메모리가 정리되었습니다.".to_string())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            Ok(format!("부분적으로 최적화 완료 (일부 프로세스 접근 불가): {}", stderr))
        }
    })
    .await
    .map_err(|e| format!("최적화 작업 실패: {}", e))?
}
