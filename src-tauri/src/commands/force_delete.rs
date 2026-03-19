use serde::Serialize;
use std::fs;
use std::path::Path;
use crate::utils::cmd::powershell_no_window;

#[derive(Serialize)]
pub struct ForceDeleteResult {
    pub path: String,
    pub success: bool,
    pub message: String,
}

/// Try normal delete first, then use PowerShell to force-remove
fn try_delete(path: &Path) -> ForceDeleteResult {
    let path_str = path.to_string_lossy().to_string();

    // First attempt: standard Rust fs
    if path.is_file() {
        match fs::remove_file(path) {
            Ok(_) => {
                return ForceDeleteResult {
                    path: path_str,
                    success: true,
                    message: "파일이 삭제되었습니다.".into(),
                }
            }
            Err(_) => {} // Fall through to PowerShell
        }
    } else if path.is_dir() {
        match fs::remove_dir_all(path) {
            Ok(_) => {
                return ForceDeleteResult {
                    path: path_str,
                    success: true,
                    message: "폴더가 삭제되었습니다.".into(),
                }
            }
            Err(_) => {} // Fall through to PowerShell
        }
    } else if !path.exists() {
        return ForceDeleteResult {
            path: path_str,
            success: false,
            message: "경로를 찾을 수 없습니다.".into(),
        };
    }

    // Second attempt: PowerShell force remove
    let ps_script = format!(
        r#"
try {{
    Remove-Item -LiteralPath '{}' -Recurse -Force -ErrorAction Stop
    "OK"
}} catch {{
    $_.Exception.Message
}}
"#,
        path_str.replace('\'', "''")
    );

    match powershell_no_window()
        .args(["-Command", &ps_script])
        .output()
    {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if stdout == "OK" {
                ForceDeleteResult {
                    path: path_str,
                    success: true,
                    message: "강제 삭제 성공 (PowerShell)".into(),
                }
            } else {
                // Third attempt: try closing handles via handle.exe or taskkill approach
                let kill_result = try_unlock_and_delete(path);
                if kill_result {
                    ForceDeleteResult {
                        path: path_str,
                        success: true,
                        message: "핸들 해제 후 삭제 성공".into(),
                    }
                } else {
                    ForceDeleteResult {
                        path: path_str,
                        success: false,
                        message: format!("삭제 실패: {}", stdout),
                    }
                }
            }
        }
        Err(e) => ForceDeleteResult {
            path: path_str,
            success: false,
            message: format!("PowerShell 실행 실패: {}", e),
        },
    }
}

/// Try to find the process locking a file and offer to kill it
fn try_unlock_and_delete(path: &Path) -> bool {
    let path_str = path.to_string_lossy().to_string();

    // Use PowerShell to attempt rename-on-reboot or del after releasing
    let script = format!(
        r#"
try {{
    # Try to take ownership and reset permissions
    $acl = Get-Acl '{0}'
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity,"FullControl","Allow")
    $acl.SetAccessRule($rule)
    Set-Acl '{0}' $acl -ErrorAction SilentlyContinue
    
    # Wait briefly and retry
    Start-Sleep -Milliseconds 200
    Remove-Item -LiteralPath '{0}' -Recurse -Force -ErrorAction Stop
    "OK"
}} catch {{
    "FAIL"
}}
"#,
        path_str.replace('\'', "''")
    );

    if let Ok(out) = powershell_no_window()
        .args(["-Command", &script])
        .output()
    {
        let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
        stdout == "OK"
    } else {
        false
    }
}

#[derive(Serialize)]
pub struct FileCheckResult {
    pub path: String,
    pub exists: bool,
    pub is_file: bool,
    pub is_dir: bool,
    pub size_bytes: u64,
    pub locked: bool,
}

#[tauri::command]
pub fn check_file_status(path: String) -> Result<FileCheckResult, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Ok(FileCheckResult {
            path,
            exists: false,
            is_file: false,
            is_dir: false,
            size_bytes: 0,
            locked: false,
        });
    }

    let is_file = p.is_file();
    let is_dir = p.is_dir();
    let size_bytes = if is_file {
        p.metadata().map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };

    // Quick lock check: try to open with write access
    let locked = if is_file {
        std::fs::OpenOptions::new()
            .write(true)
            .open(p)
            .is_err()
    } else {
        false
    };

    Ok(FileCheckResult {
        path,
        exists: true,
        is_file,
        is_dir,
        size_bytes,
        locked,
    })
}

#[tauri::command]
pub fn force_delete_path(path: String) -> Result<ForceDeleteResult, String> {
    let p = Path::new(&path);
    Ok(try_delete(p))
}
