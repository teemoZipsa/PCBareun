use serde::{Serialize, Deserialize};
use crate::utils::cmd::powershell_no_window;

#[derive(Serialize, Deserialize, Clone)]
pub struct TempCategory {
    pub id: String,
    pub name: String,
    pub description: String,
    pub file_count: u64,
    pub total_size_bytes: u64,
    pub path: String,
}

#[derive(Serialize)]
pub struct TempScanResult {
    pub categories: Vec<TempCategory>,
    pub total_size_bytes: u64,
    pub total_files: u64,
}

#[tauri::command]
pub fn scan_temp_files() -> Result<TempScanResult, String> {
    let ps_script = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$categories = @()

function Get-DirStats($path) {
    $count = 0
    $size = 0
    if (Test-Path $path) {
        try {
            $files = Get-ChildItem $path -Recurse -File -ErrorAction SilentlyContinue
            foreach ($f in $files) {
                try {
                    $stream = [System.IO.File]::OpenWrite($f.FullName)
                    $stream.Close()
                    $count++
                    $size += $f.Length
                } catch {
                    # File is locked / in-use — skip it
                }
            }
        } catch {}
    }
    return @{ count = $count; size = [long]$size }
}

# 1. User Temp
$p = $env:TEMP
$stats = Get-DirStats $p
$categories += [PSCustomObject]@{
    id = 'user_temp'
    name = '사용자 임시 파일'
    description = '응용프로그램이 생성한 임시 파일'
    file_count = $stats.count
    total_size_bytes = $stats.size
    path = $p
}

# 2. Windows Temp
$p = 'C:\Windows\Temp'
$stats = Get-DirStats $p
$categories += [PSCustomObject]@{
    id = 'win_temp'
    name = 'Windows 임시 파일'
    description = 'Windows 시스템 임시 파일'
    file_count = $stats.count
    total_size_bytes = $stats.size
    path = $p
}

# 3. Thumbnail Cache
$p = "$env:LOCALAPPDATA\Microsoft\Windows\Explorer"
$count = 0; $size = 0
if (Test-Path $p) {
    try {
        $thumbFiles = Get-ChildItem $p -File -Filter 'thumbcache_*' -ErrorAction SilentlyContinue
        $count = ($thumbFiles | Measure-Object).Count
        $size = ($thumbFiles | Measure-Object -Property Length -Sum -ErrorAction SilentlyContinue).Sum
        if (-not $size) { $size = 0 }
    } catch {}
}
$categories += [PSCustomObject]@{
    id = 'thumbnail_cache'
    name = '썸네일 캐시'
    description = '파일 탐색기 썸네일 미리보기 캐시'
    file_count = $count
    total_size_bytes = [long]$size
    path = $p
}

# 4. Windows Update Cache
$p = 'C:\Windows\SoftwareDistribution\Download'
$stats = Get-DirStats $p
$categories += [PSCustomObject]@{
    id = 'update_cache'
    name = 'Windows 업데이트 캐시'
    description = '이전 Windows 업데이트 다운로드 파일'
    file_count = $stats.count
    total_size_bytes = $stats.size
    path = $p
}

# 5. Crash Dumps
$p = "$env:LOCALAPPDATA\CrashDumps"
$stats = Get-DirStats $p
$categories += [PSCustomObject]@{
    id = 'crash_dumps'
    name = '크래시 덤프'
    description = '프로그램 충돌 시 생성된 덤프 파일'
    file_count = $stats.count
    total_size_bytes = $stats.size
    path = $p
}

# 6. Windows Logs
$p = 'C:\Windows\Logs'
$stats = Get-DirStats $p
$categories += [PSCustomObject]@{
    id = 'win_logs'
    name = 'Windows 로그'
    description = '시스템 및 설치 로그 파일'
    file_count = $stats.count
    total_size_bytes = $stats.size
    path = $p
}

# 7. Prefetch
$p = 'C:\Windows\Prefetch'
$stats = Get-DirStats $p
$categories += [PSCustomObject]@{
    id = 'prefetch'
    name = '프리페치 캐시'
    description = '프로그램 실행 속도 최적화 캐시 (❗삭제 시 초기 실행 다소 느려질 수 있음, 자동 재생성)'
    file_count = $stats.count
    total_size_bytes = $stats.size
    path = $p
}

# 8. Recycle Bin
$rbSize = 0
$rbCount = 0
try {
    $shell = New-Object -ComObject Shell.Application
    $rb = $shell.Namespace(10)
    $rbCount = $rb.Items().Count
    foreach ($item in $rb.Items()) {
        $rbSize += $item.Size
    }
} catch {}
$categories += [PSCustomObject]@{
    id = 'recycle_bin'
    name = '휴지통'
    description = '삭제된 파일이 보관된 휴지통 (⚠️ 비우면 복구 불가)'
    file_count = $rbCount
    total_size_bytes = [long]$rbSize
    path = 'Recycle Bin'
}

# 9. DNS Cache
$categories += [PSCustomObject]@{
    id = 'dns_cache'
    name = 'DNS 캐시'
    description = 'DNS 조회 캐시 초기화 (인터넷 연결 문제 시 유용)'
    file_count = 1
    total_size_bytes = 0
    path = 'DNS Cache (ipconfig /flushdns)'
}

# 10. DirectX Shader Cache
$p = "$env:LOCALAPPDATA\D3DSCache"
$stats = Get-DirStats $p
$categories += [PSCustomObject]@{
    id = 'shader_cache'
    name = 'DirectX 셰이더 캐시'
    description = '그래픽 캐시 파일 (❗기존 캐시 꼬이면 게임 프레임 드랍 발생 가능, 자동 재생성)'
    file_count = $stats.count
    total_size_bytes = $stats.size
    path = $p
}

# 11. Clipboard
$categories += [PSCustomObject]@{
    id = 'clipboard'
    name = '클립보드 데이터'
    description = '복사해 둔 텍스트/이미지 비우기 (메모리 확보)'
    file_count = 1
    total_size_bytes = 0
    path = 'Clipboard'
}

# ── 개발 / AI 캐시 정리 ──

# 12. pip cache
$p = "$env:LOCALAPPDATA\pip\Cache"
$stats = Get-DirStats $p
$categories += [PSCustomObject]@{
    id = 'pip_cache'
    name = 'Python pip 캐시'
    description = 'pip install 시 쌓이는 패키지 캐시 (삭제해도 pip install 시 자동 다시 다운로드)'
    file_count = $stats.count
    total_size_bytes = $stats.size
    path = $p
}

# 13. npm cache
$npmCache = "$env:APPDATA\npm-cache"
$stats = Get-DirStats $npmCache
$categories += [PSCustomObject]@{
    id = 'npm_cache'
    name = 'Node.js npm 캐시'
    description = 'npm install 시 쌓이는 패키지 캐시 (삭제해도 npm install 시 자동 다시 다운로드)'
    file_count = $stats.count
    total_size_bytes = $stats.size
    path = $npmCache
}

# 14. Docker (설치된 경우만)
$dockerSize = 0
$dockerCount = 0
try {
    $dockerInfo = docker system df --format '{{json .}}' 2>$null | ConvertFrom-Json
    if ($dockerInfo) {
        foreach ($item in $dockerInfo) {
            if ($item.Reclaimable) {
                $recl = $item.Reclaimable -replace '[^0-9.]',''
                if ($recl) { $dockerSize += [long]([double]$recl * 1MB) }
            }
        }
        $dockerCount = 1
    }
} catch {}
if ($dockerCount -gt 0) {
    $categories += [PSCustomObject]@{
        id = 'docker_prune'
        name = 'Docker 정리'
        description = '미사용 Docker 이미지, 중지된 컨테이너, 빌드 캐시 삭제 (⚠️ 실행 중인 컨테이너는 영향 없음)'
        file_count = $dockerCount
        total_size_bytes = $dockerSize
        path = 'Docker System'
    }
}

# 15. 방치된 node_modules (6개월 이상 미사용)
$nmTotal = 0; $nmCount = 0; $nmPaths = @()
$searchRoots = @("$env:USERPROFILE\Desktop","$env:USERPROFILE\Documents","$env:USERPROFILE\Downloads","$env:USERPROFILE\Projects")
foreach ($root in $searchRoots) {
    if (Test-Path $root) {
        $found = Get-ChildItem $root -Directory -Filter 'node_modules' -Recurse -Depth 4 -ErrorAction SilentlyContinue
        foreach ($nm in $found) {
            try {
                $parent = $nm.Parent.FullName
                $lastMod = (Get-Item $parent -ErrorAction SilentlyContinue).LastWriteTime
                if ($lastMod -lt (Get-Date).AddMonths(-6)) {
                    $sz = (Get-ChildItem $nm.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum -ErrorAction SilentlyContinue).Sum
                    if (-not $sz) { $sz = 0 }
                    $nmTotal += [long]$sz
                    $nmCount++
                    $nmPaths += $nm.FullName
                }
            } catch {}
        }
    }
}
if ($nmCount -gt 0) {
    $categories += [PSCustomObject]@{
        id = 'zombie_node_modules'
        name = '방치된 node_modules'
        description = "⚠️ 6개월 이상 사용하지 않은 프로젝트의 node_modules ($nmCount개 발견). 삭제해도 npm install로 복구 가능"
        file_count = $nmCount
        total_size_bytes = $nmTotal
        path = ($nmPaths -join ';')
    }
}

# 16. 방치된 Python venv (6개월 이상)
$venvTotal = 0; $venvCount = 0; $venvPaths = @()
foreach ($root in $searchRoots) {
    if (Test-Path $root) {
        # venv / .venv 폴더 찾기
        $found = Get-ChildItem $root -Directory -Recurse -Depth 4 -ErrorAction SilentlyContinue | Where-Object {
            ($_.Name -eq 'venv' -or $_.Name -eq '.venv') -and (Test-Path (Join-Path $_.FullName 'pyvenv.cfg'))
        }
        foreach ($v in $found) {
            try {
                $lastMod = $v.LastWriteTime
                if ($lastMod -lt (Get-Date).AddMonths(-6)) {
                    $sz = (Get-ChildItem $v.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum -ErrorAction SilentlyContinue).Sum
                    if (-not $sz) { $sz = 0 }
                    $venvTotal += [long]$sz
                    $venvCount++
                    $venvPaths += $v.FullName
                }
            } catch {}
        }
    }
}
if ($venvCount -gt 0) {
    $categories += [PSCustomObject]@{
        id = 'zombie_venv'
        name = '방치된 Python 가상환경'
        description = "⚠️ 6개월 이상 사용하지 않은 프로젝트의 venv ($venvCount개 발견). pip install로 복구 가능"
        file_count = $venvCount
        total_size_bytes = $venvTotal
        path = ($venvPaths -join ';')
    }
}

# 17. Gradio 임시 캐시
$gradioPath = "$env:TEMP\gradio"
$stats = Get-DirStats $gradioPath
if ($stats.count -gt 0 -or $stats.size -gt 0) {
    $categories += [PSCustomObject]@{
        id = 'gradio_cache'
        name = 'AI 웹 UI 임시 캐시 (Gradio)'
        description = 'Gradio 등 AI 웹 UI가 생성한 이미지/음성 캐시. 수십 GB씩 쌓일 수 있습니다'
        file_count = $stats.count
        total_size_bytes = $stats.size
        path = $gradioPath
    }
}

# 18. HuggingFace 캐시
$hfPath = "$env:USERPROFILE\.cache\huggingface"
$stats = Get-DirStats $hfPath
if ($stats.count -gt 0 -or $stats.size -gt 0) {
    $categories += [PSCustomObject]@{
        id = 'huggingface_cache'
        name = 'HuggingFace AI 캐시'
        description = 'AI 모델 다운로드 캐시 (⚠️ 대용량 파일 포함. 삭제 후 필요 시 재다운로드 필요)'
        file_count = $stats.count
        total_size_bytes = $stats.size
        path = $hfPath
    }
}

$categories | ConvertTo-Json -Compress
"#;

    let output = powershell_no_window()
        .args(["-Command", ps_script])
        .output()
        .map_err(|e| format!("PowerShell 실행 실패: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() || stdout == "[]" {
        return Ok(TempScanResult {
            categories: Vec::new(),
            total_size_bytes: 0,
            total_files: 0,
        });
    }

    let categories: Vec<TempCategory> = if stdout.starts_with('[') {
        serde_json::from_str(&stdout).map_err(|e| format!("JSON 파싱 오류: {}", e))?
    } else {
        match serde_json::from_str::<TempCategory>(&stdout) {
            Ok(item) => vec![item],
            Err(e) => return Err(format!("JSON 파싱 오류: {}", e)),
        }
    };

    let total_size = categories.iter().map(|c| c.total_size_bytes).sum();
    let total_files = categories.iter().map(|c| c.file_count).sum();

    Ok(TempScanResult {
        categories,
        total_size_bytes: total_size,
        total_files,
    })
}

#[tauri::command]
pub fn clean_temp_files(category_ids: Vec<String>) -> Result<String, String> {
    let mut cleaned = 0u64;
    let mut errors: Vec<String> = Vec::new();

    for id in &category_ids {
        let ps_cmd = match id.as_str() {
            "user_temp" => {
                format!(
                    "Get-ChildItem '{}' -Recurse -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue; (Get-ChildItem '{}' -Recurse -Directory -ErrorAction SilentlyContinue | Sort-Object {{ $_.FullName.Length }} -Descending | Remove-Item -Force -ErrorAction SilentlyContinue); 'ok'",
                    std::env::var("TEMP").unwrap_or_default(),
                    std::env::var("TEMP").unwrap_or_default()
                )
            }
            "win_temp" => {
                "Get-ChildItem 'C:\\Windows\\Temp' -Recurse -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue; 'ok'".to_string()
            }
            "thumbnail_cache" => {
                format!(
                    "Get-ChildItem '{}\\Microsoft\\Windows\\Explorer' -File -Filter 'thumbcache_*' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue; 'ok'",
                    std::env::var("LOCALAPPDATA").unwrap_or_default()
                )
            }
            "update_cache" => {
                "Get-ChildItem 'C:\\Windows\\SoftwareDistribution\\Download' -Recurse -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue; 'ok'".to_string()
            }
            "crash_dumps" => {
                format!(
                    "Get-ChildItem '{}\\CrashDumps' -Recurse -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue; 'ok'",
                    std::env::var("LOCALAPPDATA").unwrap_or_default()
                )
            }
            "win_logs" => {
                "Get-ChildItem 'C:\\Windows\\Logs' -Recurse -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue; 'ok'".to_string()
            }
            "prefetch" => {
                "Get-ChildItem 'C:\\Windows\\Prefetch' -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue; 'ok'".to_string()
            }
            "recycle_bin" => {
                "Clear-RecycleBin -Force -ErrorAction SilentlyContinue; 'ok'".to_string()
            }
            "dns_cache" => {
                "ipconfig /flushdns | Out-Null; 'ok'".to_string()
            }
            "shader_cache" => {
                format!(
                    "Get-ChildItem '{}\\D3DSCache' -Recurse -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue; 'ok'",
                    std::env::var("LOCALAPPDATA").unwrap_or_default()
                )
            }
            "clipboard" => {
                "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::Clear(); 'ok'".to_string()
            }
            "pip_cache" => {
                format!(
                    "Get-ChildItem '{}\\pip\\Cache' -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue; 'ok'",
                    std::env::var("LOCALAPPDATA").unwrap_or_default()
                )
            }
            "npm_cache" => {
                format!(
                    "Get-ChildItem '{}\\npm-cache' -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue; 'ok'",
                    std::env::var("APPDATA").unwrap_or_default()
                )
            }
            "docker_prune" => {
                "docker system prune -af 2>$null; 'ok'".to_string()
            }
            "zombie_node_modules" | "zombie_venv" => {
                let filter = if id == "zombie_node_modules" { "node_modules" } else { "*venv" };
                let script = r#"
$roots = @("$env:USERPROFILE\Desktop","$env:USERPROFILE\Documents","$env:USERPROFILE\Downloads","$env:USERPROFILE\Projects")
foreach ($root in $roots) {
    if (Test-Path $root) {
        $dirs = Get-ChildItem $root -Directory -Filter '__FILTER__' -Recurse -Depth 4 -ErrorAction SilentlyContinue
        foreach ($d in $dirs) {
            if ($d.LastWriteTime -lt (Get-Date).AddMonths(-6)) {
                Remove-Item $d.FullName -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }
}
'ok'
"#.replace("__FILTER__", filter);
                script
            }
            "gradio_cache" => {
                format!(
                    "Get-ChildItem '{}\\gradio' -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue; 'ok'",
                    std::env::var("TEMP").unwrap_or_default()
                )
            }
            "huggingface_cache" => {
                format!(
                    "Get-ChildItem '{}\\.cache\\huggingface' -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue; 'ok'",
                    std::env::var("USERPROFILE").unwrap_or_default()
                )
            }
            _ => {
                errors.push(format!("알 수 없는 카테고리: {}", id));
                continue;
            }
        };

        let output = powershell_no_window()
            .args(["-Command", &ps_cmd])
            .output();

        match output {
            Ok(out) if out.status.success() => cleaned += 1,
            Ok(out) => {
                let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
                if stderr.contains("Access") || stderr.contains("denied") {
                    errors.push(format!("{}: 관리자 권한 필요", id));
                } else {
                    // Still count as cleaned since partial removal happens
                    cleaned += 1;
                }
            }
            Err(e) => errors.push(format!("{}: {}", id, e)),
        }
    }

    if errors.is_empty() {
        Ok(format!("{}개 카테고리 정리 완료!", cleaned))
    } else {
        Ok(format!(
            "{}개 정리 완료. ⚠️ {}개 항목에서 일부 파일을 삭제할 수 없었습니다 (사용 중이거나 권한 부족): {}",
            cleaned,
            errors.len(),
            errors.join(", ")
        ))
    }
}
