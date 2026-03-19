import { useEffect, useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Package,
  Search,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  FolderOpen,
  Database,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  ArrowDownAZ,
  ArrowDownZA,
  HardDrive,
  Calendar,
  ExternalLink,
} from "lucide-react";
import SafetyBanner from "@/components/common/SafetyBanner";
import SkeletonRows from "@/components/common/SkeletonRows";

/* ── Types ─────────────────────────────────────── */

interface InstalledProgram {
  name: string;
  publisher: string;
  version: string;
  install_date: string;
  size_mb: number;
  uninstall_string: string;
  registry_key: string;
}

interface LeftoverItem {
  path: string;
  kind: string;
  size_bytes: number;
}

interface ScanResult {
  files: LeftoverItem[];
  registry_keys: LeftoverItem[];
  total_size_bytes: number;
}

type SortKey = "name" | "publisher" | "size_mb" | "install_date";
type SortDir = "asc" | "desc";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(raw: string): string {
  if (!raw || raw.length !== 8) return "";
  return `${raw.slice(0, 4)}.${raw.slice(4, 6)}.${raw.slice(6, 8)}`;
}

function formatSize(mb: number): string {
  if (mb <= 0) return "";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(1)} MB`;
}

/* ── Component ──────────────────────────────────── */

export default function ProgramUninstallPage() {
  const [programs, setPrograms] = useState<InstalledProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [actionMessage, setActionMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Leftover scanning state
  const [scanningKey, setScanningKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [checkedFiles, setCheckedFiles] = useState<Set<string>>(new Set());
  const [checkedReg, setCheckedReg] = useState<Set<string>>(new Set());
  const [showFiles, setShowFiles] = useState(true);
  const [showReg, setShowReg] = useState(true);
  const [cleaning, setCleaning] = useState(false);

  const fetchPrograms = useCallback(async () => {
    try {
      setError(null);
      const result = await invoke<InstalledProgram[]>("get_installed_programs");
      setPrograms(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filteredPrograms = useMemo(() => {
    const filtered = programs.filter((p) => {
      if (searchQuery === "") return true;
      const q = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.publisher.toLowerCase().includes(q)
      );
    });

    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "publisher":
          cmp = a.publisher.localeCompare(b.publisher);
          break;
        case "size_mb":
          cmp = a.size_mb - b.size_mb;
          break;
        case "install_date":
          cmp = a.install_date.localeCompare(b.install_date);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return filtered;
  }, [programs, searchQuery, sortKey, sortDir]);

  const totalSizeMB = useMemo(
    () => programs.reduce((sum, p) => sum + p.size_mb, 0),
    [programs]
  );

  const handleScanLeftovers = async (program: InstalledProgram) => {
    if (expandedKey === program.registry_key) {
      setExpandedKey(null);
      setScanResult(null);
      return;
    }
    setScanningKey(program.registry_key);
    setExpandedKey(program.registry_key);
    setScanResult(null);
    setCheckedFiles(new Set());
    setCheckedReg(new Set());
    try {
      const result = await invoke<ScanResult>("scan_leftovers", {
        programName: program.name,
        publisher: program.publisher,
        registryKey: program.registry_key,
      });
      setScanResult(result);
      setCheckedFiles(new Set(result.files.map((f) => f.path)));
      setCheckedReg(new Set(result.registry_keys.map((r) => r.path)));
      setShowFiles(true);
      setShowReg(true);
    } catch (err) {
      setActionMessage({ type: "error", text: String(err) });
      setExpandedKey(null);
    } finally {
      setScanningKey(null);
    }
  };

  const handleDeleteLeftovers = async () => {
    if (checkedFiles.size === 0 && checkedReg.size === 0) return;
    setCleaning(true);
    try {
      const msg = await invoke<string>("delete_leftovers", {
        filePaths: Array.from(checkedFiles),
        registryPaths: Array.from(checkedReg),
      });
      setActionMessage({ type: "success", text: msg });

      // Remove deleted items from scan result immediately
      setScanResult((prev) => {
        if (!prev) return prev;
        const newFiles = prev.files.filter((f) => !checkedFiles.has(f.path));
        const newReg = prev.registry_keys.filter((r) => !checkedReg.has(r.path));

        // If nothing left, close the panel
        if (newFiles.length === 0 && newReg.length === 0) {
          setExpandedKey(null);
          return null;
        }

        return {
          files: newFiles,
          registry_keys: newReg,
          total_size_bytes: newFiles.reduce((sum, f) => sum + f.size_bytes, 0),
        };
      });
      setCheckedFiles(new Set());
      setCheckedReg(new Set());
    } catch (err) {
      setActionMessage({ type: "error", text: String(err) });
    } finally {
      setCleaning(false);
    }
  };

  const toggleFile = (path: string) => {
    setCheckedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleReg = (path: string) => {
    setCheckedReg((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const SortIcon = sortDir === "asc" ? ArrowDownAZ : ArrowDownZA;

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: "name", label: "이름순" },
    { key: "publisher", label: "게시자순" },
    { key: "size_mb", label: "용량순" },
    { key: "install_date", label: "설치일순" },
  ];

  if (loading) {
    return <SkeletonRows rows={10} cols={4} />;
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[var(--color-destructive)]">
          <AlertCircle className="h-8 w-8" />
          <p className="text-sm">{error}</p>
          <button
            onClick={() => { setLoading(true); fetchPrograms(); }}
            className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-1.5 text-sm text-white hover:opacity-90"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SafetyBanner message="설치된 프로그램의 설치 경로와 관련 파일을 확인합니다. 프로그램 제거는 Windows 설정에서 진행하세요." />

      {/* 제어판 바로가기 */}
      <button
        onClick={() => invoke("open_appwiz_cpl").catch(() => {})}
        className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2.5 text-sm text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)]/50 hover:border-[var(--color-primary)]/30 w-full"
      >
        <ExternalLink className="h-4 w-4 text-[var(--color-primary)]" />
        <span className="font-medium">Windows 프로그램 제거</span>
        <span className="text-xs text-[var(--color-muted-foreground)]">제어판 &gt; 프로그램 추가/제거</span>
      </button>

      {/* ── 통계 + 검색 + 정렬 통합 바 ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* 통계 칩들 */}
        <div className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-xs">
          <Package className="h-3.5 w-3.5 text-[var(--color-primary)]" />
          <span className="font-bold text-[var(--color-card-foreground)]">{programs.length}</span>
          <span className="text-[var(--color-muted-foreground)]">프로그램</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-xs">
          <HardDrive className="h-3.5 w-3.5 text-[var(--color-primary)]" />
          <span className="font-bold text-[var(--color-card-foreground)]">{formatSize(totalSizeMB) || "0 MB"}</span>
        </div>

        {/* 검색 */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
          <input
            type="text"
            placeholder="프로그램 이름 또는 게시자 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-full border border-[var(--color-border)] bg-[var(--color-card)] py-1.5 pl-9 pr-3 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>

        {/* 정렬 버튼들 */}
        <div className="flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] p-0.5">
          {sortOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => handleSort(opt.key)}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                sortKey === opt.key
                  ? "bg-[var(--color-primary)] text-white"
                  : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              }`}
            >
              {opt.label}
              {sortKey === opt.key && <SortIcon className="h-3 w-3" />}
            </button>
          ))}
        </div>

        {/* 새로고침 */}
        <button
          onClick={() => { setLoading(true); fetchPrograms(); }}
          className="rounded-full border border-[var(--color-border)] bg-[var(--color-card)] p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 알림 */}
      {actionMessage && (
        <div
          className={`flex items-center gap-2 rounded-[var(--radius-md)] border px-4 py-2.5 text-sm ${
            actionMessage.type === "success"
              ? "border-green-500/30 bg-green-500/10 text-green-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {actionMessage.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="ml-auto text-xs opacity-60 hover:opacity-100">닫기</button>
        </div>
      )}

      {/* ── 프로그램 카드 리스트 ── */}
      <div className="space-y-1.5">
        {filteredPrograms.length === 0 ? (
          <p className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">
            검색 결과가 없습니다.
          </p>
        ) : (
          filteredPrograms.map((program) => {
            const isExpanded = expandedKey === program.registry_key;
            const isScanning = scanningKey === program.registry_key;
            const sizeStr = formatSize(program.size_mb);
            const dateStr = formatDate(program.install_date);

            return (
              <div key={program.registry_key} className="group">
                {/* 기본 프로그램 행 */}
                <div
                  className={`flex items-center gap-3 rounded-[var(--radius-md)] border px-4 py-3 transition-all ${
                    isExpanded
                      ? "border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5"
                      : "border-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-muted)]/20"
                  }`}
                >
                  {/* 좌측: 이름 + 게시자 */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--color-card-foreground)]">
                      {program.name}
                    </p>
                    {program.publisher && (
                      <p className="mt-0.5 truncate text-xs text-[var(--color-muted-foreground)]">
                        {program.publisher}
                        {program.version && ` · v${program.version}`}
                      </p>
                    )}
                  </div>

                  {/* 메타: 설치일 + 크기 */}
                  <div className="hidden shrink-0 items-center gap-4 sm:flex">
                    {dateStr && (
                      <span className="flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]">
                        <Calendar className="h-3 w-3" />
                        {dateStr}
                      </span>
                    )}
                    {sizeStr && (
                      <span className="min-w-[56px] text-right text-xs font-semibold text-[var(--color-card-foreground)]">
                        {sizeStr}
                      </span>
                    )}
                  </div>

                  {/* 잔여 파일 검사 버튼 */}
                  <button
                    onClick={() => handleScanLeftovers(program)}
                    disabled={isScanning}
                    className={`shrink-0 flex items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-1.5 text-xs font-medium transition-all ${
                      isExpanded
                        ? "bg-[var(--color-primary)] text-white"
                        : "border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]/40 hover:text-[var(--color-primary)]"
                    }`}
                  >
                    {isScanning ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FolderOpen className="h-3.5 w-3.5" />
                    )}
                    {isExpanded ? "닫기" : "경로 보기"}
                  </button>
                </div>

                {/* ── 잔여 검사 결과 패널 ── */}
                {isExpanded && (
                  <div className="ml-4 mr-4 mb-2 rounded-b-[var(--radius-md)] border border-t-0 border-[var(--color-primary)]/20 bg-[var(--color-muted)]/10 px-4 py-3">
                    {isScanning ? (
                      <div className="flex items-center justify-center gap-2 py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-[var(--color-primary)]" />
                        <span className="text-sm text-[var(--color-muted-foreground)]">
                          설치 경로를 검색 중...
                        </span>
                      </div>
                    ) : scanResult ? (
                      scanResult.files.length === 0 && scanResult.registry_keys.length === 0 ? (
                        <div className="flex items-center gap-2 py-4 text-sm text-[var(--color-muted-foreground)]">
                          <CheckCircle2 className="h-4 w-4 text-green-400" />
                          관련 경로가 발견되지 않았습니다.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center gap-4 text-xs text-[var(--color-muted-foreground)]">
                            <span>
                              파일/폴더: <strong className="text-[var(--color-card-foreground)]">{scanResult.files.length}</strong>개
                            </span>
                            <span>
                              레지스트리: <strong className="text-[var(--color-card-foreground)]">{scanResult.registry_keys.length}</strong>개
                            </span>
                            <span>
                              총 크기: <strong className="text-[var(--color-card-foreground)]">{formatBytes(scanResult.total_size_bytes)}</strong>
                            </span>
                          </div>

                          {/* Files */}
                          {scanResult.files.length > 0 && (
                            <div>
                              <button
                                onClick={() => setShowFiles(!showFiles)}
                                className="flex items-center gap-1 text-xs font-medium text-[var(--color-card-foreground)]"
                              >
                                {showFiles ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                <FolderOpen className="h-3.5 w-3.5 text-[var(--color-primary)]" />
                                파일/폴더 ({scanResult.files.length})
                              </button>
                              {showFiles && (
                                <div className="mt-1 max-h-36 overflow-y-auto rounded-[var(--radius-sm)] bg-[var(--color-background)] p-2">
                                  {scanResult.files.map((f) => (
                                    <label key={f.path} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-[var(--color-muted)]/30 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={checkedFiles.has(f.path)}
                                        onChange={() => toggleFile(f.path)}
                                        className="cb-check"
                                      />
                                      <span className="min-w-0 flex-1 truncate font-mono text-[var(--color-muted-foreground)]">{f.path}</span>
                                      <span className="shrink-0 text-[var(--color-muted-foreground)]">{formatBytes(f.size_bytes)}</span>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Registry */}
                          {scanResult.registry_keys.length > 0 && (
                            <div>
                              <button
                                onClick={() => setShowReg(!showReg)}
                                className="flex items-center gap-1 text-xs font-medium text-[var(--color-card-foreground)]"
                              >
                                {showReg ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                <Database className="h-3.5 w-3.5 text-orange-400" />
                                레지스트리 ({scanResult.registry_keys.length})
                              </button>
                              {showReg && (
                                <div className="mt-1 max-h-36 overflow-y-auto rounded-[var(--radius-sm)] bg-[var(--color-background)] p-2">
                                  {scanResult.registry_keys.map((r) => (
                                    <label key={r.path} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-[var(--color-muted)]/30 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={checkedReg.has(r.path)}
                                        onChange={() => toggleReg(r.path)}
                                        className="cb-check"
                                      />
                                      <span className="min-w-0 flex-1 truncate font-mono text-[var(--color-muted-foreground)]">{r.path}</span>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Delete button */}
                          {(checkedFiles.size > 0 || checkedReg.size > 0) && (
                            <div className="flex items-center gap-3 pt-1">
                              <button
                                onClick={handleDeleteLeftovers}
                                disabled={cleaning}
                                className="flex items-center gap-2 rounded-[var(--radius-md)] bg-red-500 px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                              >
                                {cleaning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                선택 항목 삭제 ({checkedFiles.size + checkedReg.size}개)
                              </button>
                              <span className="flex items-center gap-1 text-xs text-amber-500">
                                <AlertTriangle className="h-3 w-3" />
                                삭제된 항목은 복구할 수 없습니다
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    ) : null}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 하단: 표시 개수 */}
      {filteredPrograms.length > 0 && searchQuery && (
        <p className="text-center text-xs text-[var(--color-muted-foreground)]">
          {filteredPrograms.length}개 표시 / 전체 {programs.length}개
        </p>
      )}
    </div>
  );
}
