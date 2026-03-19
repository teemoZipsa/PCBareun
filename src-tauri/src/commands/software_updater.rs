use serde::{Serialize, Deserialize};
use crate::utils::cmd::{powershell_no_window, command_no_window};

#[derive(Serialize, Deserialize, Clone)]
pub struct SoftwareInfo {
    pub name: String,
    pub current_version: String,
    pub publisher: String,
    pub install_date: String,
    pub uninstall_string: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct WingetUpgrade {
    pub name: String,
    pub id: String,
    pub current_version: String,
    pub available_version: String,
    pub source: String,
}

#[tauri::command]
pub fn get_updatable_software() -> Result<Vec<SoftwareInfo>, String> {
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
        $_.DisplayName -and $_.DisplayName.Trim() -ne '' -and $_.DisplayVersion
    } | ForEach-Object {
        $results += [PSCustomObject]@{
            name = $_.DisplayName
            current_version = if($_.DisplayVersion) { $_.DisplayVersion } else { '' }
            publisher = if($_.Publisher) { $_.Publisher } else { '' }
            install_date = if($_.InstallDate) { $_.InstallDate } else { '' }
            uninstall_string = if($_.UninstallString) { $_.UninstallString } else { '' }
        }
    }
}
$results | Sort-Object Name -Unique | ConvertTo-Json -Compress
"#;

    let output = powershell_no_window()
        .args(["-Command", ps_script])
        .output()
        .map_err(|e| format!("PowerShell 실행 실패: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json_str = stdout.trim();

    if json_str.is_empty() {
        return Ok(Vec::new());
    }

    if json_str.starts_with('[') {
        serde_json::from_str(json_str).map_err(|e| format!("JSON 파싱 오류: {}", e))
    } else {
        match serde_json::from_str::<SoftwareInfo>(json_str) {
            Ok(s) => Ok(vec![s]),
            Err(e) => Err(format!("JSON 파싱 오류: {}", e)),
        }
    }
}

#[tauri::command]
pub fn check_winget_available() -> bool {
    command_no_window("winget")
        .args(["--version"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[tauri::command]
pub fn winget_upgrade(package_id: String) -> Result<String, String> {
    let output = command_no_window("winget")
        .args([
            "upgrade",
            "--id",
            &package_id,
            "--accept-source-agreements",
            "--accept-package-agreements",
            "--silent",
        ])
        .output()
        .map_err(|e| format!("winget 실행 실패: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(format!("{} 업데이트 완료", package_id))
    } else {
        Err(format!(
            "업데이트 실패: {}{}",
            stdout.trim(),
            if stderr.is_empty() {
                String::new()
            } else {
                format!("\n{}", stderr.trim())
            }
        ))
    }
}

#[tauri::command]
pub fn winget_list_upgrades() -> Result<Vec<WingetUpgrade>, String> {
    let output = command_no_window("winget")
        .args(["upgrade", "--accept-source-agreements"])
        .output()
        .map_err(|e| format!("winget 실행 실패: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    parse_winget_upgrade_output(&stdout)
}

/// Parse winget's fixed-width table output into structured data
fn parse_winget_upgrade_output(raw: &str) -> Result<Vec<WingetUpgrade>, String> {
    let lines: Vec<&str> = raw.lines().collect();
    let mut upgrades = Vec::new();

    // Find the separator line (------) to determine column positions
    let sep_idx = lines.iter().position(|l| {
        let trimmed = l.trim();
        trimmed.len() > 10 && (trimmed.chars().all(|c| c == '-' || c == ' ') || trimmed.starts_with("───"))
    });
    let sep_idx = match sep_idx {
        Some(i) => i,
        None => return Ok(Vec::new()),
    };

    if sep_idx == 0 {
        return Ok(Vec::new());
    }

    // The header line is just before the separator
    let header = lines[sep_idx - 1];

    // Find column start positions from header
    let find_col = |patterns: &[&str]| -> Option<usize> {
        for pat in patterns {
            if let Some(pos) = header.find(pat) {
                return Some(pos);
            }
        }
        None
    };

    let col_id = find_col(&["Id", "ID"]).unwrap_or(0);
    let col_ver = find_col(&["Version", "버전"]).unwrap_or(0);
    let col_avail = find_col(&["Available", "사용 가능"]).unwrap_or(0);
    let col_source = find_col(&["Source", "원본"]).unwrap_or(0);

    if col_id == 0 && col_ver == 0 {
        return Ok(Vec::new());
    }

    // Parse data lines after separator
    for line in &lines[(sep_idx + 1)..] {
        let line = *line;
        if line.trim().is_empty()
            || line.contains("업그레이드")
            || line.contains("upgrade")
            || line.contains("pinned")
        {
            continue;
        }

        let chars: Vec<char> = line.chars().collect();
        let len = chars.len();

        let extract = |start: usize, end: usize| -> String {
            if start >= len { return String::new(); }
            let e = end.min(len);
            chars[start..e].iter().collect::<String>().trim().to_string()
        };

        let name = extract(0, col_id);
        let id = extract(col_id, col_ver);
        let current = extract(col_ver, col_avail);
        let available = extract(col_avail, if col_source > 0 { col_source } else { len });
        let source = if col_source > 0 { extract(col_source, len) } else { String::new() };

        if !id.is_empty() && !current.is_empty() {
            upgrades.push(WingetUpgrade {
                name,
                id,
                current_version: current,
                available_version: available,
                source,
            });
        }
    }

    Ok(upgrades)
}
