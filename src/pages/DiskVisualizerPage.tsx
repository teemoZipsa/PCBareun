import { useEffect, useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  HardDrive,
  FolderOpen,
  File as FileIcon,
  ChevronRight,
  Database,
  ArrowLeft,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { ResponsiveContainer, Treemap, Tooltip as RechartsTooltip } from "recharts";

/* ── Types ─────────────────────────────────────── */

interface DriveInfo {
  letter: string;
  path: string;
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
}

interface DirEntry {
  name: string;
  path: string;
  size_bytes: number;
  is_dir: boolean;
  children: DirEntry[] | null;
}

/* ── Helpers ───────────────────────────────────── */

function formatSize(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/* ── Component ──────────────────────────────────── */

export default function DiskVisualizerPage() {
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [loadingDrives, setLoadingDrives] = useState(true);

  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [scanData, setScanData] = useState<DirEntry | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [history, setHistory] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "treemap">("list");

  // 드라이브 목록 불러오기 (자동 스캔 안 함 - 사용자가 드라이브 클릭 시 시작)
  const fetchDrives = useCallback(async () => {
    try {
      const res = await invoke<DriveInfo[]>("get_drives_list");
      setDrives(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDrives(false);
    }
  }, []);

  useEffect(() => {
    fetchDrives();
  }, [fetchDrives]);

  // 폴더 스캔
  const handleScan = async (path: string, isBack = false) => {
    setScanning(true);
    setScanError(null);
    try {
      const res = await invoke<DirEntry>("scan_directory", { path, maxDepth: 3 });
      setScanData(res);
      setCurrentPath(path);
      if (!isBack && history[history.length - 1] !== path) {
        setHistory((prev) => [...prev, path]);
      }
    } catch (err) {
      setScanError(String(err));
    } finally {
      setScanning(false);
    }
  };

  const handleBack = () => {
    if (history.length > 1) {
      const newHistory = [...history];
      newHistory.pop(); // remove current
      const prevPath = newHistory[newHistory.length - 1];
      setHistory(newHistory);
      handleScan(prevPath, true);
    }
  };

  // Recharts Treemap 데이터로 변환
  const treemapData = useMemo(() => {
    if (!scanData || !scanData.children) return [];
    return scanData.children.map((c) => ({
      name: c.name,
      size: c.size_bytes,
      is_dir: c.is_dir,
      path: c.path,
    }));
  }, [scanData]);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* ── 좌측: 드라이브 목록 ── */}
      <div className="w-64 shrink-0 space-y-3 overflow-y-auto pr-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-card-foreground)]">
          <Database className="h-4 w-4" />
          로컬 드라이브
        </h3>
        {loadingDrives ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--color-muted-foreground)]" />
          </div>
        ) : (
          <div className="space-y-2">
            {drives.map((drive) => {
              const usagePercent = drive.total_bytes > 0 ? (drive.used_bytes / drive.total_bytes) * 100 : 0;
              const isSelected = currentPath?.startsWith(drive.path);
              return (
                <button
                  key={drive.path}
                  onClick={() => {
                    setHistory([drive.path]);
                    handleScan(drive.path);
                  }}
                  className={`w-full rounded-[var(--radius-md)] border p-3 text-left transition-colors ${
                    isSelected
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5"
                      : "border-[var(--color-border)] hover:bg-[var(--color-muted)]/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <HardDrive
                      className={`h-5 w-5 ${
                        isSelected ? "text-[var(--color-primary)]" : "text-[var(--color-muted-foreground)]"
                      }`}
                    />
                    <div>
                      <p className="font-semibold text-[var(--color-card-foreground)]">{drive.path}</p>
                      <p className="text-[10px] text-[var(--color-muted-foreground)]">
                        {formatSize(drive.free_bytes)} 사용 가능 / {formatSize(drive.total_bytes)}
                      </p>
                    </div>
                  </div>
                  {/* 진행률 바 */}
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-muted)]">
                    <div
                      className={`h-full rounded-full ${
                        usagePercent > 90 ? "bg-red-500" : usagePercent > 70 ? "bg-amber-400" : "bg-[var(--color-primary)]"
                      }`}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 우측: 스캔 결과 ── */}
      <div className="flex-1 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] flex flex-col">
        {/* 상단 툴바 */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              disabled={history.length <= 1 || scanning}
              className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] disabled:opacity-50 disabled:hover:bg-transparent"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center font-mono text-sm text-[var(--color-card-foreground)] truncate max-w-[400px]">
              {currentPath || "디렉토리를 선택하세요"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode("list")}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                viewMode === "list"
                  ? "bg-[var(--color-primary)] text-white"
                  : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              }`}
            >
              목록형
            </button>
            <button
              onClick={() => setViewMode("treemap")}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                viewMode === "treemap"
                  ? "bg-[var(--color-primary)] text-white"
                  : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              }`}
            >
              트리맵
            </button>
          </div>
        </div>

        {/* 본문 영역 */}
        <div className="flex-1 overflow-auto p-4">
          {scanning ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--color-muted-foreground)]">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p>디렉토리 크기를 스캔하는 중...</p>
            </div>
          ) : scanError ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-red-500">
              <AlertCircle className="h-8 w-8" />
              <p>{scanError}</p>
            </div>
          ) : !scanData || !scanData.children ? (
            <div className="flex h-full items-center justify-center text-[var(--color-muted-foreground)]">
              데이터가 없습니다.
            </div>
          ) : viewMode === "list" ? (
            /* 목록형 뷰 */
            <div className="space-y-1">
              {scanData.children.map((child, i) => {
                const percent = scanData.size_bytes > 0 ? (child.size_bytes / scanData.size_bytes) * 100 : 0;
                return (
                  <button
                    key={i}
                    onClick={() => {
                      if (child.is_dir && child.path) handleScan(child.path);
                    }}
                    disabled={!child.is_dir || !child.path}
                    className="group flex w-full items-center gap-3 rounded-[var(--radius-sm)] p-2 text-left hover:bg-[var(--color-muted)]/50 disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    {child.is_dir ? (
                      <FolderOpen className="h-5 w-5 text-amber-400 shrink-0" />
                    ) : (
                      <FileIcon className="h-5 w-5 text-blue-400 shrink-0" />
                    )}
                    <div className="flex-1 truncate">
                      <p className="truncate text-sm font-medium text-[var(--color-card-foreground)]">
                        {child.name}
                      </p>
                      {/* 프로그레스 바 형태의 시각화 */}
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-[var(--color-muted)]">
                          <div
                            className="h-full rounded-full bg-[var(--color-primary)]/70"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-[var(--color-muted-foreground)]">
                          {percent.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="font-mono text-sm text-[var(--color-muted-foreground)]">
                        {formatSize(child.size_bytes)}
                      </span>
                      {child.is_dir && child.path && (
                        <ChevronRight className="h-4 w-4 text-[var(--color-muted-foreground)] opacity-0 transition-opacity group-hover:opacity-100" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            /* 트리맵 뷰 */
            <div className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <Treemap
                  data={treemapData}
                  dataKey="size"
                  aspectRatio={4 / 3}
                  stroke="var(--color-card)"
                  fill="var(--color-primary)"
                  isAnimationActive={false}
                  onClick={(node: any) => {
                    if (node?.is_dir && node?.path) {
                      handleScan(node.path);
                    }
                  }}
                >
                  <RechartsTooltip
                    content={({ payload }) => {
                      if (payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 shadow-lg">
                            <p className="font-bold text-[var(--color-foreground)]">{data.name}</p>
                            <p className="text-sm text-[var(--color-muted-foreground)]">
                              크기: {formatSize(data.size)}
                            </p>
                            <p className="text-xs text-[var(--color-muted-foreground)]">
                              유형: {data.is_dir ? "폴더 (클릭하여 이동)" : "파일"}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </Treemap>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
