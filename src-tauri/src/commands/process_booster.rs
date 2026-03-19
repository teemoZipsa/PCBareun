use serde::{Serialize, Deserialize};
use crate::utils::cmd::powershell_no_window;

#[derive(Serialize, Deserialize, Clone)]
pub struct KillableProcess {
    pub pid: u32,
    pub name: String,
    pub memory_mb: f64,
    pub cpu_percent: f64,
    pub category: String, // "browser", "messenger", "media", "dev", "other"
    pub description: String,
}

#[derive(Serialize, Deserialize)]
pub struct KillResult {
    pub killed: u32,
    pub failed: u32,
    pub freed_mb: f64,
}

#[tauri::command]
pub fn get_killable_processes() -> Result<Vec<KillableProcess>, String> {
    let ps_script = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# System-critical processes (NEVER kill)
$protected = @(
    'System','Idle','svchost','csrss','wininit','winlogon','lsass','lsaiso',
    'smss','services','dwm','fontdrvhost','sihost','taskhostw','RuntimeBroker',
    'explorer','SearchHost','SearchIndexer','StartMenuExperienceHost',
    'ShellExperienceHost','TextInputHost','ctfmon','conhost','SecurityHealthService',
    'SecurityHealthSystray','MsMpEng','NisSrv','spoolsv','wlanext',
    'audiodg','Secure System','Registry','Memory Compression',
    'PCBareun','pc-bareun','LsaIso','CompPkgSrv','dllhost','WmiPrvSE','dasHost',
    'WindowsTerminal','OpenConsole','powershell','pwsh','cmd',
    'Antigravity','language_server_windows_x64'
)

$categorize = @{
    'chrome'='browser'; 'msedge'='browser'; 'firefox'='browser'; 'opera'='browser'; 'brave'='browser'; 'whale'='browser'; 'vivaldi'='browser';
    'discord'='messenger'; 'telegram'='messenger'; 'slack'='messenger'; 'teams'='messenger'; 'kakaotalk'='messenger'; 'line'='messenger'; 'nateon'='messenger';
    'spotify'='media'; 'aimp'='media'; 'foobar2000'='media'; 'vlc'='media'; 'potplayer'='media';
    'steam'='gaming'; 'steamwebhelper'='gaming'; 'epicgameslauncher'='gaming'; 'battle.net'='gaming';
    'code'='dev'; 'node'='dev'; 'python'='dev'; 'java'='dev'; 'devenv'='dev'; 'rider64'='dev';
}

$results = @()
$procs = Get-Process -ErrorAction SilentlyContinue | Where-Object {
    ($_.ProcessName -notin $protected) -and
    ($_.Id -ne $PID) -and
    ($_.WorkingSet64 -gt 10MB)
} | Sort-Object WorkingSet64 -Descending | Select-Object -First 100

foreach ($p in $procs) {
    $cat = 'other'
    $nameLower = $p.ProcessName.ToLower()
    foreach ($key in $categorize.Keys) {
        if ($nameLower -like "*$key*") { $cat = $categorize[$key]; break }
    }
    $desc = ''
    try { $desc = $p.MainModule.FileVersionInfo.FileDescription } catch {}
    if (-not $desc) { $desc = $p.ProcessName }

    $cpuPct = 0
    try {
        $elapsed = ((Get-Date) - $p.StartTime).TotalSeconds
        if ($elapsed -gt 0) {
            $cpuPct = [math]::Round(($p.CPU / $elapsed) * 100 / [Environment]::ProcessorCount, 1)
        }
    } catch {}

    $results += [PSCustomObject]@{
        pid = $p.Id
        name = $p.ProcessName
        memory_mb = [math]::Round($p.WorkingSet64 / 1MB, 1)
        cpu_percent = $cpuPct
        category = $cat
        description = $desc
    }
}

if ($results.Count -eq 0) { '[]' } else { $results | ConvertTo-Json -Compress }
"#;

    let output = powershell_no_window()
        .args(["-Command", ps_script])
        .output()
        .map_err(|e| format!("PowerShell 실행 실패: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() || stdout == "[]" {
        return Ok(Vec::new());
    }
    if stdout.starts_with('[') {
        serde_json::from_str(&stdout).map_err(|e| format!("JSON 파싱 오류: {}", e))
    } else {
        match serde_json::from_str::<KillableProcess>(&stdout) {
            Ok(item) => Ok(vec![item]),
            Err(e) => Err(format!("JSON 파싱 오류: {}", e)),
        }
    }
}

#[tauri::command]
pub fn kill_processes(pids: Vec<u32>) -> Result<KillResult, String> {
    let mut killed = 0u32;
    let mut failed = 0u32;
    let mut freed: f64 = 0.0;

    for pid in &pids {
        let ps_cmd = format!(
            "$p = Get-Process -Id {} -ErrorAction SilentlyContinue; if ($p) {{ $mem = $p.WorkingSet64; Stop-Process -Id {} -Force -ErrorAction Stop; [math]::Round($mem/1MB,1) }} else {{ 0 }}",
            pid, pid
        );
        let output = powershell_no_window()
            .args(["-Command", &ps_cmd])
            .output();

        match output {
            Ok(out) if out.status.success() => {
                let mem_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
                let mem: f64 = mem_str.parse().unwrap_or(0.0);
                freed += mem;
                killed += 1;
            }
            _ => { failed += 1; }
        }
    }

    Ok(KillResult { killed, failed, freed_mb: freed })
}
