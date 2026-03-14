use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone)]
pub struct DuplicateFile {
    pub path: String,
    pub size_bytes: u64,
    pub modified: String,
}

#[derive(Serialize)]
pub struct DuplicateGroup {
    pub hash: String,
    pub size_bytes: u64,
    pub files: Vec<DuplicateFile>,
    pub wasted_bytes: u64,
}

#[derive(Serialize)]
pub struct DuplicateScanResult {
    pub groups: Vec<DuplicateGroup>,
    pub total_groups: usize,
    pub total_wasted_bytes: u64,
    pub total_files_scanned: u32,
}

// ── Scanning helpers ────────────────────────────────────────

fn collect_files(dir: &Path, min_size: u64, files: &mut Vec<PathBuf>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                // Skip system directories
                let name = p.file_name().unwrap_or_default().to_string_lossy();
                if name.starts_with('.')
                    || name == "$Recycle.Bin"
                    || name == "System Volume Information"
                    || name == "Windows"
                {
                    continue;
                }
                collect_files(&p, min_size, files);
            } else if let Ok(meta) = p.metadata() {
                if meta.len() >= min_size {
                    files.push(p);
                }
            }
        }
    }
}

fn hash_file(path: &Path) -> Option<String> {
    let mut file = fs::File::open(path).ok()?;
    let mut hasher = blake3::Hasher::new();
    let mut buf = [0u8; 65536]; // 64KB buffer

    loop {
        match file.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => hasher.update(&buf[..n]),
            Err(_) => return None,
        };
    }

    Some(hasher.finalize().to_hex().to_string())
}

fn format_modified(path: &Path) -> String {
    if let Ok(meta) = path.metadata() {
        if let Ok(modified) = meta.modified() {
            if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                let secs = duration.as_secs() as i64;
                // Simple formatting: seconds since epoch to date string
                let days = secs / 86400;
                let years = 1970 + (days * 400 / 146097);
                // Simplified: just return the timestamp
                let _ = years;
            }
        }
    }

    // Use PowerShell for exact formatting (only called per-duplicate, not per-file)
    if let Ok(out) = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            &format!(
                "(Get-Item -LiteralPath '{}' -ErrorAction SilentlyContinue).LastWriteTime.ToString('yyyy-MM-dd HH:mm')",
                path.to_string_lossy().replace('\'', "''")
            ),
        ])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !s.is_empty() {
            return s;
        }
    }

    "-".into()
}

// ── Tauri commands ──────────────────────────────────────────

#[tauri::command]
pub fn scan_duplicates(
    path: String,
    min_size_kb: u64,
) -> Result<DuplicateScanResult, String> {
    let root = Path::new(&path);
    if !root.is_dir() {
        return Err("폴더 경로를 입력해주세요.".into());
    }

    let min_bytes = min_size_kb * 1024;
    let mut all_files: Vec<PathBuf> = Vec::new();
    collect_files(root, min_bytes, &mut all_files);
    let total_scanned = all_files.len() as u32;

    // Phase 1: group by size
    let mut size_groups: HashMap<u64, Vec<PathBuf>> = HashMap::new();
    for f in &all_files {
        if let Ok(meta) = f.metadata() {
            size_groups.entry(meta.len()).or_default().push(f.clone());
        }
    }

    // Keep only sizes with 2+ files
    let candidates: Vec<Vec<PathBuf>> = size_groups
        .into_values()
        .filter(|v| v.len() > 1)
        .collect();

    // Phase 2: hash comparison
    let mut hash_groups: HashMap<String, Vec<PathBuf>> = HashMap::new();
    for group in candidates {
        for file_path in group {
            if let Some(h) = hash_file(&file_path) {
                hash_groups.entry(h).or_default().push(file_path);
            }
        }
    }

    // Build results (only groups with 2+ files)
    let mut groups: Vec<DuplicateGroup> = Vec::new();
    let mut total_wasted: u64 = 0;

    for (hash, paths) in hash_groups {
        if paths.len() < 2 {
            continue;
        }
        let file_size = paths[0].metadata().map(|m| m.len()).unwrap_or(0);
        let wasted = file_size * (paths.len() as u64 - 1);
        total_wasted += wasted;

        let files: Vec<DuplicateFile> = paths
            .iter()
            .map(|p| DuplicateFile {
                path: p.to_string_lossy().to_string(),
                size_bytes: file_size,
                modified: format_modified(p),
            })
            .collect();

        groups.push(DuplicateGroup {
            hash,
            size_bytes: file_size,
            files,
            wasted_bytes: wasted,
        });
    }

    // Sort by wasted bytes descending
    groups.sort_by(|a, b| b.wasted_bytes.cmp(&a.wasted_bytes));

    Ok(DuplicateScanResult {
        total_groups: groups.len(),
        total_wasted_bytes: total_wasted,
        total_files_scanned: total_scanned,
        groups,
    })
}

#[tauri::command]
pub fn delete_duplicate_files(paths: Vec<String>) -> Result<DeleteResult, String> {
    let mut deleted = 0u32;
    let mut failed = 0u32;
    let mut freed_bytes = 0u64;

    for p in &paths {
        let path = Path::new(p);
        if path.is_file() {
            let sz = path.metadata().map(|m| m.len()).unwrap_or(0);
            match fs::remove_file(path) {
                Ok(_) => {
                    deleted += 1;
                    freed_bytes += sz;
                }
                Err(_) => failed += 1,
            }
        }
    }

    Ok(DeleteResult {
        deleted,
        failed,
        freed_bytes,
    })
}

#[derive(Serialize)]
pub struct DeleteResult {
    pub deleted: u32,
    pub failed: u32,
    pub freed_bytes: u64,
}
