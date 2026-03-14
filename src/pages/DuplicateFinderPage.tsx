import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Copy,
  FolderSearch,
  Trash2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  HardDrive,
  RefreshCw,
  CheckCircle2,
  Search,
} from "lucide-react";
import Card from "@/components/common/Card";

/* ── Types ─────────────────────────────────────── */

interface DuplicateFile {
  path: string;
  size_bytes: number;
  modified: string;
}

interface DuplicateGroup {
  hash: string;
  size_bytes: number;
  files: DuplicateFile[];
  wasted_bytes: number;
}

interface DuplicateScanResult {
  groups: DuplicateGroup[];
  total_groups: number;
  total_wasted_bytes: number;
  total_files_scanned: number;
}

interface DeleteResult {
  deleted: number;
  failed: number;
  freed_bytes: number;
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

export default function DuplicateFinderPage() {
  const [path, setPath] = useState("");
  const [minSizeKB, setMinSizeKB] = useState<number>(1024); // default 1MB

  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<DuplicateScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // set of paths to delete
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  // expanded groups (hash)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<DeleteResult | null>(null);

  const handleScan = async () => {
    if (!path) return;
    setScanning(true);
    setScanResult(null);
    setScanError(null);
    setDeleteResult(null);
    setSelectedPaths(new Set());
    setExpandedGroups(new Set());

    try {
      const res = await invoke<DuplicateScanResult>("scan_duplicates", {
        path,
        minSizeKb: Number(minSizeKB),
      });
      setScanResult(res);
      // Expand top 3 by default
      const initialExpand = new Set<string>();
      res.groups.slice(0, 3).forEach((g) => initialExpand.add(g.hash));
      setExpandedGroups(initialExpand);
    } catch (err) {
      setScanError(String(err));
    } finally {
      setScanning(false);
    }
  };

  const toggleGroup = (hash: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return next;
    });
  };

  const toggleFile = (filePath: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  };

  const selectAllButOne = (group: DuplicateGroup) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      // Keep the first file, select the rest
      for (let i = 1; i < group.files.length; i++) {
        next.add(group.files[i].path);
      }
      return next;
    });
  };

  const handleDelete = async () => {
    if (selectedPaths.size === 0) return;
    if (
      !confirm(
        `선택한 ${selectedPaths.size}개의 파일을 정말 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`
      )
    ) {
      return;
    }

    setDeleting(true);
    setDeleteResult(null);

    const pathsToDelete = Array.from(selectedPaths);
    try {
      const res = await invoke<DeleteResult>("delete_duplicate_files", {
        paths: pathsToDelete,
      });
      setDeleteResult(res);
      // clear selection
      setSelectedPaths(new Set());
      // Re-scan to update list
      handleScan();
    } catch (err) {
      alert(`삭제 중 오류 발생: ${err}`);
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          디렉토리를 스캔하여 완전히 동일한 내용을 가진 중복 파일을 찾아 시각화하고 삭제합니다.
        </p>
      </div>

      <Card title="스캔 옵션" icon={<FolderSearch className="h-4 w-4" />}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-semibold text-[var(--color-muted-foreground)]">
              스캔 경로
            </label>
            <input
              type="text"
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              placeholder="C:\Users\Example\Downloads"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleScan();
              }}
            />
          </div>
          <div className="w-32 space-y-1">
            <label className="text-xs font-semibold text-[var(--color-muted-foreground)]">
              최소 크기 (KB)
            </label>
            <input
              type="number"
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              value={minSizeKB}
              onChange={(e) => setMinSizeKB(Number(e.target.value))}
              min={1}
            />
          </div>
          <button
            onClick={handleScan}
            disabled={scanning || !path}
            className="flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {scanning ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                스캔 중...
              </>
            ) : (
              <>
                <Search className="h-4 w-4 hidden" />
                스캔 시작
              </>
            )}
          </button>
        </div>
      </Card>

      {/* Delete Result */}
      {deleteResult && (
        <div
          className={`flex items-start gap-3 rounded-[var(--radius-md)] border p-4 text-sm ${
            deleteResult.failed === 0
              ? "border-green-500/30 bg-green-500/10 text-green-500"
              : "border-amber-500/30 bg-amber-500/10 text-amber-500"
          }`}
        >
          {deleteResult.failed === 0 ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 shrink-0" />
          )}
          <div>
            <p className="font-bold">삭제 완료</p>
            <p className="mt-1 opacity-90">
              성공: {deleteResult.deleted}개 ({formatSize(deleteResult.freed_bytes)} 확보)
            </p>
            {deleteResult.failed > 0 && (
              <p className="mt-0.5 font-semibold text-red-500">실패: {deleteResult.failed}개</p>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {scanError && (
        <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-red-500/30 bg-red-500/10 p-4 text-red-500">
          <AlertTriangle className="h-5 w-5" />
          <p className="text-sm font-medium">{scanError}</p>
        </div>
      )}

      {/* Results */}
      {scanResult && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-[var(--radius-sm)] bg-[var(--color-card)] border border-[var(--color-border)] p-3 shadow-sm">
              <p className="text-xs text-[var(--color-muted-foreground)]">검색된 파일</p>
              <p className="mt-1 text-xl font-bold text-[var(--color-card-foreground)]">
                {scanResult.total_files_scanned.toLocaleString()}개
              </p>
            </div>
            <div className="rounded-[var(--radius-sm)] bg-[var(--color-card)] border border-[var(--color-border)] p-3 shadow-sm">
              <p className="text-xs text-[var(--color-muted-foreground)]">중복 그룹</p>
              <p className="mt-1 text-xl font-bold text-amber-500">
                {scanResult.total_groups.toLocaleString()}개
              </p>
            </div>
            <div className="rounded-[var(--radius-sm)] bg-[var(--color-card)] border border-[var(--color-border)] p-3 shadow-sm">
              <p className="text-xs text-[var(--color-muted-foreground)]">낭비되는 용량</p>
              <p className="mt-1 text-xl font-bold text-red-400">
                {formatSize(scanResult.total_wasted_bytes)}
              </p>
            </div>
          </div>

          <Card
            title="중복 파일 목록 (낭비 용량 순 정렬)"
            icon={<Copy className="h-4 w-4" />}
            className="flex-1"
          >
            {scanResult.groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-[var(--color-muted-foreground)]">
                <CheckCircle2 className="mb-4 h-12 w-12 text-green-500/50" />
                <p>발견된 중복 파일이 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    {selectedPaths.size}개의 파일 선택됨
                  </span>
                  <button
                    onClick={handleDelete}
                    disabled={selectedPaths.size === 0 || deleting}
                    className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deleting ? "삭제 중..." : "선택 항목 삭제"}
                  </button>
                </div>

                <div className="space-y-2">
                  {scanResult.groups.map((group) => {
                    const isExpanded = expandedGroups.has(group.hash);
                    const groupSelectedCount = group.files.filter((f) => selectedPaths.has(f.path)).length;
                    
                    return (
                      <div
                        key={group.hash}
                        className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)]"
                      >
                        {/* Group Header */}
                        <div
                          className="flex cursor-pointer items-center justify-between bg-[var(--color-muted)]/30 px-3 py-2 transition-colors hover:bg-[var(--color-muted)]/50"
                          onClick={() => toggleGroup(group.hash)}
                        >
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-[var(--color-muted-foreground)]" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-[var(--color-muted-foreground)]" />
                            )}
                            <HardDrive className="h-4 w-4 text-[var(--color-muted-foreground)]" />
                            <div>
                              <p className="text-sm font-semibold text-[var(--color-foreground)]">
                                {formatSize(group.size_bytes)} × {group.files.length}개
                              </p>
                              <p className="text-[10px] uppercase text-[var(--color-muted-foreground)]">
                                잠재적 확보 가능: {formatSize(group.wasted_bytes)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-[var(--color-muted-foreground)]">
                              {groupSelectedCount}/{group.files.length} 선택
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                selectAllButOne(group);
                              }}
                              className="rounded bg-[var(--color-muted)] px-2 py-1 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white"
                            >
                              자동 선택 (원본 1개 남김)
                            </button>
                          </div>
                        </div>

                        {/* Files List */}
                        {isExpanded && (
                          <div className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
                            {group.files.map((file, fIdx) => (
                              <label
                                key={fIdx}
                                className="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-[var(--color-muted)]/20"
                              >
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                                  checked={selectedPaths.has(file.path)}
                                  onChange={() => toggleFile(file.path)}
                                />
                                <div className="flex-1 truncate">
                                  <p className="truncate text-sm text-[var(--color-foreground)]" title={file.path}>
                                    {file.path}
                                  </p>
                                  <p className="text-xs text-[var(--color-muted-foreground)]">
                                    수정일: {file.modified}
                                  </p>
                                </div>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
