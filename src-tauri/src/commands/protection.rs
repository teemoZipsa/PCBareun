use serde::{Serialize, Deserialize};
use std::fs;
use std::path::PathBuf;

/// 보호 목록 데이터 구조
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct ProtectedItems {
    /// 파일/폴더 경로 화이트리스트 (강제삭제, 임시파일, 중복 파일에서 제외)
    pub protected_paths: Vec<String>,
    /// 프로그램 이름 (레지스트리/캐시 정리에서 제외)
    pub protected_programs: Vec<String>,
    /// 쿠키 유지 도메인 (프라이버시 클리너에서 쿠키 보존)
    pub protected_cookies: Vec<String>,
}

/// 기본 보호 목록 가져오기 경로
fn config_path() -> PathBuf {
    let mut p = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    p.push("PCBareun");
    p.push("protected_items.json");
    p
}

fn ensure_dir(path: &PathBuf) {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
}

#[tauri::command]
pub fn get_protected_items() -> Result<ProtectedItems, String> {
    let path = config_path();
    if !path.exists() {
        // 기본 보호 항목 반환
        return Ok(default_protected_items());
    }
    let content =
        fs::read_to_string(&path).map_err(|e| format!("보호 목록 읽기 실패: {}", e))?;
    let items: ProtectedItems =
        serde_json::from_str(&content).map_err(|e| format!("보호 목록 파싱 실패: {}", e))?;
    Ok(items)
}

#[tauri::command]
pub fn save_protected_items(items: ProtectedItems) -> Result<String, String> {
    let path = config_path();
    ensure_dir(&path);
    let json = serde_json::to_string_pretty(&items)
        .map_err(|e| format!("직렬화 실패: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("보호 목록 저장 실패: {}", e))?;
    Ok("보호 목록이 저장되었습니다.".to_string())
}

/// 경로가 보호 목록에 있는지 확인
#[tauri::command]
pub fn is_path_protected(path: String) -> Result<bool, String> {
    let items = get_protected_items()?;
    let normalized = path.replace('/', "\\").to_lowercase();
    Ok(items
        .protected_paths
        .iter()
        .any(|p| normalized.starts_with(&p.replace('/', "\\").to_lowercase())))
}

/// 기본 보호 항목 (시스템 내장 — 사용자가 건드릴 수 없는 보호)
fn default_protected_items() -> ProtectedItems {
    ProtectedItems {
        protected_paths: vec![
            "C:\\Windows\\System32".into(),
            "C:\\Windows\\SysWOW64".into(),
            "C:\\Windows\\WinSxS".into(),
            "C:\\Program Files\\Windows Defender".into(),
            "C:\\Windows\\Boot".into(),
            "C:\\Windows\\Fonts".into(),
        ],
        protected_programs: vec![
            "Windows Defender".into(),
            "Microsoft Edge WebView2".into(),
            ".NET Runtime".into(),
            "Visual C++ Redistributable".into(),
        ],
        protected_cookies: vec![
            "google.com".into(),
            "naver.com".into(),
            "daum.net".into(),
            "github.com".into(),
        ],
    }
}

/// ─── 레지스트리 백업 (삭제 전 .reg 내보내기) ───

#[tauri::command]
pub fn backup_registry_keys(keys: Vec<String>) -> Result<String, String> {
    use crate::utils::cmd::powershell_no_window;

    let backup_dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("PCBareun")
        .join("backups");
    let _ = fs::create_dir_all(&backup_dir);

    let timestamp = chrono_timestamp();
    let backup_file = backup_dir.join(format!("registry_backup_{}.reg", timestamp));
    let backup_path_str = backup_file.to_string_lossy().to_string();

    // PowerShell로 레지스트리 키를 .reg로 내보내기
    let keys_str = keys
        .iter()
        .map(|k| format!("'{}'", k.replace('\'', "''")))
        .collect::<Vec<_>>()
        .join(", ");

    let script = format!(
        r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$keys = @({})
$content = "Windows Registry Editor Version 5.00`r`n`r`n"
foreach ($key in $keys) {{
    try {{
        $regKey = $key -replace 'HKCU:', 'HKEY_CURRENT_USER' -replace 'HKLM:', 'HKEY_LOCAL_MACHINE' -replace 'HKCR:', 'HKEY_CLASSES_ROOT'
        $content += "; Backup of $regKey`r`n[$regKey]`r`n`r`n"
    }} catch {{}}
}}
$content | Out-File -FilePath '{}' -Encoding UTF8
Write-Output 'ok'
"#,
        keys_str,
        backup_path_str.replace('\'', "''")
    );

    let output = powershell_no_window()
        .args(["-Command", &script])
        .output()
        .map_err(|e| format!("백업 실패: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.contains("ok") {
        Ok(format!("백업 완료: {}", backup_path_str))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(format!("백업 실패: {}", stderr))
    }
}

/// 백업 목록 조회
#[tauri::command]
pub fn list_registry_backups() -> Result<Vec<String>, String> {
    let backup_dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("PCBareun")
        .join("backups");

    if !backup_dir.exists() {
        return Ok(Vec::new());
    }

    let mut backups = Vec::new();
    if let Ok(entries) = fs::read_dir(&backup_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".reg") {
                backups.push(name);
            }
        }
    }
    backups.sort();
    backups.reverse();
    Ok(backups)
}

fn chrono_timestamp() -> String {
    use std::time::SystemTime;
    let dur = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}", dur.as_secs())
}
