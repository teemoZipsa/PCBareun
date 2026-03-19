import { useState, useEffect } from "react";
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
  Download,
  FileText,
  Monitor,
  FolderOpen,
  ExternalLink,
  CheckSquare,
  XSquare,
  Star,
  Plus,
  X,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import Card from "@/components/common/Card";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/* ── Favorite Folders Store ─────────────────── */
interface FavFolderState {
  folders: { name: string; path: string }[];
  addFolder: (path: string) => void;
  removeFolder: (path: string) => void;
}
const useFavFolderStore = create<FavFolderState>()(
  persist(
    (set) => ({
      folders: [],
      addFolder: (path) =>
        set((s) => {
          if (s.folders.some((f) => f.path === path)) return s;
          const name = path.split("\\").pop() || path;
          return { folders: [...s.folders, { name, path }] };
        }),
      removeFolder: (path) =>
        set((s) => ({ folders: s.folders.filter((f) => f.path !== path) })),
    }),
    { name: "pc-bareun-dup-favs" },
  ),
);

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

/** 수정일 문자열 "2024-01-15 14:30" → Date 비교용 timestamp */
function parseModified(s: string): number {
  const d = new Date(s.replace(" ", "T"));
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

/** 해당 파일의 폴더를 탐색기에서 열기 */
async function openFolder(filePath: string) {
  try {
    const folder = filePath.replace(/\\[^\\]+$/, "");
    await invoke("open_folder_in_explorer", { path: folder });
  } catch {
    // fallback: 그냥 무시
  }
}

/* ── Component ──────────────────────────────────── */

interface UserFolder {
  name: string;
  path: string;
}

const folderIcons: Record<string, React.ElementType> = {
  "다운로드": Download,
  "문서": FileText,
  "바탕화면": Monitor,
};

export default function DuplicateFinderPage() {
  const [path, setPath] = useState("");
  const [minSizeKB, setMinSizeKB] = useState<number>(1024);
  const [userFolders, setUserFolders] = useState<UserFolder[]>([]);
  const { folders: favFolders, addFolder: addFavFolder, removeFolder: removeFavFolder } = useFavFolderStore();

  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<DuplicateScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    invoke<UserFolder[]>("get_user_folders").then((folders) => {
      setUserFolders(folders);
      const dl = folders.find((f) => f.name === "다운로드");
      if (dl && !path) setPath(dl.path);
    }).catch(() => {});
  }, []);

  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
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

  /** 자동 선택: 수정일이 가장 최근인 파일을 원본으로 남기고 나머지 선택 */
  const selectAllButNewest = (group: DuplicateGroup) => {
    // 가장 최근 수정된 파일 찾기
    let newestIdx = 0;
    let newestTime = 0;
    group.files.forEach((f, i) => {
      const t = parseModified(f.modified);
      if (t > newestTime) {
        newestTime = t;
        newestIdx = i;
      }
    });

    setSelectedPaths((prev) => {
      const next = new Set(prev);
      group.files.forEach((f, i) => {
        if (i === newestIdx) {
          next.delete(f.path); // 원본은 선택 해제
        } else {
          next.add(f.path);
        }
      });
      return next;
    });
  };

  /** 전체 자동 선택 (모든 그룹에서 최신 1개 남김) */
  const selectAllGroups = () => {
    if (!scanResult) return;
    const next = new Set<string>();
    scanResult.groups.forEach((group) => {
      let newestIdx = 0;
      let newestTime = 0;
      group.files.forEach((f, i) => {
        const t = parseModified(f.modified);
        if (t > newestTime) {
          newestTime = t;
          newestIdx = i;
        }
      });
      group.files.forEach((f, i) => {
        if (i !== newestIdx) next.add(f.path);
      });
    });
    setSelectedPaths(next);
  };

  /** 전체 선택 해제 */
  const deselectAll = () => {
    setSelectedPaths(new Set());
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

    try {
      const pathsToDelete = Array.from(selectedPaths);
      const res = await invoke<DeleteResult>("delete_duplicate_files", {
        paths: pathsToDelete,
      });
      setDeleteResult(res);
      setSelectedPaths(new Set());
      // 재스캔
      await handleScan();
    } catch (err) {
      alert(`삭제 중 오류 발생: ${err}`);
    } finally {
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

      {/* 드라이브 루트 경고 */}
      {/^[A-Za-z]:\\?$/.test(path.trim()) && (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>드라이브 전체 스캔은 매우 오래 걸리고 프로그램이 멈출 수 있습니다. 특정 폴더를 선택하세요.</span>
        </div>
      )}

      <Card title="스캔 옵션" icon={<FolderSearch className="h-4 w-4" />}>
        {userFolders.length > 0 && (
          <div className="mb-3">
            <div className="flex flex-wrap gap-2">
              <span className="flex items-center text-xs text-[var(--color-muted-foreground)]">빠른 선택:</span>
              {userFolders.map((folder) => {
                const Icon = folderIcons[folder.name] || FolderSearch;
                const isActive = path === folder.path;
                return (
                  <button
                    key={folder.path}
                    onClick={() => setPath(folder.path)}
                    className={`flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-3 py-1.5 text-xs font-medium transition-colors ${
                      isActive
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                        : "border-[var(--color-border)] text-[var(--color-card-foreground)] hover:bg-[var(--color-muted)]"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {folder.name}
                  </button>
                );
              })}
            </div>

            {/* ─ 즐겨찾기 폴더 ─ */}
            {favFolders.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="flex items-center text-xs text-[var(--color-muted-foreground)]">
                  <Star className="mr-1 h-3 w-3 text-amber-500" /> 즐겨찾기:
                </span>
                {favFolders.map((folder) => {
                  const isActive = path === folder.path;
                  return (
                    <div key={folder.path} className="group relative flex items-center">
                      <button
                        onClick={() => setPath(folder.path)}
                        className={`flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-3 py-1.5 text-xs font-medium transition-colors ${
                          isActive
                            ? "border-amber-500 bg-amber-500/10 text-amber-500"
                            : "border-[var(--color-border)] text-[var(--color-card-foreground)] hover:bg-[var(--color-muted)]"
                        }`}
                      >
                        <Star className="h-3 w-3 text-amber-500" />
                        {folder.name}
                      </button>
                      <button
                        onClick={() => removeFavFolder(folder.path)}
                        title="즐겨찾기 해제"
                        className="absolute -right-1 -top-1 hidden rounded-full bg-[var(--color-card)] p-0.5 text-[var(--color-muted-foreground)] shadow-sm transition-colors hover:text-red-500 group-hover:block"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ─ 즐겨찾기 추가 / 현재 경로 즐겨찾기 버튼 ─ */}
            <div className="mt-2 flex gap-2">
              <button
                onClick={async () => {
                  const selected = await open({ multiple: false, directory: true });
                  if (selected) {
                    const p = typeof selected === "string" ? selected : selected;
                    addFavFolder(p);
                    setPath(p);
                  }
                }}
                className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-muted-foreground)] transition-colors hover:border-amber-500 hover:text-amber-500"
              >
                <Plus className="h-3 w-3" />
                즐겨찾기 추가
              </button>
              {path && !favFolders.some((f) => f.path === path) && !userFolders.some((f) => f.path === path) && (
                <button
                  onClick={() => addFavFolder(path)}
                  className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-muted-foreground)] transition-colors hover:border-amber-500 hover:text-amber-500"
                >
                  <Star className="h-3 w-3" />
                  현재 경로를 즐겨찾기에 추가
                </button>
              )}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-semibold text-[var(--color-muted-foreground)]">스캔 경로</label>
            <div className="flex gap-1">
              <input
                type="text"
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                placeholder="C:\Users\Example\Downloads"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleScan(); }}
              />
              <button
                onClick={async () => {
                  const selected = await open({ multiple: false, directory: true });
                  if (selected) setPath(typeof selected === "string" ? selected : selected);
                }}
                title="폴더 선택"
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)]"
              >
                <FolderOpen className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="w-32 space-y-1">
            <label className="text-xs font-semibold text-[var(--color-muted-foreground)]">최소 크기 (KB)</label>
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
              <><RefreshCw className="h-4 w-4 animate-spin" /> 스캔 중...</>
            ) : (
              <><Search className="h-4 w-4 hidden" /> 스캔 시작</>
            )}
          </button>
        </div>
      </Card>

      {/* Delete Result */}
      {deleteResult && (
        <div className={`flex items-start gap-3 rounded-[var(--radius-md)] border p-4 text-sm ${
          deleteResult.failed === 0
            ? "border-green-500/30 bg-green-500/10 text-green-500"
            : "border-amber-500/30 bg-amber-500/10 text-amber-500"
        }`}>
          {deleteResult.failed === 0 ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertTriangle className="h-5 w-5 shrink-0" />}
          <div>
            <p className="font-bold">삭제 완료</p>
            <p className="mt-1 opacity-90">성공: {deleteResult.deleted}개 ({formatSize(deleteResult.freed_bytes)} 확보)</p>
            {deleteResult.failed > 0 && <p className="mt-0.5 font-semibold text-red-500">실패: {deleteResult.failed}개</p>}
          </div>
        </div>
      )}

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
              <p className="mt-1 text-xl font-bold text-[var(--color-card-foreground)]">{scanResult.total_files_scanned.toLocaleString()}개</p>
            </div>
            <div className="rounded-[var(--radius-sm)] bg-[var(--color-card)] border border-[var(--color-border)] p-3 shadow-sm">
              <p className="text-xs text-[var(--color-muted-foreground)]">중복 그룹</p>
              <p className="mt-1 text-xl font-bold text-amber-500">{scanResult.total_groups.toLocaleString()}개</p>
            </div>
            <div className="rounded-[var(--radius-sm)] bg-[var(--color-card)] border border-[var(--color-border)] p-3 shadow-sm">
              <p className="text-xs text-[var(--color-muted-foreground)]">낭비되는 용량</p>
              <p className="mt-1 text-xl font-bold text-red-400">{formatSize(scanResult.total_wasted_bytes)}</p>
            </div>
          </div>

          <Card title="중복 파일 목록 (낭비 용량 순 정렬)" icon={<Copy className="h-4 w-4" />} className="flex-1">
            {scanResult.groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-[var(--color-muted-foreground)]">
                <CheckCircle2 className="mb-4 h-12 w-12 text-green-500/50" />
                <p>발견된 중복 파일이 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* 상단 액션 바 */}
                <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2 gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={selectedPaths.size > 0 ? deselectAll : selectAllGroups}
                      className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-card-foreground)] hover:bg-[var(--color-muted)]"
                    >
                      {selectedPaths.size > 0 ? (
                        <><XSquare className="h-3 w-3" /> 전체 해제</>
                      ) : (
                        <><CheckSquare className="h-3 w-3" /> 전체 자동 선택</>
                      )}
                    </button>
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      {selectedPaths.size}개 선택됨
                    </span>
                  </div>
                  <button
                    onClick={handleDelete}
                    disabled={selectedPaths.size === 0 || deleting}
                    className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deleting ? "삭제 중..." : `선택 항목 삭제 (${selectedPaths.size}개)`}
                  </button>
                </div>

                <div className="space-y-2">
                  {scanResult.groups.map((group) => {
                    const isExpanded = expandedGroups.has(group.hash);
                    const groupSelectedCount = group.files.filter((f) => selectedPaths.has(f.path)).length;

                    return (
                      <div key={group.hash} className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)]">
                        {/* Group Header */}
                        <div
                          className="flex cursor-pointer items-center justify-between bg-[var(--color-muted)]/30 px-3 py-2 transition-colors hover:bg-[var(--color-muted)]/50"
                          onClick={() => toggleGroup(group.hash)}
                        >
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-[var(--color-muted-foreground)]" /> : <ChevronRight className="h-4 w-4 text-[var(--color-muted-foreground)]" />}
                            <HardDrive className="h-4 w-4 text-[var(--color-muted-foreground)]" />
                            <div>
                              <p className="text-sm font-semibold text-[var(--color-foreground)]">{formatSize(group.size_bytes)} × {group.files.length}개</p>
                              <p className="text-[10px] uppercase text-[var(--color-muted-foreground)]">확보 가능: {formatSize(group.wasted_bytes)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-[var(--color-muted-foreground)]">{groupSelectedCount}/{group.files.length} 선택</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); selectAllButNewest(group); }}
                              className="rounded bg-[var(--color-muted)] px-2 py-1 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white"
                            >
                              자동 선택 (최신 1개 남김)
                            </button>
                          </div>
                        </div>

                        {/* Files List */}
                        {isExpanded && (
                          <div className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
                            {group.files.map((file, fIdx) => {
                              // 가장 최근 수정 파일인지 표시
                              let isNewest = false;
                              let newestTime = 0;
                              group.files.forEach((f) => {
                                const t = parseModified(f.modified);
                                if (t > newestTime) newestTime = t;
                              });
                              if (parseModified(file.modified) === newestTime) isNewest = true;

                              return (
                                <div key={fIdx} className="flex items-center gap-3 px-4 py-2 hover:bg-[var(--color-muted)]/20">
                                  <input
                                    type="checkbox"
                                    className="cb-check"
                                    checked={selectedPaths.has(file.path)}
                                    onChange={() => toggleFile(file.path)}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <p className="truncate text-sm text-[var(--color-foreground)]" title={file.path}>
                                      {file.path}
                                    </p>
                                    <p className="text-xs text-[var(--color-muted-foreground)]">
                                      수정일: {file.modified}
                                      {isNewest && (
                                        <span className="ml-2 rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] font-bold text-green-500">
                                          ✔ 최신 (원본)
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => openFolder(file.path)}
                                    title="폴더 열기"
                                    className="shrink-0 rounded-[var(--radius-sm)] p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              );
                            })}
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
