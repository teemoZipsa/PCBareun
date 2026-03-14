use serde::Serialize;
use std::process::Command;

#[derive(Serialize, serde::Deserialize, Clone)]
pub struct ScheduledTask {
    pub name: String,
    pub path: String,
    pub state: String,         // Ready, Disabled, Running, Queued
    pub last_run: String,
    pub next_run: String,
    pub trigger: String,
    pub author: String,
    pub description: String,
}

#[tauri::command]
pub fn get_scheduled_tasks() -> Result<Vec<ScheduledTask>, String> {
    let ps = r#"
Get-ScheduledTask | Where-Object { $_.TaskPath -notlike '\Microsoft\*' } | ForEach-Object {
    $info = $_ | Get-ScheduledTaskInfo -ErrorAction SilentlyContinue
    $trig = ''
    if ($_.Triggers.Count -gt 0) {
        $t = $_.Triggers[0]
        $type = $t.CimClass.CimClassName -replace 'MSFT_Task',''-replace 'Trigger',''
        $trig = $type
        if ($t.StartBoundary) { $trig += ' ' + $t.StartBoundary.Substring(0,16) }
    }
    [PSCustomObject]@{
        name = $_.TaskName
        path = $_.TaskPath
        state = $_.State.ToString()
        last_run = if($info -and $info.LastRunTime -and $info.LastRunTime.Year -gt 1601){ $info.LastRunTime.ToString('yyyy-MM-dd HH:mm') } else { '' }
        next_run = if($info -and $info.NextRunTime -and $info.NextRunTime.Year -gt 1601){ $info.NextRunTime.ToString('yyyy-MM-dd HH:mm') } else { '' }
        trigger = $trig
        author = if($_.Author){ $_.Author } else { '' }
        description = if($_.Description){ $_.Description.Substring(0,[Math]::Min(200,$_.Description.Length)) } else { '' }
    }
} | ConvertTo-Json -Compress
"#;

    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", ps])
        .output()
        .map_err(|e| format!("PowerShell 실행 실패: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("PowerShell 오류: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json_str = stdout.trim();

    if json_str.is_empty() {
        return Ok(Vec::new());
    }

    let tasks: Vec<ScheduledTask> = if json_str.starts_with('[') {
        serde_json::from_str(json_str)
            .map_err(|e| format!("JSON 파싱 오류: {}", e))?
    } else {
        let single: ScheduledTask = serde_json::from_str(json_str)
            .map_err(|e| format!("JSON 파싱 오류: {}", e))?;
        vec![single]
    };

    Ok(tasks)
}

#[tauri::command]
pub fn set_task_enabled(task_name: String, task_path: String, enabled: bool) -> Result<String, String> {
    let verb = if enabled { "Enable" } else { "Disable" };
    let ps_cmd = format!(
        "{}-ScheduledTask -TaskName '{}' -TaskPath '{}' -ErrorAction Stop",
        verb, task_name, task_path
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps_cmd])
        .output()
        .map_err(|e| format!("실행 실패: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("작업 {} 실패: {}", verb, stderr));
    }

    let label = if enabled { "활성화" } else { "비활성화" };
    Ok(format!("작업 '{}' {} 완료", task_name, label))
}

#[tauri::command]
pub fn run_task_now(task_name: String, task_path: String) -> Result<String, String> {
    let ps_cmd = format!(
        "Start-ScheduledTask -TaskName '{}' -TaskPath '{}' -ErrorAction Stop",
        task_name, task_path
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps_cmd])
        .output()
        .map_err(|e| format!("실행 실패: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("즉시 실행 실패: {}", stderr));
    }

    Ok(format!("작업 '{}' 즉시 실행 완료", task_name))
}
