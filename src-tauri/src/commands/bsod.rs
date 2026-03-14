use serde::Serialize;
use std::fs;
use std::path::Path;
use std::process::Command;

#[derive(Serialize, serde::Deserialize, Clone)]
pub struct BsodEvent {
    pub timestamp: String,
    pub bug_check_code: String,
    pub description: String,
    pub dump_file: String,
    pub parameters: String,
}

#[derive(Serialize)]
pub struct BsodSummary {
    pub events: Vec<BsodEvent>,
    pub total_events: usize,
    pub dump_files_count: usize,
    pub latest_event: Option<String>,
}

// ── Known BugCheck codes ────────────────────────────────────

fn bugcheck_description(code: &str) -> String {
    match code.to_uppercase().as_str() {
        "0X0000000A" | "0XA" => "IRQL_NOT_LESS_OR_EQUAL".into(),
        "0X0000001E" | "0X1E" => "KMODE_EXCEPTION_NOT_HANDLED".into(),
        "0X00000024" | "0X24" => "NTFS_FILE_SYSTEM".into(),
        "0X0000003B" | "0X3B" => "SYSTEM_SERVICE_EXCEPTION".into(),
        "0X00000050" | "0X50" => "PAGE_FAULT_IN_NONPAGED_AREA".into(),
        "0X0000007E" | "0X7E" => "SYSTEM_THREAD_EXCEPTION_NOT_HANDLED".into(),
        "0X0000007F" | "0X7F" => "UNEXPECTED_KERNEL_MODE_TRAP".into(),
        "0X0000009F" | "0X9F" => "DRIVER_POWER_STATE_FAILURE".into(),
        "0X000000D1" | "0XD1" => "DRIVER_IRQL_NOT_LESS_OR_EQUAL".into(),
        "0X000000EF" | "0XEF" => "CRITICAL_PROCESS_DIED".into(),
        "0X00000116" | "0X116" => "VIDEO_TDR_TIMEOUT_DETECTED".into(),
        "0X00000119" | "0X119" => "VIDEO_SCHEDULER_INTERNAL_ERROR".into(),
        "0X0000012B" | "0X12B" => "FAULTY_HARDWARE_CORRUPTED_PAGE".into(),
        "0X00000133" | "0X133" => "DPC_WATCHDOG_VIOLATION".into(),
        "0X00000139" | "0X139" => "KERNEL_SECURITY_CHECK_FAILURE".into(),
        "0X0000013A" | "0X13A" => "KERNEL_MODE_HEAP_CORRUPTION".into(),
        "0X000001CA" | "0X1CA" => "SYNTHETIC_WATCHDOG_TIMEOUT".into(),
        "0X00000154" | "0X154" => "UNEXPECTED_STORE_EXCEPTION".into(),
        "0X000000C5" | "0XC5" => "DRIVER_CORRUPTED_EXPOOL".into(),
        "0X000000BE" | "0XBE" => "ATTEMPTED_WRITE_TO_READONLY_MEMORY".into(),
        _ => "알 수 없는 오류 코드".into(),
    }
}

// ── Get BSOD events from Windows Event Log ──────────────────

fn get_events_from_log() -> Vec<BsodEvent> {
    let script = r#"
try {
    $events = Get-WinEvent -FilterHashtable @{
        LogName = 'System'
        Id = 1001
    } -MaxEvents 50 -ErrorAction Stop |
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    Where-Object { $_.ProviderName -eq 'Microsoft-Windows-WER-SystemErrorReporting' }

    $result = @()
    foreach ($e in $events) {
        $msg = $e.Message
        $code = ""
        $params = ""

        # Extract BugCheck code from message
        if ($msg -match 'BugcheckCode\s*[=:]\s*(0x[0-9A-Fa-f]+|\d+)') {
            $code = $Matches[1]
        } elseif ($msg -match 'bugcheck.*?(0x[0-9A-Fa-f]+)') {
            $code = $Matches[1]
        }

        if ($msg -match 'BugcheckParameter\d?\s*[=:]\s*(.+)') {
            $params = $Matches[1]
        }

        # Try dump file path
        $dump = ""
        if ($msg -match '(C:\\Windows\\MEMORY\.DMP|C:\\Windows\\Minidump\\[^\s]+)') {
            $dump = $Matches[1]
        }

        $result += [PSCustomObject]@{
            timestamp = $e.TimeCreated.ToString("yyyy-MM-dd HH:mm:ss")
            bug_check_code = $code
            description = ""
            dump_file = $dump
            parameters = $params
        }
    }
    $result | ConvertTo-Json -Compress
} catch {
    "[]"
}
"#;

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if stdout.is_empty() || stdout == "[]" {
                return Vec::new();
            }
            if let Ok(mut items) = serde_json::from_str::<Vec<BsodEvent>>(&stdout) {
                for item in &mut items {
                    if !item.bug_check_code.is_empty() {
                        item.description = bugcheck_description(&item.bug_check_code);
                    }
                }
                items
            } else if let Ok(mut item) = serde_json::from_str::<BsodEvent>(&stdout) {
                if !item.bug_check_code.is_empty() {
                    item.description = bugcheck_description(&item.bug_check_code);
                }
                vec![item]
            } else {
                Vec::new()
            }
        }
        Err(_) => Vec::new(),
    }
}

// ── Count minidump files ────────────────────────────────────

fn count_minidumps() -> usize {
    let path = Path::new(r"C:\Windows\Minidump");
    if !path.is_dir() {
        return 0;
    }
    fs::read_dir(path)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| {
            e.path()
                .extension()
                .map(|ext| ext.eq_ignore_ascii_case("dmp"))
                .unwrap_or(false)
        })
        .count()
}

// ── Tauri command ───────────────────────────────────────────

#[tauri::command]
pub fn get_bsod_events() -> Result<BsodSummary, String> {
    let events = get_events_from_log();
    let total = events.len();
    let latest = events.first().map(|e| e.timestamp.clone());
    let dumps = count_minidumps();

    Ok(BsodSummary {
        events,
        total_events: total,
        dump_files_count: dumps,
        latest_event: latest,
    })
}
