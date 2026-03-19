use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

#[derive(Serialize, Clone)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub is_dir: bool,
    pub children: Option<Vec<DirEntry>>,
}

/// Directories to skip
fn should_skip(path: &Path) -> bool {
    if let Some(name) = path.file_name() {
        let lower = name.to_string_lossy().to_lowercase();
        if lower.starts_with('$')
            || matches!(
                lower.as_str(),
                "system volume information"
                    | "recovery"
                    | "config.msi"
                    | "dumpstack.log.tmp"
                    | "hiberfil.sys"
                    | "pagefile.sys"
                    | "swapfile.sys"
            )
        {
            return true;
        }
    }
    false
}

/// 🚀 단일 폴더 크기를 빠르게 계산 (재귀, 깊이 제한 없음)
fn calc_dir_size(dir: &Path) -> u64 {
    let counter = Arc::new(AtomicU64::new(0));

    // jwalk로 해당 폴더만 병렬 워킹
    let walker = jwalk::WalkDir::new(dir)
        .skip_hidden(false)
        .process_read_dir(|_, _, _, children| {
            children.retain(|entry_result| {
                if let Ok(entry) = entry_result {
                    !should_skip(&entry.path())
                } else {
                    false
                }
            });
        });

    let c = Arc::clone(&counter);
    for entry in walker {
        if let Ok(e) = entry {
            if e.file_type().is_file() {
                if let Ok(meta) = e.metadata() {
                    c.fetch_add(meta.len(), Ordering::Relaxed);
                }
            }
        }
    }

    counter.load(Ordering::Relaxed)
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

        let (used, available) = if let Ok(out) = crate::utils::cmd::powershell_no_window()
            .args(["-Command", &script])
            .output()
        {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&stdout) {
                let u = val["used"].as_u64().unwrap_or(0);
                let f = val["free"].as_u64().unwrap_or(0);
                (u, f)
            } else {
                (0u64, 0u64)
            }
        } else {
            (0u64, 0u64)
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
pub async fn scan_directory(path: String, _max_depth: u32) -> Result<DirEntry, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = Path::new(&path);
        if !p.exists() {
            return Err(format!("경로를 찾을 수 없습니다: {}", path));
        }
        if !p.is_dir() {
            return Err("폴더 경로를 입력해주세요.".into());
        }

        // 1단계: 최상위 자식 목록 (즉시)
        let mut top_dirs: Vec<PathBuf> = Vec::new();
        let mut loose_files: Vec<(String, u64)> = Vec::new();

        if let Ok(entries) = fs::read_dir(p) {
            for entry in entries.flatten() {
                let ep = entry.path();
                if should_skip(&ep) {
                    continue;
                }
                if ep.is_dir() {
                    top_dirs.push(ep);
                } else if let Ok(meta) = ep.metadata() {
                    let name = ep.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    loose_files.push((name, meta.len()));
                }
            }
        }

        // 2단계: 각 최상위 폴더 크기를 스레드 풀에서 병렬 계산
        let handles: Vec<_> = top_dirs
            .iter()
            .map(|dir| {
                let dir = dir.clone();
                std::thread::spawn(move || {
                    let size = calc_dir_size(&dir);
                    let name = dir
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    DirEntry {
                        name,
                        path: dir.to_string_lossy().to_string(),
                        size_bytes: size,
                        is_dir: true,
                        children: None,
                    }
                })
            })
            .collect();

        let mut children: Vec<DirEntry> = handles
            .into_iter()
            .filter_map(|h| h.join().ok())
            .collect();

        // loose files 추가
        for (name, size) in loose_files {
            children.push(DirEntry {
                name: name.clone(),
                path: p.join(&name).to_string_lossy().to_string(),
                size_bytes: size,
                is_dir: false,
                children: None,
            });
        }

        // 크기 내림차순 정렬
        children.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));

        // 상위 50 + 기타
        if children.len() > 50 {
            let rest_size: u64 = children[50..].iter().map(|e| e.size_bytes).sum();
            children.truncate(50);
            if rest_size > 0 {
                children.push(DirEntry {
                    name: "기타".into(),
                    path: String::new(),
                    size_bytes: rest_size,
                    is_dir: false,
                    children: None,
                });
            }
        }

        let total_size: u64 = children.iter().map(|c| c.size_bytes).sum();

        Ok(DirEntry {
            name: p
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path.clone()),
            path,
            size_bytes: total_size,
            is_dir: true,
            children: Some(children),
        })
    })
    .await
    .map_err(|e| format!("스캔 작업 실패: {}", e))?
}
