use serde::{Serialize, Deserialize};
use crate::utils::cmd::powershell_no_window;

#[derive(Serialize, Deserialize, Clone)]
pub struct DnsAdapter {
    pub name: String,
    pub dns_servers: Vec<String>,
    pub interface_index: u32,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DnsCheckResult {
    pub adapters: Vec<DnsAdapter>,
    pub hosts_modified: bool,
    pub hosts_suspicious_entries: Vec<String>,
}

/// Well-known safe DNS servers
const SAFE_DNS: &[&str] = &[
    // Google
    "8.8.8.8",
    "8.8.4.4",
    "2001:4860:4860::8888",
    "2001:4860:4860::8844",
    // Cloudflare
    "1.1.1.1",
    "1.0.0.1",
    "2606:4700:4700::1111",
    "2606:4700:4700::1001",
    // KT
    "168.126.63.1",
    "168.126.63.2",
    // SK
    "210.220.163.82",
    "219.250.36.130",
    // LG U+
    "164.124.101.2",
    "203.248.252.2",
    // OpenDNS
    "208.67.222.222",
    "208.67.220.220",
    // Quad9
    "9.9.9.9",
    "149.112.112.112",
];

#[tauri::command]
pub fn check_dns() -> Result<DnsCheckResult, String> {
    // 1. Get DNS servers per adapter
    let ps = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Get-DnsClientServerAddress -AddressFamily IPv4 |
  Where-Object { $_.ServerAddresses.Count -gt 0 } |
  ForEach-Object {
    [PSCustomObject]@{
      name = $_.InterfaceAlias
      dns_servers = $_.ServerAddresses
      interface_index = $_.InterfaceIndex
    }
  } | ConvertTo-Json -Compress
"#;
    let output = powershell_no_window()
        .args(["-Command", ps])
        .output()
        .map_err(|e| format!("PowerShell 실행 실패: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json_str = stdout.trim();

    let adapters: Vec<DnsAdapter> = if json_str.is_empty() {
        Vec::new()
    } else if json_str.starts_with('[') {
        serde_json::from_str(json_str).unwrap_or_default()
    } else {
        match serde_json::from_str::<DnsAdapter>(json_str) {
            Ok(a) => vec![a],
            Err(_) => Vec::new(),
        }
    };

    // 2. Check hosts file
    let hosts_path = r"C:\Windows\System32\drivers\etc\hosts";
    let hosts_content = std::fs::read_to_string(hosts_path).unwrap_or_default();

    let suspicious: Vec<String> = hosts_content
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                return false;
            }
            // Skip localhost entries
            let lower = trimmed.to_lowercase();
            if lower.contains("localhost") || lower.contains("broadcasthost") {
                return false;
            }
            true
        })
        .map(|s| s.to_string())
        .collect();

    let hosts_modified = !suspicious.is_empty();

    Ok(DnsCheckResult {
        adapters,
        hosts_modified,
        hosts_suspicious_entries: suspicious,
    })
}

#[tauri::command]
pub fn reset_dns_to_auto(interface_index: u32) -> Result<String, String> {
    let ps = format!(
        "Set-DnsClientServerAddress -InterfaceIndex {} -ResetServerAddresses -ErrorAction Stop",
        interface_index
    );

    let output = powershell_no_window()
        .args(["-Command", &ps])
        .output()
        .map_err(|e| format!("실행 실패: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("DNS 초기화 실패: {}", stderr));
    }

    Ok("DNS를 자동(DHCP)으로 초기화했습니다.".to_string())
}

#[tauri::command]
pub fn is_dns_safe(server: String) -> bool {
    SAFE_DNS.contains(&server.as_str())
}
