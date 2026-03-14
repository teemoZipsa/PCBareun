use serde::{Serialize, Deserialize};
use std::path::PathBuf;
use std::process::Command;

#[derive(Serialize, Deserialize, Clone)]
pub struct LeftoverItem {
    pub path: String,
    pub kind: String, // "file", "dir", "registry"
    pub size_bytes: u64,
}

#[derive(Serialize, Clone)]
pub struct ScanResult {
    pub files: Vec<LeftoverItem>,
    pub registry_keys: Vec<LeftoverItem>,
    pub total_size_bytes: u64,
}

#[tauri::command]
pub fn scan_leftovers(program_name: String, publisher: String) -> Result<ScanResult, String> {
    let mut files: Vec<LeftoverItem> = Vec::new();

    // Build search terms from program name and publisher
    let search_terms: Vec<String> = build_search_terms(&program_name, &publisher);

    // 1. Scan common file locations
    let scan_dirs = vec![
        std::env::var("ProgramFiles").unwrap_or_default(),
        std::env::var("ProgramFiles(x86)").unwrap_or_default(),
        std::env::var("LOCALAPPDATA").unwrap_or_default(),
        std::env::var("APPDATA").unwrap_or_default(),
        format!(
            "{}\\AppData\\LocalLow",
            std::env::var("USERPROFILE").unwrap_or_default()
        ),
        std::env::var("ProgramData").unwrap_or_default(),
        format!(
            "{}\\AppData\\Local\\Temp",
            std::env::var("USERPROFILE").unwrap_or_default()
        ),
    ];

    for dir in &scan_dirs {
        if dir.is_empty() {
            continue;
        }
        let base = PathBuf::from(dir);
        if !base.exists() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(&base) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if search_terms.iter().any(|t| name.contains(t)) {
                    let path = entry.path();
                    let size = dir_size(&path);
                    let kind = if path.is_dir() { "dir" } else { "file" };
                    files.push(LeftoverItem {
                        path: path.to_string_lossy().to_string(),
                        kind: kind.to_string(),
                        size_bytes: size,
                    });
                }
            }
        }
    }

    // 2. Scan registry for leftovers
    let registry_keys = scan_registry_leftovers(&search_terms);

    let total_size = files.iter().map(|f| f.size_bytes).sum();

    Ok(ScanResult {
        files,
        registry_keys,
        total_size_bytes: total_size,
    })
}

#[tauri::command]
pub fn delete_leftovers(
    file_paths: Vec<String>,
    registry_paths: Vec<String>,
) -> Result<String, String> {
    let mut deleted_files = 0u32;
    let mut deleted_reg = 0u32;
    let mut errors: Vec<String> = Vec::new();

    // Delete files/dirs
    for path in &file_paths {
        let p = PathBuf::from(path);
        let result = if p.is_dir() {
            std::fs::remove_dir_all(&p)
        } else {
            std::fs::remove_file(&p)
        };
        match result {
            Ok(()) => deleted_files += 1,
            Err(e) => errors.push(format!("{}: {}", path, e)),
        }
    }

    // Delete registry keys
    for reg_path in &registry_paths {
        let ps = format!(
            "Remove-Item -Path '{}' -Recurse -Force -ErrorAction Stop",
            reg_path.replace('\'', "''")
        );
        let output = Command::new("powershell")
            .args(["-NoProfile", "-Command", &ps])
            .output();

        match output {
            Ok(o) if o.status.success() => deleted_reg += 1,
            Ok(o) => {
                let stderr = String::from_utf8_lossy(&o.stderr);
                errors.push(format!("{}: {}", reg_path, stderr.trim()));
            }
            Err(e) => errors.push(format!("{}: {}", reg_path, e)),
        }
    }

    let msg = format!(
        "파일/폴더 {}개, 레지스트리 {}개 삭제 완료",
        deleted_files, deleted_reg
    );

    if errors.is_empty() {
        Ok(msg)
    } else {
        Ok(format!("{}. 일부 오류: {}", msg, errors.join("; ")))
    }
}

fn build_search_terms(program_name: &str, publisher: &str) -> Vec<String> {
    let mut terms = Vec::new();
    let name_lower = program_name.to_lowercase();

    // Full name
    terms.push(name_lower.clone());

    // Without common suffixes
    for suffix in &[" (x64)", " (x86)", " (64-bit)", " (32-bit)"] {
        if let Some(stripped) = name_lower.strip_suffix(suffix) {
            terms.push(stripped.to_string());
        }
    }

    // First significant word (skip very short ones)
    let words: Vec<&str> = name_lower.split_whitespace().collect();
    if let Some(first) = words.first() {
        if first.len() >= 3 {
            terms.push(first.to_string());
        }
    }

    // Publisher-based term
    if !publisher.is_empty() {
        let pub_lower = publisher.to_lowercase();
        // Common publisher folder names
        let pub_words: Vec<&str> = pub_lower.split_whitespace().collect();
        if let Some(first) = pub_words.first() {
            if first.len() >= 3
                && !["the", "inc", "ltd", "llc", "corp", "inc."].contains(first)
            {
                terms.push(first.to_string());
            }
        }
    }

    terms.sort();
    terms.dedup();
    terms
}

fn dir_size(path: &PathBuf) -> u64 {
    if path.is_file() {
        return path.metadata().map(|m| m.len()).unwrap_or(0);
    }
    walkdir(path)
}

fn walkdir(path: &PathBuf) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                total += p.metadata().map(|m| m.len()).unwrap_or(0);
            } else if p.is_dir() {
                total += walkdir(&p);
            }
        }
    }
    total
}

fn scan_registry_leftovers(search_terms: &[String]) -> Vec<LeftoverItem> {
    let reg_paths = [
        "HKCU:\\Software",
        "HKLM:\\SOFTWARE",
        "HKLM:\\SOFTWARE\\WOW6432Node",
    ];

    let terms_pattern = search_terms
        .iter()
        .map(|t| format!("'{}'", t.replace('\'', "''")))
        .collect::<Vec<_>>()
        .join(",");

    let ps = format!(
        r#"
$terms = @({terms})
$results = @()
$regPaths = @({paths})
foreach ($rp in $regPaths) {{
    if (Test-Path $rp) {{
        Get-ChildItem $rp -ErrorAction SilentlyContinue | ForEach-Object {{
            $keyName = $_.PSChildName.ToLower()
            foreach ($t in $terms) {{
                if ($keyName -like "*$t*") {{
                    $results += [PSCustomObject]@{{
                        path = $_.PSPath -replace 'Microsoft\.PowerShell\.Core\\Registry::', ''
                        kind = 'registry'
                        size_bytes = 0
                    }}
                    break
                }}
            }}
        }}
    }}
}}
$results | ConvertTo-Json -Compress
"#,
        terms = terms_pattern,
        paths = reg_paths
            .iter()
            .map(|p| format!("'{}'", p))
            .collect::<Vec<_>>()
            .join(",")
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps])
        .output();

    match output {
        Ok(o) if o.status.success() => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            let json_str = stdout.trim();
            if json_str.is_empty() {
                return Vec::new();
            }
            if json_str.starts_with('[') {
                serde_json::from_str(json_str).unwrap_or_default()
            } else {
                match serde_json::from_str::<LeftoverItem>(json_str) {
                    Ok(item) => vec![item],
                    Err(_) => Vec::new(),
                }
            }
        }
        _ => Vec::new(),
    }
}
