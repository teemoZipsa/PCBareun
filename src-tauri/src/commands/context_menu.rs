use serde::{Serialize, Deserialize};
use std::process::Command;

#[derive(Serialize, Deserialize, Clone)]
pub struct ContextMenuItem {
    pub name: String,
    pub command: String,
    pub icon: String,
    pub registry_path: String,
    pub location: String, // "file", "directory", "background", "drive"
}

#[tauri::command]
pub fn get_context_menu_items() -> Result<Vec<ContextMenuItem>, String> {
    let ps = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$results = @()

# Shell context menu (files)
$shellPaths = @(
    @{ Path = 'HKCR:\*\shell'; Location = 'file' },
    @{ Path = 'HKCR:\Directory\shell'; Location = 'directory' },
    @{ Path = 'HKCR:\Directory\Background\shell'; Location = 'background' },
    @{ Path = 'HKCR:\Drive\shell'; Location = 'drive' },
    @{ Path = 'HKLM:\SOFTWARE\Classes\*\shell'; Location = 'file' },
    @{ Path = 'HKLM:\SOFTWARE\Classes\Directory\shell'; Location = 'directory' },
    @{ Path = 'HKLM:\SOFTWARE\Classes\Directory\Background\shell'; Location = 'background' }
)

foreach ($sp in $shellPaths) {
    if (Test-Path $sp.Path) {
        Get-ChildItem $sp.Path -ErrorAction SilentlyContinue | ForEach-Object {
            $name = $_.PSChildName
            $displayName = (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).'(default)'
            if (-not $displayName) { $displayName = $name }

            $cmdPath = Join-Path $_.PSPath 'command'
            $cmd = ''
            if (Test-Path $cmdPath) {
                $cmd = (Get-ItemProperty $cmdPath -ErrorAction SilentlyContinue).'(default)'
                if (-not $cmd) { $cmd = '' }
            }

            $icon = ''
            $iconVal = (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).Icon
            if ($iconVal) { $icon = $iconVal }

            $regPath = $_.PSPath -replace 'Microsoft\.PowerShell\.Core\\Registry::', ''

            $results += [PSCustomObject]@{
                name = $displayName
                command = $cmd
                icon = $icon
                registry_path = $regPath
                location = $sp.Location
            }
        }
    }
}

$results | Sort-Object Name | ConvertTo-Json -Compress
"#;

    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", ps])
        .output()
        .map_err(|e| format!("PowerShell 실행 실패: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json_str = stdout.trim();

    if json_str.is_empty() {
        return Ok(Vec::new());
    }

    if json_str.starts_with('[') {
        serde_json::from_str(json_str).map_err(|e| format!("JSON 파싱 오류: {}", e))
    } else {
        match serde_json::from_str::<ContextMenuItem>(json_str) {
            Ok(item) => Ok(vec![item]),
            Err(e) => Err(format!("JSON 파싱 오류: {}", e)),
        }
    }
}

#[tauri::command]
pub fn disable_context_menu_item(registry_path: String) -> Result<String, String> {
    // Hide the menu item by adding LegacyDisable value
    let ps = format!(
        "New-ItemProperty -Path '{}' -Name 'LegacyDisable' -Value '' -PropertyType String -Force -ErrorAction Stop",
        registry_path.replace('\'', "''")
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps])
        .output()
        .map_err(|e| format!("실행 실패: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("비활성화 실패: {}", stderr));
    }

    Ok("컨텍스트 메뉴 항목이 비활성화되었습니다.".to_string())
}

#[tauri::command]
pub fn enable_context_menu_item(registry_path: String) -> Result<String, String> {
    let ps = format!(
        "Remove-ItemProperty -Path '{}' -Name 'LegacyDisable' -Force -ErrorAction Stop",
        registry_path.replace('\'', "''")
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps])
        .output()
        .map_err(|e| format!("실행 실패: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("활성화 실패: {}", stderr));
    }

    Ok("컨텍스트 메뉴 항목이 활성화되었습니다.".to_string())
}

#[tauri::command]
pub fn delete_context_menu_item(registry_path: String) -> Result<String, String> {
    let ps = format!(
        "Remove-Item -Path '{}' -Recurse -Force -ErrorAction Stop",
        registry_path.replace('\'', "''")
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps])
        .output()
        .map_err(|e| format!("실행 실패: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("삭제 실패: {}", stderr));
    }

    Ok("컨텍스트 메뉴 항목이 삭제되었습니다.".to_string())
}
