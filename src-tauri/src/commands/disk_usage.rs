use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub is_dir: bool,
    pub children: Option<Vec<DirEntry>>,
}

/// Recursively scan a directory up to a given depth
fn scan_dir(path: &Path, depth: u32, max_depth: u32) -> DirEntry {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string());

    if !path.is_dir() {
        let sz = path.metadata().map(|m| m.len()).unwrap_or(0);
        return DirEntry {
            name,
            path: path.to_string_lossy().to_string(),
            size_bytes: sz,
            is_dir: false,
            children: None,
        };
    }

    let mut children_entries: Vec<DirEntry> = Vec::new();
    let mut total_size: u64 = 0;

    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let ep = entry.path();
            if ep.is_dir() {
                if depth < max_depth {
                    let child = scan_dir(&ep, depth + 1, max_depth);
                    total_size += child.size_bytes;
                    children_entries.push(child);
                } else {
                    // Just calculate size without children details
                    let sz = dir_size_flat(&ep);
                    total_size += sz;
                    children_entries.push(DirEntry {
                        name: ep
                            .file_name()
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or_default(),
                        path: ep.to_string_lossy().to_string(),
                        size_bytes: sz,
                        is_dir: true,
                        children: None,
                    });
                }
            } else {
                let sz = ep.metadata().map(|m| m.len()).unwrap_or(0);
                total_size += sz;
                children_entries.push(DirEntry {
                    name: ep
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default(),
                    path: ep.to_string_lossy().to_string(),
                    size_bytes: sz,
                    is_dir: false,
                    children: None,
                });
            }
        }
    }

    // Sort by size descending
    children_entries.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));

    // Limit children to top 50 + "기타" bucket
    let children = if children_entries.len() > 50 {
        let mut top: Vec<DirEntry> = children_entries[..50].to_vec();
        let rest_size: u64 = children_entries[50..].iter().map(|e| e.size_bytes).sum();
        if rest_size > 0 {
            top.push(DirEntry {
                name: format!("기타 ({}개)", children_entries.len() - 50),
                path: String::new(),
                size_bytes: rest_size,
                is_dir: false,
                children: None,
            });
        }
        top
    } else {
        children_entries
    };

    DirEntry {
        name,
        path: path.to_string_lossy().to_string(),
        size_bytes: total_size,
        is_dir: true,
        children: Some(children),
    }
}

/// Quick total size of a directory (no children details)
fn dir_size_flat(dir: &Path) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                total += dir_size_flat(&p);
            } else {
                total += p.metadata().map(|m| m.len()).unwrap_or(0);
            }
        }
    }
    total
}

/// Get available drive roots on Windows
fn get_drives() -> Vec<PathBuf> {
    let mut drives = Vec::new();
    for letter in b'A'..=b'Z' {
        let path = format!("{}:\\", letter as char);
        let p = Path::new(&path);
        if p.exists() {
            drives.push(PathBuf::from(path));
        }
    }
    drives
}

#[derive(Serialize)]
pub struct DriveInfo {
    pub letter: String,
    pub path: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub free_bytes: u64,
}

#[tauri::command]
pub fn get_drives_list() -> Result<Vec<DriveInfo>, String> {
    let drives = get_drives();
    let mut results = Vec::new();

    for drive_path in drives {
        let path_str = drive_path.to_string_lossy().to_string();
        let letter = path_str.chars().next().unwrap_or('?').to_string();

        // Use sysinfo Disks to get size info
        let total = 0u64;
        let free = 0u64;

        // Simple approach: use PowerShell for quick drive info
        let script = format!(
            r#"
$d = Get-PSDrive -Name '{}' -ErrorAction SilentlyContinue
if ($d) {{
    [PSCustomObject]@{{
        used = $d.Used
        free = $d.Free
    }} | ConvertTo-Json -Compress
}} else {{ "{{}}" }}
"#,
            letter
        );

        let (used, available) = if let Ok(out) = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .output()
        {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&stdout) {
                let u = val["used"].as_u64().unwrap_or(0);
                let f = val["free"].as_u64().unwrap_or(0);
                (u, f)
            } else {
                (total, free)
            }
        } else {
            (total, free)
        };

        results.push(DriveInfo {
            letter,
            path: path_str,
            total_bytes: used + available,
            used_bytes: used,
            free_bytes: available,
        });
    }

    Ok(results)
}

#[tauri::command]
pub fn scan_directory(path: String, max_depth: u32) -> Result<DirEntry, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("경로를 찾을 수 없습니다: {}", path));
    }
    if !p.is_dir() {
        return Err("폴더 경로를 입력해주세요.".into());
    }

    Ok(scan_dir(p, 0, max_depth.min(5)))
}
