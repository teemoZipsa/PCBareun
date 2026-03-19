use serde::{Serialize, Deserialize};
use crate::utils::cmd::powershell_no_window;

#[derive(Serialize, Deserialize, Clone)]
pub struct RegistryIssue {
    pub id: String,
    pub category: String,
    pub path: String,
    pub name: String,
    pub description: String,
    pub severity: String, // "low", "medium", "high"
}

#[derive(Serialize)]
pub struct RegistryScanResult {
    pub issues: Vec<RegistryIssue>,
    pub total_count: usize,
}

#[derive(Serialize)]
pub struct FailedItem {
    pub name: String,
    pub reason: String,
}

#[derive(Serialize)]
pub struct RegistryFixResult {
    pub fixed_count: usize,
    pub failed_count: usize,
    pub failed_items: Vec<FailedItem>,
}

#[tauri::command]
pub fn scan_registry_issues(categories: Option<Vec<String>>) -> Result<RegistryScanResult, String> {
    let cats = categories.unwrap_or_else(|| {
        vec![
            "shared_dll".into(), "file_extension".into(), "startup".into(),
            "uninstall".into(), "app_path".into(), "mui_cache".into(),
            "activex".into(), "type_library".into(), "font".into(),
            "help_file".into(), "sound_event".into(), "start_menu".into(),
        ]
    });
    let cats_str = cats.iter().map(|c| format!("'{}'", c)).collect::<Vec<_>>().join(",");

    let cats_line = format!("$cats = @({})", cats_str);
    let ps_script = cats_line + r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$issues = @()
$idx = 0

# 1. Shared DLLs - references to non-existent files
if ($cats -contains 'shared_dll') {
try {
    $dllPath = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\SharedDLLs'
    if (Test-Path $dllPath) {
        $props = Get-ItemProperty $dllPath -ErrorAction SilentlyContinue
        if ($props) {
            $props.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {
                if (-not (Test-Path $_.Name -ErrorAction SilentlyContinue)) {
                    $issues += [PSCustomObject]@{
                        id = "dll_$idx"
                        category = "shared_dll"
                        path = $dllPath
                        name = $_.Name
                        description = "존재하지 않는 공유 DLL 참조"
                        severity = "low"
                    }
                    $idx++
                }
            }
        }
    }
} catch {}
}

# 2. Unused file extensions
if ($cats -contains 'file_extension') {
try {
    Get-ChildItem 'HKCR:\' -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^\.' } | Select-Object -First 500 | ForEach-Object {
        $ext = $_.PSChildName
        $default = (Get-ItemProperty "HKCR:\$ext" -ErrorAction SilentlyContinue).'(default)'
        if ($default -and $default -ne '') {
            if (-not (Test-Path "HKCR:\$default" -ErrorAction SilentlyContinue)) {
                $issues += [PSCustomObject]@{
                    id = "ext_$idx"
                    category = "file_extension"
                    path = "HKCR:\$ext"
                    name = "$ext -> $default"
                    description = "존재하지 않는 프로그램을 가리키는 파일 확장자"
                    severity = "low"
                }
                $idx++
            }
        }
    }
} catch {}
}

# 3. Startup items pointing to missing files
if ($cats -contains 'startup') {
try {
    $runPaths = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run',
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run',
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce',
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce'
    )
    foreach ($rp in $runPaths) {
        if (Test-Path $rp) {
            $props = Get-ItemProperty $rp -ErrorAction SilentlyContinue
            if ($props) {
                $props.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {
                    $val = $_.Value
                    if ($val -match '"([^"]+)"') { $exePath = $Matches[1] }
                    elseif ($val -match '^([^\s]+)') { $exePath = $Matches[1] }
                    else { $exePath = $val }
                    if ($exePath -and -not (Test-Path $exePath -ErrorAction SilentlyContinue)) {
                        $issues += [PSCustomObject]@{
                            id = "run_$idx"
                            category = "startup"
                            path = $rp
                            name = $_.Name
                            description = "시작 프로그램이 존재하지 않음: $exePath"
                            severity = "medium"
                        }
                        $idx++
                    }
                }
            }
        }
    }
} catch {}
}

# 4. Uninstall entries pointing to missing uninstallers
if ($cats -contains 'uninstall') {
try {
    $uninstPaths = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    foreach ($up in $uninstPaths) {
        Get-ItemProperty $up -ErrorAction SilentlyContinue | ForEach-Object {
            if ($_.UninstallString) {
                # Skip if InstallLocation exists (program is still installed)
                $installLoc = $_.InstallLocation
                if ($installLoc -and $installLoc.Trim() -ne '' -and (Test-Path $installLoc.TrimEnd('\') -ErrorAction SilentlyContinue)) {
                    return
                }

                $uStr = $_.UninstallString
                if ($uStr -match '"([^"]+)"') { $exePath = $Matches[1] }
                elseif ($uStr -match '^([^\s]+)') { $exePath = $Matches[1] }
                else { $exePath = $uStr }

                # Expand environment variables
                if ($exePath) { $exePath = [Environment]::ExpandEnvironmentVariables($exePath) }

                if ($exePath -and -not ($exePath -match 'msiexec') -and -not (Test-Path $exePath -ErrorAction SilentlyContinue)) {
                    $displayName = if($_.DisplayName) { $_.DisplayName } else { $_.PSChildName }
                    $issues += [PSCustomObject]@{
                        id = "uninst_$idx"
                        category = "uninstall"
                        path = $_.PSPath -replace 'Microsoft.PowerShell.Core\\Registry::', ''
                        name = $displayName
                        description = "제거 프로그램이 존재하지 않음"
                        severity = "medium"
                    }
                    $idx++
                }
            }
        }
    }
} catch {}
}

# 5. App Paths pointing to missing executables
if ($cats -contains 'app_path') {
try {
    $appPathsRoot = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths'
    if (Test-Path $appPathsRoot) {
        Get-ChildItem $appPathsRoot -ErrorAction SilentlyContinue | ForEach-Object {
            $default = (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).'(default)'
            if ($default -and $default -ne '' -and -not (Test-Path $default -ErrorAction SilentlyContinue)) {
                $issues += [PSCustomObject]@{
                    id = "apppath_$idx"
                    category = "app_path"
                    path = $_.PSPath -replace 'Microsoft.PowerShell.Core\\Registry::', ''
                    name = $_.PSChildName
                    description = "애플리케이션 경로가 존재하지 않음: $default"
                    severity = "low"
                }
                $idx++
            }
        }
    }
} catch {}
}

# 6. MUI Cache - stale entries
if ($cats -contains 'mui_cache') {
try {
    $muiPath = 'HKCU:\SOFTWARE\Classes\Local Settings\Software\Microsoft\Windows\Shell\MuiCache'
    if (Test-Path $muiPath) {
        $props = Get-ItemProperty $muiPath -ErrorAction SilentlyContinue
        if ($props) {
            $props.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' -and $_.Name -match '\\' } | Select-Object -First 300 | ForEach-Object {
                $filePath = $_.Name -replace '\.FriendlyAppName$', '' -replace '\.ApplicationCompany$', ''
                if ($filePath -match '^[A-Za-z]:\\' -and -not (Test-Path $filePath -ErrorAction SilentlyContinue)) {
                    $issues += [PSCustomObject]@{
                        id = "mui_$idx"
                        category = "mui_cache"
                        path = $muiPath
                        name = (Split-Path $filePath -Leaf)
                        description = "MUI 캐시에 존재하지 않는 프로그램 참조"
                        severity = "low"
                    }
                    $idx++
                }
            }
        }
    }
} catch {}
}

# 7. ActiveX / COM - orphaned CLSIDs
if ($cats -contains 'activex') {
try {
    Get-ChildItem 'HKCR:\CLSID' -ErrorAction SilentlyContinue | Select-Object -First 2000 | ForEach-Object {
        $inproc = Join-Path $_.PSPath 'InprocServer32'
        if (Test-Path $inproc) {
            $dll = (Get-ItemProperty $inproc -ErrorAction SilentlyContinue).'(default)'
            if ($dll -and $dll -ne '' -and $dll -notmatch '%' -and -not (Test-Path $dll -ErrorAction SilentlyContinue)) {
                $issues += [PSCustomObject]@{
                    id = "ax_$idx"
                    category = "activex"
                    path = $_.PSPath -replace 'Microsoft.PowerShell.Core\\Registry::', ''
                    name = $_.PSChildName
                    description = "ActiveX/COM DLL이 존재하지 않음: $dll"
                    severity = "low"
                }
                $idx++
            }
        }
    }
} catch {}
}

# 8. Type Libraries - orphaned entries
if ($cats -contains 'type_library') {
try {
    Get-ChildItem 'HKCR:\TypeLib' -ErrorAction SilentlyContinue | Select-Object -First 500 | ForEach-Object {
        $versions = Get-ChildItem $_.PSPath -ErrorAction SilentlyContinue
        foreach ($ver in $versions) {
            $win32 = Join-Path $ver.PSPath '0\win32'
            if (Test-Path $win32) {
                $tlb = (Get-ItemProperty $win32 -ErrorAction SilentlyContinue).'(default)'
                if ($tlb -and $tlb -ne '' -and $tlb -notmatch '%' -and -not (Test-Path $tlb -ErrorAction SilentlyContinue)) {
                    $issues += [PSCustomObject]@{
                        id = "tlib_$idx"
                        category = "type_library"
                        path = $ver.PSPath -replace 'Microsoft.PowerShell.Core\\Registry::', ''
                        name = $_.PSChildName
                        description = "형식 라이브러리가 존재하지 않음: $tlb"
                        severity = "low"
                    }
                    $idx++
                }
            }
        }
    }
} catch {}
}

# 9. Fonts - references to missing font files
if ($cats -contains 'font') {
try {
    $fontPath = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts'
    if (Test-Path $fontPath) {
        $props = Get-ItemProperty $fontPath -ErrorAction SilentlyContinue
        if ($props) {
            $props.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {
                $fontFile = $_.Value
                if ($fontFile -and $fontFile -ne '') {
                    $fullPath = if ([System.IO.Path]::IsPathRooted($fontFile)) { $fontFile } else { Join-Path "$env:SystemRoot\Fonts" $fontFile }
                    if (-not (Test-Path $fullPath -ErrorAction SilentlyContinue)) {
                        $issues += [PSCustomObject]@{
                            id = "font_$idx"
                            category = "font"
                            path = $fontPath
                            name = $_.Name
                            description = "글꼴 파일이 존재하지 않음: $fontFile"
                            severity = "low"
                        }
                        $idx++
                    }
                }
            }
        }
    }
} catch {}
}

# 10. Help files - orphaned .hlp/.chm references
if ($cats -contains 'help_file') {
try {
    $helpPaths = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\HTML Help',
        'HKLM:\SOFTWARE\Microsoft\Windows\Help'
    )
    foreach ($hp in $helpPaths) {
        if (Test-Path $hp) {
            $props = Get-ItemProperty $hp -ErrorAction SilentlyContinue
            if ($props) {
                $props.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {
                    if ($_.Value -and (Test-Path $_.Value -IsValid) -and -not (Test-Path $_.Value -ErrorAction SilentlyContinue)) {
                        $issues += [PSCustomObject]@{
                            id = "help_$idx"
                            category = "help_file"
                            path = $hp
                            name = $_.Name
                            description = "도움말 파일이 존재하지 않음"
                            severity = "low"
                        }
                        $idx++
                    }
                }
            }
        }
    }
} catch {}
}

# 11. Sound events with missing .wav files
if ($cats -contains 'sound_event') {
try {
    Get-ChildItem 'HKCU:\AppEvents\Schemes\Apps' -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -eq '.Current' } | Select-Object -First 200 | ForEach-Object {
        $wav = (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).'(default)'
        if ($wav -and $wav -ne '' -and $wav -match '\\' -and -not (Test-Path $wav -ErrorAction SilentlyContinue)) {
            $issues += [PSCustomObject]@{
                id = "snd_$idx"
                category = "sound_event"
                path = $_.PSPath -replace 'Microsoft.PowerShell.Core\\Registry::', ''
                name = (Split-Path $wav -Leaf)
                description = "사운드 이벤트 파일이 존재하지 않음"
                severity = "low"
            }
            $idx++
        }
    }
} catch {}
}

# 12. Start menu order - orphaned entries
if ($cats -contains 'start_menu') {
try {
    $smPath = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartPage2'
    if (Test-Path $smPath) {
        $props = Get-ItemProperty $smPath -ErrorAction SilentlyContinue
        if ($props) {
            $props.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' -and $_.Name -match 'ProgramsCache' } | ForEach-Object {
                $issues += [PSCustomObject]@{
                    id = "smenu_$idx"
                    category = "start_menu"
                    path = $smPath
                    name = $_.Name
                    description = "시작 메뉴 캐시 항목"
                    severity = "low"
                }
                $idx++
            }
        }
    }
} catch {}
}

if ($issues.Count -eq 0) {
    '{"issues":[],"total_count":0}'
} else {
    $issues | ConvertTo-Json -Compress
}
"#;

    let output = powershell_no_window()
        .args(["-Command", &ps_script])
        .output()
        .map_err(|e| format!("PowerShell 실행 실패: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("스캔 오류: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        return Ok(RegistryScanResult {
            issues: Vec::new(),
            total_count: 0,
        });
    }

    // Check if the output is our pre-formatted result
    if stdout.starts_with("{\"issues") {
        return Ok(RegistryScanResult {
            issues: Vec::new(),
            total_count: 0,
        });
    }

    let issues: Vec<RegistryIssue> = if stdout.starts_with('[') {
        serde_json::from_str(&stdout)
            .map_err(|e| format!("JSON 파싱 오류: {}", e))?
    } else {
        let single: RegistryIssue = serde_json::from_str(&stdout)
            .map_err(|e| format!("JSON 파싱 오류: {}", e))?;
        vec![single]
    };

    let total = issues.len();
    Ok(RegistryScanResult {
        issues,
        total_count: total,
    })
}

#[tauri::command]
pub fn fix_registry_issues(issue_ids: Vec<String>, issues_json: String) -> Result<RegistryFixResult, String> {
    let all_issues: Vec<RegistryIssue> = serde_json::from_str(&issues_json)
        .map_err(|e| format!("JSON 파싱 오류: {}", e))?;

    let to_fix: Vec<&RegistryIssue> = all_issues
        .iter()
        .filter(|i| issue_ids.contains(&i.id))
        .collect();

    let mut fixed = 0usize;
    let mut failed = 0usize;
    let mut failed_items: Vec<FailedItem> = Vec::new();

    for issue in &to_fix {
        let ps_cmd = match issue.category.as_str() {
            "shared_dll" | "startup" | "mui_cache" => {
                format!(
                    "Remove-ItemProperty -Path '{}' -Name '{}' -ErrorAction Stop",
                    issue.path, issue.name
                )
            }
            "file_extension" => {
                // Clear the dangling default value for the file extension
                let ext_name = issue.name.split(" -> ").next().unwrap_or(&issue.name);
                format!(
                    "Set-ItemProperty -Path 'Registry::HKEY_CLASSES_ROOT\\{}' -Name '(default)' -Value '' -ErrorAction Stop",
                    ext_name.trim_start_matches('.')
                )
            }
            "uninstall" | "app_path" => {
                format!(
                    "Remove-Item -Path 'Registry::{}' -Recurse -Force -ErrorAction Stop",
                    issue.path
                )
            }
            _ => {
                failed += 1;
                failed_items.push(FailedItem {
                    name: issue.name.clone(),
                    reason: format!("지원하지 않는 카테고리: {}", issue.category),
                });
                continue;
            }
        };

        let output = powershell_no_window()
            .args(["-Command", &ps_cmd])
            .output();

        match output {
            Ok(out) if out.status.success() => fixed += 1,
            Ok(out) => {
                failed += 1;
                let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
                let reason = if stderr.contains("Access") || stderr.contains("denied") {
                    "관리자 권한이 필요합니다".to_string()
                } else if stderr.is_empty() {
                    "알 수 없는 오류".to_string()
                } else {
                    stderr.lines().next().unwrap_or("오류").to_string()
                };
                failed_items.push(FailedItem {
                    name: issue.name.clone(),
                    reason,
                });
            }
            Err(e) => {
                failed += 1;
                failed_items.push(FailedItem {
                    name: issue.name.clone(),
                    reason: format!("실행 실패: {}", e),
                });
            }
        }
    }

    Ok(RegistryFixResult {
        fixed_count: fixed,
        failed_count: failed,
        failed_items,
    })
}

#[tauri::command]
pub fn create_restore_point() -> Result<String, String> {
    let ps = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {
    Checkpoint-Computer -Description 'PC Bareun 레지스트리 정리 백업' -RestorePointType 'MODIFY_SETTINGS' -ErrorAction Stop
    Write-Output 'ok'
} catch {
    Write-Output "fail:$($_.Exception.Message)"
}
"#;
    let output = powershell_no_window()
        .args(["-Command", ps])
        .output()
        .map_err(|e| format!("PowerShell 실행 실패: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout == "ok" {
        Ok("복원 지점이 생성되었습니다.".to_string())
    } else if stdout.starts_with("fail:") {
        Err(format!("복원 지점 생성 실패: {}", &stdout[5..]))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(format!("복원 지점 생성 실패: {}", stderr))
    }
}
