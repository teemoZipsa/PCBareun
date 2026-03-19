use serde::{Serialize, Deserialize};
use crate::utils::cmd::powershell_no_window;

#[derive(Serialize, Deserialize, Clone)]
pub struct PathEntry {
    pub path: String,
    pub exists: bool,
    pub scope: String,          // "User" or "System"
    pub duplicate: bool,
    pub conflict_tool: String,  // e.g. "Python" if multiple python versions found
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DevToolInfo {
    pub name: String,
    pub found: bool,
    pub version: String,
    pub path: String,
    pub conflict: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AiCacheInfo {
    pub name: String,
    pub env_var: String,
    pub current_path: String,
    pub size_bytes: u64,
    pub exists: bool,
}

#[tauri::command]
pub fn get_path_entries() -> Result<Vec<PathEntry>, String> {
    let ps_script = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$results = @()
$allPaths = @()

# System PATH
$sysPath = [Environment]::GetEnvironmentVariable('PATH', 'Machine')
if ($sysPath) {
    foreach ($p in ($sysPath -split ';')) {
        $p = $p.Trim()
        if ($p -eq '') { continue }
        $allPaths += @{ path = $p; scope = 'System' }
    }
}

# User PATH
$userPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
if ($userPath) {
    foreach ($p in ($userPath -split ';')) {
        $p = $p.Trim()
        if ($p -eq '') { continue }
        $allPaths += @{ path = $p; scope = 'User' }
    }
}

# Detect duplicates and conflicts
$seenPaths = @{}
$toolPatterns = @{
    'Python' = @('python.exe', 'python3.exe', 'python3\d+.exe')
    'Node.js' = @('node.exe')
    'Git' = @('git.exe')
    'CUDA' = @('nvcc.exe')
    'Java' = @('java.exe')
}
$toolPaths = @{}

foreach ($entry in $allPaths) {
    $p = $entry.path
    $normalizedP = $p.ToLower().TrimEnd('\')
    $isDup = $seenPaths.ContainsKey($normalizedP)
    $seenPaths[$normalizedP] = $true

    $conflictTool = ''
    foreach ($tool in $toolPatterns.Keys) {
        foreach ($exe in $toolPatterns[$tool]) {
            $exePath = Join-Path $p $exe
            if (Test-Path $exePath -ErrorAction SilentlyContinue) {
                if ($toolPaths.ContainsKey($tool)) {
                    $conflictTool = $tool
                } else {
                    $toolPaths[$tool] = $p
                }
                break
            }
        }
    }

    $results += [PSCustomObject]@{
        path = $p
        exists = (Test-Path $p -ErrorAction SilentlyContinue)
        scope = $entry.scope
        duplicate = $isDup
        conflict_tool = $conflictTool
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
        match serde_json::from_str::<PathEntry>(&stdout) {
            Ok(item) => Ok(vec![item]),
            Err(e) => Err(format!("JSON 파싱 오류: {}", e)),
        }
    }
}

#[tauri::command]
pub fn get_dev_tool_versions() -> Result<Vec<DevToolInfo>, String> {
    let ps_script = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$tools = @()

function Test-Tool($name, $cmd) {
    try {
        $ver = & $cmd 2>&1 | Select-Object -First 1
        $p = (Get-Command $cmd -ErrorAction SilentlyContinue).Source
        return [PSCustomObject]@{ name = $name; found = $true; version = "$ver"; path = "$p"; conflict = '' }
    } catch {
        return [PSCustomObject]@{ name = $name; found = $false; version = ''; path = ''; conflict = '' }
    }
}

$tools += Test-Tool 'Python' 'python'
$tools += Test-Tool 'Node.js' 'node'
$tools += Test-Tool 'npm' 'npm'
$tools += Test-Tool 'Git' 'git'
$tools += Test-Tool 'CUDA (nvcc)' 'nvcc'
$tools += Test-Tool 'Java' 'java'
$tools += Test-Tool 'Rust (rustc)' 'rustc'
$tools += Test-Tool 'Go' 'go'
$tools += Test-Tool 'Docker' 'docker'

# Check for python version conflicts
$pythons = @()
$pyPaths = $env:PATH -split ';' | Where-Object { Test-Path (Join-Path $_ 'python.exe') -ErrorAction SilentlyContinue }
foreach ($pp in $pyPaths) {
    try {
        $v = & (Join-Path $pp 'python.exe') '--version' 2>&1
        $pythons += "$v ($pp)"
    } catch {}
}
if ($pythons.Count -gt 1) {
    $conflict = "PATH에 $($pythons.Count)개의 Python 발견: " + ($pythons -join ' / ')
    $tools | Where-Object { $_.name -eq 'Python' } | ForEach-Object { $_.conflict = $conflict }
}

if ($tools.Count -eq 0) { '[]' } else { $tools | ConvertTo-Json -Compress }
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
        match serde_json::from_str::<DevToolInfo>(&stdout) {
            Ok(item) => Ok(vec![item]),
            Err(e) => Err(format!("JSON 파싱 오류: {}", e)),
        }
    }
}

#[tauri::command]
pub fn get_ai_cache_info() -> Result<Vec<AiCacheInfo>, String> {
    let ps_script = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$caches = @(
    @{ name = 'HuggingFace Hub Cache'; env_var = 'HUGGINGFACE_HUB_CACHE'; default_path = "$env:USERPROFILE\.cache\huggingface\hub" },
    @{ name = 'HuggingFace Cache (Legacy)'; env_var = 'TRANSFORMERS_CACHE'; default_path = "$env:USERPROFILE\.cache\huggingface\transformers" },
    @{ name = 'PyTorch Hub Cache'; env_var = 'TORCH_HOME'; default_path = "$env:USERPROFILE\.cache\torch" },
    @{ name = 'Ollama Models'; env_var = 'OLLAMA_MODELS'; default_path = "$env:USERPROFILE\.ollama\models" },
    @{ name = 'Pip Cache'; env_var = 'PIP_CACHE_DIR'; default_path = "$env:LOCALAPPDATA\pip\Cache" }
)

$results = @()
foreach ($c in $caches) {
    $envVal = [Environment]::GetEnvironmentVariable($c.env_var, 'User')
    if (-not $envVal) { $envVal = [Environment]::GetEnvironmentVariable($c.env_var, 'Machine') }
    $actualPath = if ($envVal) { $envVal } else { $c.default_path }
    $size = 0
    $pathExists = $false
    if (Test-Path $actualPath -ErrorAction SilentlyContinue) {
        $pathExists = $true
        try {
            $size = (Get-ChildItem $actualPath -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum -ErrorAction SilentlyContinue).Sum
            if (-not $size) { $size = 0 }
        } catch {}
    }
    $results += [PSCustomObject]@{
        name = $c.name
        env_var = $c.env_var
        current_path = $actualPath
        size_bytes = [long]$size
        exists = $pathExists
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
        match serde_json::from_str::<AiCacheInfo>(&stdout) {
            Ok(item) => Ok(vec![item]),
            Err(e) => Err(format!("JSON 파싱 오류: {}", e)),
        }
    }
}

#[tauri::command]
pub fn relocate_ai_cache(env_var: String, target_path: String) -> Result<String, String> {
    // Get current path
    let ps_get = format!(
        r#"
$envVal = [Environment]::GetEnvironmentVariable('{}', 'User')
if (-not $envVal) {{ $envVal = [Environment]::GetEnvironmentVariable('{}', 'Machine') }}
$envVal
"#, env_var, env_var
    );
    let out = powershell_no_window()
        .args(["-Command", &ps_get])
        .output()
        .map_err(|e| format!("PowerShell 실행 실패: {}", e))?;
    let current = String::from_utf8_lossy(&out.stdout).trim().to_string();

    let ps_script = format!(r#"
$source = '{source}'
$target = '{target}'
$envVar = '{env_var}'

# Create target directory
if (-not (Test-Path $target)) {{ New-Item -ItemType Directory -Path $target -Force | Out-Null }}

# Copy existing data if source exists and has files
if (Test-Path $source) {{
    $items = Get-ChildItem $source -ErrorAction SilentlyContinue
    if ($items.Count -gt 0) {{
        Copy-Item "$source\*" $target -Recurse -Force -ErrorAction SilentlyContinue
    }}
    # Remove original and create junction
    try {{
        Remove-Item $source -Recurse -Force -ErrorAction Stop
        cmd /c mklink /J "$source" "$target" 2>&1 | Out-Null
    }} catch {{
        # If can't remove (in use), just set env var
    }}
}}

# Set environment variable
[Environment]::SetEnvironmentVariable($envVar, $target, 'User')
'ok'
"#,
        source = if current.is_empty() { "".to_string() } else { current },
        target = target_path,
        env_var = env_var
    );

    let output = powershell_no_window()
        .args(["-Command", &ps_script])
        .output()
        .map_err(|e| format!("PowerShell 실행 실패: {}", e))?;

    if output.status.success() {
        Ok(format!("{} 캐시를 {}(으)로 이동했습니다.", env_var, target_path))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(format!("이동 실패: {}", stderr))
    }
}
