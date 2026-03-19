use serde::{Serialize, Deserialize};
use crate::utils::cmd::powershell_no_window;

#[derive(Serialize, Deserialize, Clone)]
pub struct VhdxFile {
    pub path: String,
    pub size_bytes: u64,
    pub size_display: String,
    pub source: String, // "Docker" or "WSL2"
    pub distro: String,
}

#[derive(Serialize, Clone)]
pub struct CompactResult {
    pub path: String,
    pub before_bytes: u64,
    pub after_bytes: u64,
    pub saved_bytes: u64,
    pub success: bool,
    pub error: String,
}

#[tauri::command]
pub fn scan_vhdx_files() -> Result<Vec<VhdxFile>, String> {
    let ps_script = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$results = @()

function Format-Size($bytes) {
    if ($bytes -lt 1MB) { return "$([math]::Round($bytes/1KB,1)) KB" }
    if ($bytes -lt 1GB) { return "$([math]::Round($bytes/1MB,1)) MB" }
    return "$([math]::Round($bytes/1GB,2)) GB" }

# Docker Desktop VHDX
$dockerPaths = @(
    "$env:LOCALAPPDATA\Docker\wsl\data\ext4.vhdx",
    "$env:LOCALAPPDATA\Docker\wsl\disk\docker_data.vhdx"
)
foreach ($dp in $dockerPaths) {
    if (Test-Path $dp) {
        $f = Get-Item $dp -ErrorAction SilentlyContinue
        if ($f) {
            $results += [PSCustomObject]@{
                path = $f.FullName
                size_bytes = $f.Length
                size_display = (Format-Size $f.Length)
                source = 'Docker'
                distro = 'docker-desktop-data'
            }
        }
    }
}

# WSL2 distros
$wslPackages = "$env:LOCALAPPDATA\Packages"
if (Test-Path $wslPackages) {
    $distros = Get-ChildItem $wslPackages -Directory -Filter '*Linux*','*Ubuntu*','*Debian*','*SUSE*','*Kali*','*Fedora*' -ErrorAction SilentlyContinue
    # Also check CanonicalGroup patterns
    $distros += Get-ChildItem $wslPackages -Directory -Filter 'CanonicalGroup*' -ErrorAction SilentlyContinue
    $distros += Get-ChildItem $wslPackages -Directory -Filter 'TheDebianProject*' -ErrorAction SilentlyContinue
    foreach ($d in $distros) {
        $vhdx = Join-Path $d.FullName 'LocalState\ext4.vhdx'
        if (Test-Path $vhdx) {
            $f = Get-Item $vhdx -ErrorAction SilentlyContinue
            if ($f) {
                $results += [PSCustomObject]@{
                    path = $f.FullName
                    size_bytes = $f.Length
                    size_display = (Format-Size $f.Length)
                    source = 'WSL2'
                    distro = $d.Name
                }
            }
        }
    }
}

# Generic search for any ext4.vhdx under Packages
$genericVhdx = Get-ChildItem "$env:LOCALAPPDATA\Packages" -Recurse -Filter 'ext4.vhdx' -File -ErrorAction SilentlyContinue 2>$null
foreach ($gv in $genericVhdx) {
    $already = $results | Where-Object { $_.path -eq $gv.FullName }
    if (-not $already) {
        $results += [PSCustomObject]@{
            path = $gv.FullName
            size_bytes = $gv.Length
            size_display = (Format-Size $gv.Length)
            source = 'WSL2'
            distro = ($gv.Directory.Parent.Name)
        }
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
        match serde_json::from_str::<VhdxFile>(&stdout) {
            Ok(item) => Ok(vec![item]),
            Err(e) => Err(format!("JSON 파싱 오류: {}", e)),
        }
    }
}

#[tauri::command]
pub fn compact_vhdx(vhdx_path: String) -> Result<CompactResult, String> {
    // Get before size
    let before_size: u64 = std::fs::metadata(&vhdx_path)
        .map(|m| m.len())
        .unwrap_or(0);

    // Shutdown WSL first
    let _ = powershell_no_window()
        .args(["-Command", "wsl --shutdown; Start-Sleep -Seconds 3"])
        .output();

    // Create diskpart script
    let diskpart_script = format!(
        "select vdisk file=\"{}\"\ncompact vdisk",
        vhdx_path
    );

    let ps_script = format!(
        r#"
$script = @"
{}
"@
$tmpFile = [System.IO.Path]::GetTempFileName()
$script | Out-File $tmpFile -Encoding ASCII
$result = diskpart /s $tmpFile 2>&1
Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue
$result -join "`n"
"#,
        diskpart_script
    );

    let output = powershell_no_window()
        .args(["-Command", &ps_script])
        .output()
        .map_err(|e| format!("diskpart 실행 실패: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();

    // Get after size
    let after_size: u64 = std::fs::metadata(&vhdx_path)
        .map(|m| m.len())
        .unwrap_or(before_size);

    let saved = if before_size > after_size { before_size - after_size } else { 0 };

    if output.status.success() || stdout.contains("successfully") || stdout.contains("100") {
        Ok(CompactResult {
            path: vhdx_path,
            before_bytes: before_size,
            after_bytes: after_size,
            saved_bytes: saved,
            success: true,
            error: String::new(),
        })
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Ok(CompactResult {
            path: vhdx_path,
            before_bytes: before_size,
            after_bytes: after_size,
            saved_bytes: saved,
            success: false,
            error: if stderr.is_empty() { stdout } else { stderr },
        })
    }
}
