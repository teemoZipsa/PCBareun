use serde::{Serialize, Deserialize};
use crate::utils::cmd::powershell_no_window;

// ── AI 모델 파일 스캔 결과 ──

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct AiModelFile {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub size_display: String,
    pub extension: String,
    pub last_modified: String,
}

#[derive(Serialize)]
pub struct AiModelScanResult {
    pub files: Vec<AiModelFile>,
    pub total_size_bytes: u64,
    pub total_count: usize,
}

// ── Ollama 모델 ──

#[derive(Serialize, Deserialize, Clone)]
pub struct OllamaModel {
    pub name: String,
    pub size_display: String,
    pub size_bytes: u64,
    pub modified: String,
}

#[derive(Serialize, Deserialize)]
pub struct OllamaScanResult {
    pub installed: bool,
    pub models: Vec<OllamaModel>,
    pub total_size_bytes: u64,
}

// ── API Key/토큰 노출 ──

#[derive(Serialize, Deserialize, Clone)]
pub struct ExposedSecret {
    pub file_path: String,
    pub secret_type: String,
    pub line_number: usize,
    pub preview: String, // 마스킹된 미리보기
    pub risk_level: String, // high, medium, low
}

#[derive(Serialize, Deserialize)]
pub struct SecretScanResult {
    pub secrets: Vec<ExposedSecret>,
    pub total_count: usize,
    pub files_scanned: usize,
}

// ════════════════════════════════════════════════════
//  Commands
// ════════════════════════════════════════════════════

#[tauri::command]
pub fn scan_ai_models() -> Result<AiModelScanResult, String> {
    let ps = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Extensions that are almost certainly AI/ML models
$mlExtensions = @('*.gguf','*.safetensors','*.ckpt','*.onnx')

# Extensions that COULD be AI models but also common in games/apps
$ambiguousExtensions = @('*.bin','*.pt','*.pth')

# Directories where ambiguous extensions likely ARE AI models
$mlDirKeywords = @(
    'huggingface','transformers','models','llm','lora','stable-diffusion',
    'comfyui','automatic1111','webui','diffusers','ollama','lm-studio',
    'lmstudio','text-generation','gpt','llama','mistral','ggml',
    'checkpoints','embeddings','kohya','civitai','.cache\huggingface',
    'torch','pytorch','tensorflow','keras'
)

# Directories to always skip (games, programs, system, etc)
$skipDirPatterns = @(
    'steamapps','steam','origin','epic games','ea games','ubisoft',
    'program files','program files (x86)','windows','$recycle.bin',
    'system volume information','programdata\microsoft',
    'sims','electronic arts','riot games','battle.net','blizzard',
    'gog galaxy','xbox','playstation','game','games'
)

$searchPaths = @(
    $env:USERPROFILE,
    'D:\', 'E:\', 'F:\', 'G:\', 'H:\'
)
$results = @()

foreach ($root in $searchPaths) {
    if (-not (Test-Path $root)) { continue }

    # 1) ML-specific extensions: scan broadly (these are almost always ML files)
    foreach ($ext in $mlExtensions) {
        try {
            $files = Get-ChildItem $root -Filter $ext -Recurse -File -ErrorAction SilentlyContinue -Depth 6 |
                Where-Object {
                    $_.Length -gt 50MB -and
                    -not ($skipDirPatterns | Where-Object { $_.FullName -imatch [regex]::Escape($_) })
                }
            foreach ($f in $files) {
                # double-check skip
                $skip = $false
                foreach ($sp in $skipDirPatterns) {
                    if ($f.FullName -imatch [regex]::Escape($sp)) { $skip = $true; break }
                }
                if ($skip) { continue }

                $sizeGB = [math]::Round($f.Length / 1GB, 2)
                $sizeMB = [math]::Round($f.Length / 1MB, 1)
                $display = if ($sizeGB -ge 1) { "${sizeGB} GB" } else { "${sizeMB} MB" }
                $results += [PSCustomObject]@{
                    path = $f.FullName
                    name = $f.Name
                    size_bytes = $f.Length
                    size_display = $display
                    extension = $f.Extension.ToLower()
                    last_modified = $f.LastWriteTime.ToString('yyyy-MM-dd')
                }
            }
        } catch {}
    }

    # 2) Ambiguous extensions: only if path contains ML-related keywords
    foreach ($ext in $ambiguousExtensions) {
        try {
            $files = Get-ChildItem $root -Filter $ext -Recurse -File -ErrorAction SilentlyContinue -Depth 6 |
                Where-Object { $_.Length -gt 100MB }
            foreach ($f in $files) {
                $pathLower = $f.FullName.ToLower()

                # Skip game/system directories
                $skip = $false
                foreach ($sp in $skipDirPatterns) {
                    if ($pathLower -like "*$sp*") { $skip = $true; break }
                }
                if ($skip) { continue }

                # Only include if path contains ML-related directory
                $isML = $false
                foreach ($kw in $mlDirKeywords) {
                    if ($pathLower -like "*$kw*") { $isML = $true; break }
                }
                if (-not $isML) { continue }

                $sizeGB = [math]::Round($f.Length / 1GB, 2)
                $sizeMB = [math]::Round($f.Length / 1MB, 1)
                $display = if ($sizeGB -ge 1) { "${sizeGB} GB" } else { "${sizeMB} MB" }
                $results += [PSCustomObject]@{
                    path = $f.FullName
                    name = $f.Name
                    size_bytes = $f.Length
                    size_display = $display
                    extension = $f.Extension.ToLower()
                    last_modified = $f.LastWriteTime.ToString('yyyy-MM-dd')
                }
            }
        } catch {}
    }
}
$results | ConvertTo-Json -Compress
"#;

    let output = powershell_no_window()
        .args(["-Command", ps])
        .output()
        .map_err(|e| format!("PowerShell 실행 실패: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() || stdout == "null" {
        return Ok(AiModelScanResult { files: vec![], total_size_bytes: 0, total_count: 0 });
    }

    let files: Vec<AiModelFile> = if stdout.starts_with('[') {
        serde_json::from_str(&stdout).unwrap_or_default()
    } else {
        match serde_json::from_str::<AiModelFile>(&stdout) {
            Ok(f) => vec![f],
            Err(_) => vec![],
        }
    };

    let total_size = files.iter().map(|f| f.size_bytes).sum();
    let total_count = files.len();
    Ok(AiModelScanResult { files, total_size_bytes: total_size, total_count })
}

#[tauri::command]
pub fn delete_ai_model(path: String) -> Result<String, String> {
    let ps = format!(
        "Remove-Item '{}' -Force -ErrorAction Stop; 'ok'",
        path.replace("'", "''")
    );
    let output = powershell_no_window()
        .args(["-Command", &ps])
        .output()
        .map_err(|e| format!("삭제 실패: {}", e))?;

    if output.status.success() {
        Ok("삭제 완료".to_string())
    } else {
        Err("파일 삭제 실패 (사용 중이거나 권한 부족)".to_string())
    }
}

#[tauri::command]
pub fn scan_ollama_models() -> Result<OllamaScanResult, String> {
    let ps = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
# 먼저 ollama가 설치됐는지 빠르게 확인
$ollamaCmd = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollamaCmd) {
    Write-Output '{"installed":false,"models":[],"total_size_bytes":0}'
    exit
}
# 타임아웃 5초로 ollama list 실행
try {
    $pinfo = New-Object System.Diagnostics.ProcessStartInfo
    $pinfo.FileName = 'ollama'
    $pinfo.Arguments = 'list'
    $pinfo.RedirectStandardOutput = $true
    $pinfo.RedirectStandardError = $true
    $pinfo.UseShellExecute = $false
    $pinfo.CreateNoWindow = $true
    $proc = [System.Diagnostics.Process]::Start($pinfo)
    if (-not $proc.WaitForExit(5000)) {
        $proc.Kill()
        Write-Output '{"installed":true,"models":[],"total_size_bytes":0}'
        exit
    }
    $list = $proc.StandardOutput.ReadToEnd()
    if (-not $list) {
        Write-Output '{"installed":true,"models":[],"total_size_bytes":0}'
        exit
    }
    $models = @()
    $totalSize = 0
    $lines = $list -split "`n" | Select-Object -Skip 1
    foreach ($line in $lines) {
        $line = $line.Trim()
        if (-not $line) { continue }
        $parts = $line -split '\s{2,}'
        if ($parts.Length -ge 3) {
            $name = $parts[0]
            $sizeStr = $parts[2]
            $sizeBytes = 0
            if ($sizeStr -match '([\d.]+)\s*GB') { $sizeBytes = [long]([double]$Matches[1] * 1GB) }
            elseif ($sizeStr -match '([\d.]+)\s*MB') { $sizeBytes = [long]([double]$Matches[1] * 1MB) }
            $totalSize += $sizeBytes
            $models += [PSCustomObject]@{
                name = $name
                size_display = $sizeStr
                size_bytes = $sizeBytes
                modified = if ($parts.Length -ge 4) { $parts[3] } else { '' }
            }
        }
    }
    [PSCustomObject]@{
        installed = $true
        models = $models
        total_size_bytes = $totalSize
    } | ConvertTo-Json -Compress -Depth 3
} catch {
    Write-Output '{"installed":false,"models":[],"total_size_bytes":0}'
}
"#;

    let output = powershell_no_window()
        .args(["-Command", ps])
        .output()
        .map_err(|e| format!("PowerShell 실행 실패: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(serde_json::from_str(&stdout).unwrap_or(OllamaScanResult {
        installed: false,
        models: vec![],
        total_size_bytes: 0,
    }))
}

#[tauri::command]
pub fn delete_ollama_model(name: String) -> Result<String, String> {
    let ps = format!("ollama rm '{}' 2>&1; 'ok'", name.replace("'", "''"));
    let output = powershell_no_window()
        .args(["-Command", &ps])
        .output()
        .map_err(|e| format!("삭제 실패: {}", e))?;

    if output.status.success() {
        Ok(format!("Ollama 모델 '{}' 삭제 완료", name))
    } else {
        Err("모델 삭제 실패".to_string())
    }
}

#[tauri::command]
pub fn scan_exposed_secrets() -> Result<SecretScanResult, String> {
    let ps = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$patterns = @(
    @{ name='OpenAI API Key'; regex='sk-[a-zA-Z0-9]{20,}'; risk='high' },
    @{ name='Anthropic/Claude API Key'; regex='sk-ant-[a-zA-Z0-9\-]{20,}'; risk='high' },
    @{ name='AWS Access Key'; regex='AKIA[0-9A-Z]{16}'; risk='high' },
    @{ name='GitHub Token'; regex='gh[ps]_[A-Za-z0-9_]{36,}'; risk='high' },
    @{ name='GitHub OAuth Token'; regex='gho_[A-Za-z0-9_]{36,}'; risk='medium' },
    @{ name='Slack Token'; regex='xox[bprs]-[0-9A-Za-z\-]{10,}'; risk='high' },
    @{ name='Discord Bot Token'; regex='[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27,}'; risk='high' },
    @{ name='Google API Key'; regex='AIza[0-9A-Za-z\-_]{35}'; risk='high' },
    @{ name='HuggingFace Token'; regex='hf_[a-zA-Z0-9]{20,}'; risk='medium' },
    @{ name='Telegram Bot Token'; regex='\d{8,10}:[A-Za-z0-9_-]{35}'; risk='medium' },
    @{ name='Supabase Key'; regex='eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}'; risk='medium' },
    @{ name='Generic Secret/Token'; regex='(?i)(api[_-]?key|api[_-]?secret|access[_-]?token|auth[_-]?token|secret[_-]?key)\s*[=:]\s*[''"]?[A-Za-z0-9\-_]{16,}'; risk='medium' }
)

$searchPaths = @(
    "$env:USERPROFILE\Desktop",
    "$env:USERPROFILE\Documents",
    "$env:USERPROFILE\Downloads",
    "$env:USERPROFILE\Projects",
    "$env:USERPROFILE\.config"
)
$textExts = @('*.txt','*.md','*.env','*.json','*.yaml','*.yml','*.toml','*.ini','*.cfg','*.conf','*.py','*.js','*.ts','*.sh','*.bat','*.ps1','*.log')

$results = @()
$filesScanned = 0
foreach ($root in $searchPaths) {
    if (-not (Test-Path $root)) { continue }
    foreach ($ext in $textExts) {
        try {
            $files = Get-ChildItem $root -Filter $ext -Recurse -File -ErrorAction SilentlyContinue -Depth 5 |
                Where-Object { $_.Length -lt 5MB -and $_.FullName -notmatch 'node_modules|\.git|venv|__pycache__|\.cache' }
            foreach ($f in $files) {
                $filesScanned++
                try {
                    $lines = Get-Content $f.FullName -TotalCount 500 -ErrorAction SilentlyContinue
                    $lineNum = 0
                    foreach ($line in $lines) {
                        $lineNum++
                        foreach ($p in $patterns) {
                            if ($line -match $p.regex) {
                                $matched = $Matches[0]
                                $masked = $matched.Substring(0, [Math]::Min(8, $matched.Length)) + '***' + $matched.Substring([Math]::Max(0, $matched.Length - 4))
                                $results += [PSCustomObject]@{
                                    file_path = $f.FullName
                                    secret_type = $p.name
                                    line_number = $lineNum
                                    preview = $masked
                                    risk_level = $p.risk
                                }
                                break
                            }
                        }
                    }
                } catch {}
            }
        } catch {}
    }
}

[PSCustomObject]@{
    secrets = $results
    total_count = $results.Count
    files_scanned = $filesScanned
} | ConvertTo-Json -Compress -Depth 3
"#;

    let output = powershell_no_window()
        .args(["-Command", ps])
        .output()
        .map_err(|e| format!("PowerShell 실행 실패: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        return Ok(SecretScanResult { secrets: vec![], total_count: 0, files_scanned: 0 });
    }

    serde_json::from_str(&stdout)
        .map_err(|e| format!("JSON 파싱 오류: {}", e))
}
