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

// Maximum files to collect before aborting (prevents freezing on huge dirs)
const MAX_FILES: usize = 500_000;

// Directories to skip at drive root level
const ROOT_SKIP_DIRS: &[&str] = &[
    "$Recycle.Bin",
    "System Volume Information",
    "Windows",
    "Program Files",
    "Program Files (x86)",
    "ProgramData",
    "Recovery",
    "$WinREAgent",
    "PerfLogs",
];

// Directories to always skip
const ALWAYS_SKIP_DIRS: &[&str] = &[
    "$Recycle.Bin",
    "System Volume Information",
    ".git",
    "node_modules",
    "__pycache__",
    ".cache",
    "Cache",
    "CacheStorage",
    "Code Cache",
    "GPUCache",
    "ShaderCache",
    "DawnCache",
    "ScriptCache",
];

// File extensions to skip (caches, databases, logs, temp files)
const SKIP_EXTENSIONS: &[&str] = &[
    "log", "tmp", "bak", "cache",
    "db", "db-shm", "db-wal",
    "sqlite", "sqlite-shm", "sqlite-wal",
    "prmdc2", "prmdc2-shm", "prmdc2-wal",
    "lock", "lck",
];

// File name patterns to skip
const SKIP_FILE_NAMES: &[&str] = &[
    "thumbs.db", "desktop.ini", ".ds_store",
    "metadatacache", "iconcache",
];

// ── Scanning helpers ────────────────────────────────────────

fn is_drive_root(dir: &Path) -> bool {
    // e.g. C:\ or D:\
    let s = dir.to_string_lossy();
    s.len() <= 3 && s.ends_with('\\')
        || dir.parent().is_none()
        || dir.parent().map(|p| p == Path::new("")).unwrap_or(false)
}

fn collect_files(dir: &Path, min_size: u64, files: &mut Vec<PathBuf>, at_root: bool) -> bool {
    if files.len() >= MAX_FILES {
        return false; // signal to stop
    }

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if files.len() >= MAX_FILES {
                return false;
            }

            let p = entry.path();
            if p.is_dir() {
                let name = p.file_name().unwrap_or_default().to_string_lossy();
                // Skip hidden dirs
                if name.starts_with('.') {
                    continue;
                }
                // Skip system dirs
                if ALWAYS_SKIP_DIRS.iter().any(|&s| name.eq_ignore_ascii_case(s)) {
                    continue;
                }
                // At drive root, skip additional system directories
                if at_root && ROOT_SKIP_DIRS.iter().any(|&s| name.eq_ignore_ascii_case(s)) {
                    continue;
                }
                if !collect_files(&p, min_size, files, false) {
                    return false;
                }
            } else if let Ok(meta) = p.metadata() {
                if meta.len() >= min_size {
                    // Skip cache/config files by extension
                    let file_name = p.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
                    let ext = p.extension().unwrap_or_default().to_string_lossy().to_lowercase();

                    if SKIP_EXTENSIONS.iter().any(|&e| ext == e) {
                        continue;
                    }
                    if SKIP_FILE_NAMES.iter().any(|&n| file_name.starts_with(n)) {
                        continue;
                    }

                    files.push(p);
                }
            }
        }
    }
    true
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
            let dt: chrono::DateTime<chrono::Local> = modified.into();
            return dt.format("%Y-%m-%d %H:%M").to_string();
        }
    }
    "-".into()
}

// ── Tauri commands ──────────────────────────────────────────

#[tauri::command]
pub async fn scan_duplicates(
    path: String,
    min_size_kb: u64,
) -> Result<DuplicateScanResult, String> {
    tokio::task::spawn_blocking(move || {
        scan_duplicates_inner(&path, min_size_kb)
    })
    .await
    .map_err(|e| format!("작업 실행 실패: {}", e))?
}

fn scan_duplicates_inner(
    path: &str,
    min_size_kb: u64,
) -> Result<DuplicateScanResult, String> {
    let root = Path::new(path);
    if !root.is_dir() {
        return Err("폴더 경로를 입력해주세요.".into());
    }

    let min_bytes = min_size_kb * 1024;
    let at_root = is_drive_root(root);
    let mut all_files: Vec<PathBuf> = Vec::new();
    let completed = collect_files(root, min_bytes, &mut all_files, at_root);

    if !completed {
        return Err(format!(
            "파일이 {}개를 초과하여 스캔을 중단했습니다. 특정 폴더를 선택해주세요.",
            MAX_FILES
        ));
    }

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

#[derive(Serialize)]
pub struct UserFolder {
    pub name: String,
    pub path: String,
}

#[tauri::command]
pub fn get_user_folders() -> Vec<UserFolder> {
    let mut folders = Vec::new();
    if let Some(profile) = std::env::var_os("USERPROFILE") {
        let base = Path::new(&profile);
        for (name, dir) in [
            ("다운로드", "Downloads"),
            ("문서", "Documents"),
            ("바탕화면", "Desktop"),
            ("사진", "Pictures"),
            ("동영상", "Videos"),
        ] {
            let p = base.join(dir);
            if p.is_dir() {
                folders.push(UserFolder {
                    name: name.to_string(),
                    path: p.to_string_lossy().to_string(),
                });
            }
        }
    }
    folders
}

#[tauri::command]
pub fn open_folder_in_explorer(path: String) -> Result<(), String> {
    crate::utils::cmd::command_no_window("explorer")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("폴더 열기 실패: {}", e))?;
    Ok(())
}
