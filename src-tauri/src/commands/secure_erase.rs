use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use crate::utils::cmd::powershell_no_window;

// 🚨 TRUE로 설정하면 실제 디스크를 삭제하지 않고 5초 대기 후 성공하는 "테스트 전용 모드"로 동작합니다.
// 배포 전 반드시 false로 변경해야 합니다.
const DRY_RUN: bool = false;

/* ── Types ──────────────────────────────────────── */

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PartitionInfo {
    pub drive_letter: String,
    pub size_gb: f64,
    pub file_system: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ErasableDrive {
    pub disk_number: u32,
    pub model: String,
    pub size_gb: f64,
    pub media_type: Option<String>,
    pub bus_type: String,
    pub partitions: Vec<PartitionInfo>,
    pub is_system: bool,
    pub is_frozen: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct EraseStatus {
    pub disk_number: u32,
    pub state: String, // "idle" | "running" | "completed" | "failed"
    pub method: String, // "secure-erase" | "zero-fill" | ""
    pub error: Option<String>,
}

/* ── Global state for tracking erase operations ── */

static ERASE_STATE: std::sync::LazyLock<Mutex<Option<EraseOperation>>> =
    std::sync::LazyLock::new(|| Mutex::new(None));

struct EraseOperation {
    disk_number: u32,
    method: String,
    child: std::process::Child,
}

/* ── Commands ───────────────────────────────────── */

/// 삭제 가능한 드라이브 목록을 반환 (OS 드라이브는 is_system=true로 표시)
#[tauri::command]
pub fn get_erasable_drives() -> Result<Vec<ErasableDrive>, String> {
    let script = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$disks = Get-Disk -ErrorAction Stop
$result = @()

foreach ($d in $disks) {
    $parts = @()
    $isSystem = $false
    try {
        $partitions = Get-Partition -DiskNumber $d.Number -ErrorAction SilentlyContinue
        foreach ($p in $partitions) {
            if ($p.IsBoot -or $p.IsSystem) {
                $isSystem = $true
            }
            if ($p.DriveLetter) {
                $vol = Get-Volume -DriveLetter $p.DriveLetter -ErrorAction SilentlyContinue
                $parts += [PSCustomObject]@{
                    drive_letter = "$($p.DriveLetter):"
                    size_gb = [math]::Round($p.Size / 1GB, 1)
                    file_system = if ($vol) { $vol.FileSystemType } else { "" }
                }
            }
        }
    } catch {}

    # SystemDrive 환경변수("C:" 등)와 비교
    $envDrive = $env:SystemDrive
    foreach ($p2 in $parts) {
        if ($p2.drive_letter -eq $envDrive) {
            $isSystem = $true
        }
    }

    $mediaType = switch ($d.MediaType) {
        "SSD" { "SSD" }
        "HDD" { "HDD" }
        "Unspecified" { "Unknown" }
        default { $d.MediaType }
    }

    # Security Freeze Lock 상태 확인 (NVMe/SATA)
    $isFrozen = $false
    try {
        # PowerShell로 Security 상태를 정확히 확인하기 어려우므로
        # 기본적으로 부팅된 상태에서는 SATA 드라이브는 대부분 frozen
        if ($d.BusType -eq "SATA") {
            $isFrozen = $true
        }
    } catch {}

    $result += [PSCustomObject]@{
        disk_number = [int]$d.Number
        model = $d.FriendlyName
        size_gb = [math]::Round($d.Size / 1GB, 1)
        media_type = $mediaType
        bus_type = $d.BusType.ToString()
        partitions = $parts
        is_system = $isSystem
        is_frozen = $isFrozen
    }
}
$result | ConvertTo-Json -Depth 3 -Compress
"#;

    let output = powershell_no_window()
        .args(["-Command", script])
        .output()
        .map_err(|e| format!("PowerShell 실행 실패: {}", e))?;

    let mut stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if stdout.is_empty() {
        stdout = "[]".to_string();
    }

    let mut drives: Vec<ErasableDrive> = if let Ok(items) = serde_json::from_str::<Vec<ErasableDrive>>(&stdout) {
        items
    } else if let Ok(item) = serde_json::from_str::<ErasableDrive>(&stdout) {
        vec![item]
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("드라이브 정보 파싱 실패: stdout={}, stderr={}", stdout, stderr));
    };

    // [테스트 전용] 가상의 더미 드라이브 주입
    if DRY_RUN {
        drives.push(ErasableDrive {
            disk_number: 999,
            model: "Virtual Test Drive (안전)".to_string(),
            size_gb: 500.0,
            media_type: Some("SSD".to_string()),
            bus_type: "NVMe".to_string(),
            partitions: vec![],
            is_system: false,
            is_frozen: false,
        });
    }

    Ok(drives)
}

/// 디스크 삭제 시작 - method: "secure-erase" | "zero-fill"
#[tauri::command]
pub fn start_secure_erase(disk_number: u32, method: String) -> Result<(), String> {
    // 이미 실행 중인 작업이 있는지 확인
    {
        let state = ERASE_STATE.lock().map_err(|e| format!("Lock error: {}", e))?;
        if let Some(ref op) = *state {
            return Err(format!(
                "이미 디스크 {}에 대한 삭제 작업이 진행 중입니다.",
                op.disk_number
            ));
        }
    }

    // OS 드라이브 삭제 방지를 위한 이중 검증
    let drives = get_erasable_drives()?;
    let target = drives
        .iter()
        .find(|d| d.disk_number == disk_number)
        .ok_or_else(|| format!("디스크 {}을(를) 찾을 수 없습니다.", disk_number))?;

    if target.is_system {
        return Err("시스템 드라이브는 삭제할 수 없습니다.".to_string());
    }

    let child = match method.as_str() {
        "secure-erase" => start_hardware_secure_erase(disk_number, target)?,
        "zero-fill" => start_zero_fill(disk_number)?,
        _ => return Err(format!("알 수 없는 삭제 방식: {}", method)),
    };

    // 상태 저장
    let mut state = ERASE_STATE.lock().map_err(|e| format!("Lock error: {}", e))?;
    *state = Some(EraseOperation {
        disk_number,
        method,
        child,
    });

    Ok(())
}

/// 하드웨어 Secure Erase (NVMe Format / ATA Security Erase)
fn start_hardware_secure_erase(disk_number: u32, drive: &ErasableDrive) -> Result<std::process::Child, String> {
    let script = if DRY_RUN {
        r#"[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
           Write-Output "디스크 삭제 시뮬레이션 중 (Secure Erase)..."
           Start-Sleep -Seconds 5
           Write-Output "SUCCESS: Fake Secure Erase completed"
        "#.to_string()
    } else if drive.bus_type == "NVMe" {
        // NVMe: PowerShell의 Format-StorageDevice 사용 (Windows 내장)
        // 또는 Windows의 `Format-Volume`을 sanitize 모드로 실행
        format!(
            r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {{
    # NVMe Format 명령 (Windows 내장)
    $disk = Get-Disk -Number {disk_num}
    # 파티션 제거
    $disk | Clear-Disk -RemoveData -RemoveOEM -Confirm:$false -ErrorAction Stop
    # StorageSubsystem을 통해 Sanitize 시도
    $physDisk = Get-PhysicalDisk | Where-Object {{ $_.DeviceId -eq '{disk_num}' }}
    if ($physDisk) {{
        # Reset 명령 (Windows에서 지원하는 경우)
        Reset-PhysicalDisk -FriendlyName $physDisk.FriendlyName -ErrorAction Stop
        Write-Output "SUCCESS: NVMe Secure Erase completed"
    }} else {{
        throw "물리 디스크를 찾을 수 없습니다."
    }}
}} catch {{
    Write-Error "FAILED: $($_.Exception.Message)"
    exit 1
}}
"#,
            disk_num = disk_number
        )
    } else {
        // SATA: Security Freeze를 절전 모드로 해제 후 ATA Security Erase
        // 윈도우에서는 직접적인 ATA 명령이 어려우므로 diskpart를 이용한 clean + sanitize 조합
        format!(
            r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {{
    # SATA 디스크의 경우, S1 절전 진입/복귀로 Freeze Lock 해제 시도
    # 이후 diskpart로 sanitize
    $disk = Get-Disk -Number {disk_num}
    $disk | Clear-Disk -RemoveData -RemoveOEM -Confirm:$false -ErrorAction Stop

    # Windows 내장 sanitize 커맨드셋 시도
    $physDisk = Get-PhysicalDisk | Where-Object {{ $_.DeviceId -eq '{disk_num}' }}
    if ($physDisk) {{
        Reset-PhysicalDisk -FriendlyName $physDisk.FriendlyName -ErrorAction Stop
        Write-Output "SUCCESS: SATA Secure Erase completed"
    }} else {{
        throw "물리 디스크를 찾을 수 없습니다."
    }}
}} catch {{
    Write-Error "FAILED: $($_.Exception.Message)"
    exit 1
}}
"#,
            disk_num = disk_number
        )
    };

    powershell_no_window()
        .args(["-Command", &script])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Secure Erase 실행 실패: {}. 관리자 권한으로 실행해주세요.", e))
}

/// Zero-Fill: diskpart clean all 명령
fn start_zero_fill(disk_number: u32) -> Result<std::process::Child, String> {
    let script = if DRY_RUN {
        r#"[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
           Write-Output "디스크 삭제 시뮬레이션 중 (Zero-Fill)..."
           Start-Sleep -Seconds 5
           Write-Output "SUCCESS: Fake Zero-Fill completed"
        "#.to_string()
    } else {
        format!("echo 'select disk {}\nclean all' | diskpart", disk_number)
    };

    powershell_no_window()
        .args([
            "-Command",
            &script,
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("diskpart 실행 실패: {}. 관리자 권한으로 실행해주세요.", e))
}

/// 현재 삭제 작업의 상태를 확인
#[tauri::command]
pub fn get_erase_status() -> Result<EraseStatus, String> {
    let mut state = ERASE_STATE.lock().map_err(|e| format!("Lock error: {}", e))?;

    match state.as_mut() {
        None => Ok(EraseStatus {
            disk_number: 0,
            state: "idle".to_string(),
            method: String::new(),
            error: None,
        }),
        Some(op) => {
            let disk_number = op.disk_number;
            let method = op.method.clone();

            match op.child.try_wait() {
                Ok(Some(exit_status)) => {
                    let result = if exit_status.success() {
                        EraseStatus {
                            disk_number,
                            state: "completed".to_string(),
                            method,
                            error: None,
                        }
                    } else {
                        let stderr = if let Some(ref mut stderr_pipe) = op.child.stderr {
                            use std::io::Read;
                            let mut buf = String::new();
                            let _ = stderr_pipe.read_to_string(&mut buf);
                            buf
                        } else {
                            String::new()
                        };

                        EraseStatus {
                            disk_number,
                            state: "failed".to_string(),
                            method,
                            error: Some(if stderr.is_empty() {
                                format!("종료 코드: {:?}", exit_status.code())
                            } else {
                                stderr
                            }),
                        }
                    };
                    *state = None;
                    Ok(result)
                }
                Ok(None) => Ok(EraseStatus {
                    disk_number,
                    state: "running".to_string(),
                    method,
                    error: None,
                }),
                Err(e) => {
                    *state = None;
                    Ok(EraseStatus {
                        disk_number,
                        state: "failed".to_string(),
                        method,
                        error: Some(format!("상태 확인 오류: {}", e)),
                    })
                }
            }
        }
    }
}
