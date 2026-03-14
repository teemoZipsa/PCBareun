import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Trash2,
  Search,
  Loader2,
  FolderOpen,
  FileX2,
  Database,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import Card from "@/components/common/Card";

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

type Phase = "select" | "scanning" | "results" | "cleaning" | "done";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/* ── Component ──────────────────────────────────── */

export default function DeepUninstallerPage() {
  const [programs, setPrograms] = useState<InstalledProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<InstalledProgram | null>(null);
  const [phase, setPhase] = useState<Phase>("select");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [checkedFiles, setCheckedFiles] = useState<Set<string>>(new Set());
  const [checkedReg, setCheckedReg] = useState<Set<string>>(new Set());
  const [deleteMsg, setDeleteMsg] = useState("");
  const [error, setError] = useState("");
  const [showFiles, setShowFiles] = useState(true);
  const [showReg, setShowReg] = useState(true);

  useEffect(() => {
    invoke<InstalledProgram[]>("get_installed_programs")
      .then(setPrograms)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = programs.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.publisher.toLowerCase().includes(search.toLowerCase())
  );

  const scanLeftovers = useCallback(async (prog: InstalledProgram) => {
    setSelected(prog);
    setPhase("scanning");
    setError("");
    setScanResult(null);
    try {
      const result = await invoke<ScanResult>("scan_leftovers", {
        programName: prog.name,
        publisher: prog.publisher,
      });
      setScanResult(result);
      // Select all by default
      setCheckedFiles(new Set(result.files.map((f) => f.path)));
      setCheckedReg(new Set(result.registry_keys.map((r) => r.path)));
      setPhase("results");
    } catch (e: any) {
      setError(String(e));
      setPhase("select");
    }
  }, []);

  const deleteSelected = async () => {
    if (!scanResult) return;
    setPhase("cleaning");
    try {
      const msg = await invoke<string>("delete_leftovers", {
        filePaths: Array.from(checkedFiles),
        registryPaths: Array.from(checkedReg),
      });
      setDeleteMsg(msg);
      setPhase("done");
    } catch (e: any) {
      setError(String(e));
      setPhase("results");
    }
  };

  const reset = () => {
    setSelected(null);
    setPhase("select");
    setScanResult(null);
    setDeleteMsg("");
    setCheckedFiles(new Set());
    setCheckedReg(new Set());
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

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted-foreground)]">
        프로그램 제거 후 남은 잔여 파일과 레지스트리 항목을 검색하여
        삭제합니다.
      </p>

      {error && (
        <div className="rounded-[var(--radius-md)] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error}
        </div>
      )}

      {/* Phase: Select Program */}
      {phase === "select" && (
        <Card
          title="프로그램 선택"
          icon={<FolderOpen className="h-4 w-4" />}
          headerRight={
            <span className="text-xs text-[var(--color-muted-foreground)]">
              {programs.length}개 설치됨
            </span>
          }
        >
          <div className="space-y-3 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="프로그램 검색..."
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)] py-2 pl-9 pr-3 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--color-muted-foreground)]" />
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {filtered.map((p) => (
                  <button
                    key={p.registry_key}
                    onClick={() => scanLeftovers(p)}
                    className="flex w-full items-center justify-between rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-muted)]/30"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-[var(--color-card-foreground)]">
                        {p.name}
                      </p>
                      <p className="truncate text-xs text-[var(--color-muted-foreground)]">
                        {p.publisher}
                        {p.version && ` · v${p.version}`}
                      </p>
                    </div>
                    <Search className="ml-2 h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="py-4 text-center text-sm text-[var(--color-muted-foreground)]">
                    검색 결과 없음
                  </p>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Phase: Scanning */}
      {phase === "scanning" && (
        <Card>
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary)]" />
            <p className="text-sm text-[var(--color-muted-foreground)]">
              <span className="font-medium text-[var(--color-card-foreground)]">
                {selected?.name}
              </span>
              의 잔여 파일을 검색 중...
            </p>
          </div>
        </Card>
      )}

      {/* Phase: Results */}
      {(phase === "results" || phase === "cleaning") && scanResult && (
        <>
          <Card
            title={`잔여 항목 검색 결과 — ${selected?.name}`}
            icon={<FileX2 className="h-4 w-4" />}
            headerRight={
              <button
                onClick={reset}
                className="text-xs text-[var(--color-primary)] hover:underline"
              >
                다른 프로그램 선택
              </button>
            }
          >
            <div className="py-2">
              {scanResult.files.length === 0 &&
              scanResult.registry_keys.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                  <p className="text-sm text-emerald-500">
                    잔여 항목이 발견되지 않았습니다.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-[var(--color-muted-foreground)]">
                      파일/폴더:{" "}
                      <strong className="text-[var(--color-card-foreground)]">
                        {scanResult.files.length}
                      </strong>
                      개
                    </span>
                    <span className="text-[var(--color-muted-foreground)]">
                      레지스트리:{" "}
                      <strong className="text-[var(--color-card-foreground)]">
                        {scanResult.registry_keys.length}
                      </strong>
                      개
                    </span>
                    <span className="text-[var(--color-muted-foreground)]">
                      총 크기:{" "}
                      <strong className="text-[var(--color-card-foreground)]">
                        {formatBytes(scanResult.total_size_bytes)}
                      </strong>
                    </span>
                  </div>

                  {/* Files Section */}
                  {scanResult.files.length > 0 && (
                    <div>
                      <button
                        onClick={() => setShowFiles(!showFiles)}
                        className="flex items-center gap-1 text-sm font-medium text-[var(--color-card-foreground)]"
                      >
                        {showFiles ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        파일/폴더 ({scanResult.files.length})
                      </button>
                      {showFiles && (
                        <div className="mt-1 max-h-40 overflow-y-auto rounded-[var(--radius-sm)] bg-[var(--color-background)] p-2">
                          {scanResult.files.map((f) => (
                            <label
                              key={f.path}
                              className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-[var(--color-muted)]/20"
                            >
                              <input
                                type="checkbox"
                                checked={checkedFiles.has(f.path)}
                                onChange={() => toggleFile(f.path)}
                                className="accent-[var(--color-primary)]"
                              />
                              <FolderOpen className="h-3 w-3 shrink-0 text-[var(--color-muted-foreground)]" />
                              <span className="min-w-0 flex-1 truncate font-mono text-[var(--color-muted-foreground)]">
                                {f.path}
                              </span>
                              <span className="shrink-0 text-[var(--color-muted-foreground)]">
                                {formatBytes(f.size_bytes)}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Registry Section */}
                  {scanResult.registry_keys.length > 0 && (
                    <div>
                      <button
                        onClick={() => setShowReg(!showReg)}
                        className="flex items-center gap-1 text-sm font-medium text-[var(--color-card-foreground)]"
                      >
                        {showReg ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        레지스트리 ({scanResult.registry_keys.length})
                      </button>
                      {showReg && (
                        <div className="mt-1 max-h-40 overflow-y-auto rounded-[var(--radius-sm)] bg-[var(--color-background)] p-2">
                          {scanResult.registry_keys.map((r) => (
                            <label
                              key={r.path}
                              className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-[var(--color-muted)]/20"
                            >
                              <input
                                type="checkbox"
                                checked={checkedReg.has(r.path)}
                                onChange={() => toggleReg(r.path)}
                                className="accent-[var(--color-primary)]"
                              />
                              <Database className="h-3 w-3 shrink-0 text-[var(--color-muted-foreground)]" />
                              <span className="min-w-0 flex-1 truncate font-mono text-[var(--color-muted-foreground)]">
                                {r.path}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Delete button */}
                  {(checkedFiles.size > 0 || checkedReg.size > 0) && (
                    <div className="flex items-center gap-3 pt-2">
                      <button
                        onClick={deleteSelected}
                        disabled={phase === "cleaning"}
                        className="flex items-center gap-2 rounded-[var(--radius-md)] bg-red-500 px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {phase === "cleaning" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        선택 항목 삭제 ({checkedFiles.size + checkedReg.size}개)
                      </button>
                      <div className="flex items-center gap-1 text-xs text-amber-500">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        삭제된 항목은 복구할 수 없습니다.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </>
      )}

      {/* Phase: Done */}
      {phase === "done" && (
        <Card>
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p className="text-sm font-medium text-emerald-500">{deleteMsg}</p>
            <button
              onClick={reset}
              className="mt-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)]/30"
            >
              다른 프로그램 정리하기
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
