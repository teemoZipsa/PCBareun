use serde::{Serialize, Deserialize};
use crate::utils::cmd::powershell_no_window;

#[derive(Serialize, Deserialize, Clone)]
pub struct PortEntry {
    pub port: u16,
    pub pid: u32,
    pub process_name: String,
    pub protocol: String,
    pub state: String,
    pub memory_mb: f64,
}

#[tauri::command]
pub fn get_port_usage(ports: Vec<u16>) -> Result<Vec<PortEntry>, String> {
    let port_list = ports.iter().map(|p| p.to_string()).collect::<Vec<_>>().join(",");
    let ps_script = format!(r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$targetPorts = @({})
$results = @()
foreach ($port in $targetPorts) {{
    $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    foreach ($conn in $conns) {{
        $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        $memMB = 0
        if ($proc) {{ $memMB = [math]::Round($proc.WorkingSet64 / 1MB, 1) }}
        $results += [PSCustomObject]@{{
            port = $port
            pid = $conn.OwningProcess
            process_name = if ($proc) {{ $proc.ProcessName }} else {{ 'Unknown' }}
            protocol = 'TCP'
            state = $conn.State.ToString()
            memory_mb = $memMB
        }}
    }}
    $udpConns = Get-NetUDPEndpoint -LocalPort $port -ErrorAction SilentlyContinue
    foreach ($conn in $udpConns) {{
        $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        $memMB = 0
        if ($proc) {{ $memMB = [math]::Round($proc.WorkingSet64 / 1MB, 1) }}
        $results += [PSCustomObject]@{{
            port = $port
            pid = $conn.OwningProcess
            process_name = if ($proc) {{ $proc.ProcessName }} else {{ 'Unknown' }}
            protocol = 'UDP'
            state = 'Listening'
            memory_mb = $memMB
        }}
    }}
}}
if ($results.Count -eq 0) {{ '[]' }} else {{ $results | ConvertTo-Json -Compress }}
"#, port_list);

    let output = powershell_no_window()
        .args(["-Command", &ps_script])
        .output()
        .map_err(|e| format!("PowerShell 실행 실패: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() || stdout == "[]" {
        return Ok(Vec::new());
    }
    if stdout.starts_with('[') {
        serde_json::from_str(&stdout).map_err(|e| format!("JSON 파싱 오류: {}", e))
    } else {
        match serde_json::from_str::<PortEntry>(&stdout) {
            Ok(item) => Ok(vec![item]),
            Err(e) => Err(format!("JSON 파싱 오류: {}", e)),
        }
    }
}

#[tauri::command]
pub fn kill_process(pid: u32) -> Result<String, String> {
    let ps_cmd = format!("Stop-Process -Id {} -Force -ErrorAction Stop; 'ok'", pid);
    let output = powershell_no_window()
        .args(["-Command", &ps_cmd])
        .output()
        .map_err(|e| format!("프로세스 종료 실패: {}", e))?;
    if output.status.success() {
        Ok(format!("PID {} 프로세스를 종료했습니다.", pid))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(format!("종료 실패: {}", stderr))
    }
}

#[tauri::command]
pub fn kill_zombie_nodes() -> Result<String, String> {
    let ps_script = r#"
$nodes = Get-Process -Name "node" -ErrorAction SilentlyContinue
$count = 0
foreach ($n in $nodes) {
    try {
        $n | Stop-Process -Force -ErrorAction Stop
        $count++
    } catch {}
}
"$count"
"#;
    let output = powershell_no_window()
        .args(["-Command", ps_script])
        .output()
        .map_err(|e| format!("PowerShell 실행 실패: {}", e))?;
    let count = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(format!("{}개의 Node.js 프로세스를 종료했습니다.", count))
}
