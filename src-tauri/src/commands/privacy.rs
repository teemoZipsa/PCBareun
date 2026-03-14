use serde::Serialize;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone)]
pub struct PrivacyItem {
    pub id: String,
    pub name: String,
    pub group: String,
    pub size_bytes: u64,
    pub file_count: u32,
}

#[derive(Serialize)]
pub struct CleanResult {
    pub id: String,
    pub cleaned_bytes: u64,
    pub cleaned_files: u32,
    pub failed_files: u32,
}

#[derive(Serialize)]
pub struct CleanSummary {
    pub results: Vec<CleanResult>,
    pub total_cleaned_bytes: u64,
    pub total_cleaned_files: u32,
}

// ── Internal types ──────────────────────────────────────────

enum TargetKind {
    Dir,
    File,
    Glob(String, String),
}

struct Target {
    id: String,
    name: String,
    group: String,
    path: PathBuf,
    kind: TargetKind,
}

// ── Helpers ─────────────────────────────────────────────────

fn dir_stats(path: &Path) -> (u64, u32) {
    if !path.is_dir() {
        return (0, 0);
    }
    let (mut sz, mut cnt) = (0u64, 0u32);
    walk(path, &mut sz, &mut cnt);
    (sz, cnt)
}

fn walk(dir: &Path, sz: &mut u64, cnt: &mut u32) {
    for e in fs::read_dir(dir).into_iter().flatten().flatten() {
        let p = e.path();
        if p.is_dir() {
            walk(&p, sz, cnt);
        } else {
            *sz += p.metadata().map(|m| m.len()).unwrap_or(0);
            *cnt += 1;
        }
    }
}

fn file_stats(path: &Path) -> (u64, u32) {
    if !path.is_file() {
        return (0, 0);
    }
    (path.metadata().map(|m| m.len()).unwrap_or(0), 1)
}

fn glob_stats(dir: &Path, pre: &str, suf: &str) -> (u64, u32) {
    if !dir.is_dir() {
        return (0, 0);
    }
    let (mut sz, mut cnt) = (0u64, 0u32);
    for e in fs::read_dir(dir).into_iter().flatten().flatten() {
        let n = e.file_name().to_string_lossy().to_string();
        if n.starts_with(pre) && n.ends_with(suf) {
            sz += e.path().metadata().map(|m| m.len()).unwrap_or(0);
            cnt += 1;
        }
    }
    (sz, cnt)
}

fn firefox_profile() -> Option<PathBuf> {
    let ad = env::var("APPDATA").ok()?;
    let p = Path::new(&ad)
        .join("Mozilla")
        .join("Firefox")
        .join("Profiles");
    fs::read_dir(&p)
        .ok()?
        .flatten()
        .find(|e| e.path().is_dir())
        .map(|e| e.path())
}

fn targets() -> Vec<Target> {
    let la = env::var("LOCALAPPDATA").unwrap_or_default();
    let ad = env::var("APPDATA").unwrap_or_default();
    let tmp = env::var("TEMP").unwrap_or_default();
    let mut t: Vec<Target> = Vec::new();

    // ── Google Chrome ───
    let cb = Path::new(&la)
        .join("Google")
        .join("Chrome")
        .join("User Data")
        .join("Default");
    t.push(Target {
        id: "chrome_cache".into(),
        name: "캐시".into(),
        group: "Google Chrome".into(),
        path: cb.join("Cache").join("Cache_Data"),
        kind: TargetKind::Dir,
    });
    t.push(Target {
        id: "chrome_code_cache".into(),
        name: "코드 캐시".into(),
        group: "Google Chrome".into(),
        path: cb.join("Code Cache"),
        kind: TargetKind::Dir,
    });
    t.push(Target {
        id: "chrome_cookies".into(),
        name: "쿠키".into(),
        group: "Google Chrome".into(),
        path: cb.join("Network").join("Cookies"),
        kind: TargetKind::File,
    });
    t.push(Target {
        id: "chrome_history".into(),
        name: "방문 기록".into(),
        group: "Google Chrome".into(),
        path: cb.join("History"),
        kind: TargetKind::File,
    });

    // ── Microsoft Edge ───
    let eb = Path::new(&la)
        .join("Microsoft")
        .join("Edge")
        .join("User Data")
        .join("Default");
    t.push(Target {
        id: "edge_cache".into(),
        name: "캐시".into(),
        group: "Microsoft Edge".into(),
        path: eb.join("Cache").join("Cache_Data"),
        kind: TargetKind::Dir,
    });
    t.push(Target {
        id: "edge_code_cache".into(),
        name: "코드 캐시".into(),
        group: "Microsoft Edge".into(),
        path: eb.join("Code Cache"),
        kind: TargetKind::Dir,
    });
    t.push(Target {
        id: "edge_cookies".into(),
        name: "쿠키".into(),
        group: "Microsoft Edge".into(),
        path: eb.join("Network").join("Cookies"),
        kind: TargetKind::File,
    });
    t.push(Target {
        id: "edge_history".into(),
        name: "방문 기록".into(),
        group: "Microsoft Edge".into(),
        path: eb.join("History"),
        kind: TargetKind::File,
    });

    // ── Firefox ───
    if let Some(fp) = firefox_profile() {
        t.push(Target {
            id: "firefox_cache".into(),
            name: "캐시".into(),
            group: "Firefox".into(),
            path: fp.join("cache2"),
            kind: TargetKind::Dir,
        });
        t.push(Target {
            id: "firefox_cookies".into(),
            name: "쿠키".into(),
            group: "Firefox".into(),
            path: fp.join("cookies.sqlite"),
            kind: TargetKind::File,
        });
        t.push(Target {
            id: "firefox_history".into(),
            name: "방문 기록".into(),
            group: "Firefox".into(),
            path: fp.join("places.sqlite"),
            kind: TargetKind::File,
        });
    }

    // ── Windows ───
    t.push(Target {
        id: "win_temp".into(),
        name: "임시 파일".into(),
        group: "Windows".into(),
        path: PathBuf::from(&tmp),
        kind: TargetKind::Dir,
    });
    t.push(Target {
        id: "win_recent".into(),
        name: "최근 사용 기록".into(),
        group: "Windows".into(),
        path: Path::new(&ad)
            .join("Microsoft")
            .join("Windows")
            .join("Recent"),
        kind: TargetKind::Dir,
    });
    t.push(Target {
        id: "win_prefetch".into(),
        name: "프리페치".into(),
        group: "Windows".into(),
        path: PathBuf::from(r"C:\Windows\Prefetch"),
        kind: TargetKind::Dir,
    });
    t.push(Target {
        id: "win_thumbcache".into(),
        name: "섬네일 캐시".into(),
        group: "Windows".into(),
        path: Path::new(&la)
            .join("Microsoft")
            .join("Windows")
            .join("Explorer"),
        kind: TargetKind::Glob("thumbcache_".into(), ".db".into()),
    });

    t
}

// ── Commands ────────────────────────────────────────────────

#[tauri::command]
pub fn scan_privacy_items() -> Result<Vec<PrivacyItem>, String> {
    Ok(targets()
        .into_iter()
        .filter_map(|t| {
            let (sz, cnt) = match &t.kind {
                TargetKind::Dir => dir_stats(&t.path),
                TargetKind::File => file_stats(&t.path),
                TargetKind::Glob(p, s) => glob_stats(&t.path, p, s),
            };
            if cnt > 0 {
                Some(PrivacyItem {
                    id: t.id,
                    name: t.name,
                    group: t.group,
                    size_bytes: sz,
                    file_count: cnt,
                })
            } else {
                None
            }
        })
        .collect())
}

#[tauri::command]
pub fn clean_privacy_items(item_ids: Vec<String>) -> Result<CleanSummary, String> {
    let mut results = Vec::new();
    let (mut tb, mut tf) = (0u64, 0u32);

    for t in targets() {
        if !item_ids.contains(&t.id) {
            continue;
        }
        let (cb, cf, ff) = match &t.kind {
            TargetKind::Dir => clean_dir(&t.path),
            TargetKind::File => clean_file(&t.path),
            TargetKind::Glob(p, s) => clean_glob(&t.path, p, s),
        };
        tb += cb;
        tf += cf;
        results.push(CleanResult {
            id: t.id,
            cleaned_bytes: cb,
            cleaned_files: cf,
            failed_files: ff,
        });
    }

    Ok(CleanSummary {
        results,
        total_cleaned_bytes: tb,
        total_cleaned_files: tf,
    })
}

// ── Clean helpers ───────────────────────────────────────────

fn clean_dir(dir: &Path) -> (u64, u32, u32) {
    if !dir.is_dir() {
        return (0, 0, 0);
    }
    let (mut cb, mut cf, mut ff) = (0u64, 0u32, 0u32);
    rm_contents(dir, &mut cb, &mut cf, &mut ff);
    (cb, cf, ff)
}

fn rm_contents(dir: &Path, cb: &mut u64, cf: &mut u32, ff: &mut u32) {
    for e in fs::read_dir(dir).into_iter().flatten().flatten() {
        let p = e.path();
        if p.is_dir() {
            rm_contents(&p, cb, cf, ff);
            let _ = fs::remove_dir(&p);
        } else {
            let sz = p.metadata().map(|m| m.len()).unwrap_or(0);
            match fs::remove_file(&p) {
                Ok(_) => {
                    *cb += sz;
                    *cf += 1;
                }
                Err(_) => {
                    *ff += 1;
                }
            }
        }
    }
}

fn clean_file(path: &Path) -> (u64, u32, u32) {
    if !path.is_file() {
        return (0, 0, 0);
    }
    let sz = path.metadata().map(|m| m.len()).unwrap_or(0);
    match fs::remove_file(path) {
        Ok(_) => (sz, 1, 0),
        Err(_) => (0, 0, 1),
    }
}

fn clean_glob(dir: &Path, pre: &str, suf: &str) -> (u64, u32, u32) {
    if !dir.is_dir() {
        return (0, 0, 0);
    }
    let (mut cb, mut cf, mut ff) = (0u64, 0u32, 0u32);
    for e in fs::read_dir(dir).into_iter().flatten().flatten() {
        let n = e.file_name().to_string_lossy().to_string();
        if n.starts_with(pre) && n.ends_with(suf) {
            let sz = e.path().metadata().map(|m| m.len()).unwrap_or(0);
            match fs::remove_file(e.path()) {
                Ok(_) => {
                    cb += sz;
                    cf += 1;
                }
                Err(_) => {
                    ff += 1;
                }
            }
        }
    }
    (cb, cf, ff)
}
