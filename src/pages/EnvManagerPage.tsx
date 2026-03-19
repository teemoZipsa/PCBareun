import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  FolderTree,
  Loader2,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Terminal,
  XCircle,
  Copy,
  HardDrive,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import Card from "@/components/common/Card";

/* ── Types ── */
interface PathEntry {
  path: string;
  exists: boolean;
  scope: string;
  duplicate: boolean;
  conflict_tool: string;
}

interface DevToolInfo {
  name: string;
  found: boolean;
  version: string;
  path: string;
  conflict: string;
}

interface AiCacheInfo {
  name: string;
  env_var: string;
  current_path: string;
  size_bytes: number;
  exists: boolean;
}

/* ── Helpers ── */
function formatSize(bytes: number) {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/* ── Component ── */
export default function EnvManagerPage() {
  const [pathEntries, setPathEntries] = useState<PathEntry[]>([]);
  const [devTools, setDevTools] = useState<DevToolInfo[]>([]);
  const [aiCaches, setAiCaches] = useState<AiCacheInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"path" | "tools" | "cache">("path");

  const handleScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMsg(null);
    try {
      const [paths, tools, caches] = await Promise.all([
        invoke<PathEntry[]>("get_path_entries"),
        invoke<DevToolInfo[]>("get_dev_tool_versions"),
        invoke<AiCacheInfo[]>("get_ai_cache_info"),
      ]);
      setPathEntries(paths);
      setDevTools(tools);
      setAiCaches(caches);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { handleScan(); }, []);

  const handleRelocate = async (envVar: string) => {
    const selected = await open({ multiple: false, directory: true });
    if (!selected) return;
    const target = typeof selected === "string" ? selected : selected;
    try {
      const result = await invoke<string>("relocate_ai_cache", { envVar, targetPath: target });
      setMsg(result);
      handleScan();
    } catch (err) {
      setError(String(err));
    }
  };

  const invalidPaths = pathEntries.filter((p) => !p.exists);
  const duplicatePaths = pathEntries.filter((p) => p.duplicate);
  const conflictPaths = pathEntries.filter((p) => p.conflict_tool);

  const tabs = [
    { id: "path" as const, label: "PATH 진단", count: invalidPaths.length + duplicatePaths.length + conflictPaths.length },
    { id: "tools" as const, label: "개발 도구", count: devTools.filter((t) => !t.found).length },
    { id: "cache" as const, label: "AI 캐시 관리", count: aiCaches.filter((c) => c.size_bytes > 0).length },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted-foreground)]">
        PATH 환경변수 진단, 개발 도구 버전 확인, AI 모델 캐시 경로 관리를 한곳에서 처리합니다.
      </p>

      {/* 탭 */}
      <div className="flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--color-card)] p-1 border border-[var(--color-border)]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-[var(--color-primary)] text-white"
                : "text-[var(--color-card-foreground)] hover:bg-[var(--color-muted)]"
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${
                activeTab === tab.id ? "bg-white/20" : "bg-amber-500/20 text-amber-500"
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
        <button
          onClick={handleScan}
          disabled={loading}
          className="ml-2 rounded-[var(--radius-sm)] p-2 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)]"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </div>

      {msg && (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-sm text-green-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{msg}</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && pathEntries.length === 0 && (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary)]" />
        </div>
      )}

      {/* ── PATH 진단 ── */}
      {activeTab === "path" && pathEntries.length > 0 && (
        <div className="space-y-3">
          {/* 요약 카드 */}
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] p-3 text-center">
              <p className="text-2xl font-bold text-[var(--color-card-foreground)]">{pathEntries.length}</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">전체 경로</p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-red-500/20 bg-red-500/5 p-3 text-center">
              <p className="text-2xl font-bold text-red-400">{invalidPaths.length}</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">존재하지 않음</p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-amber-500/20 bg-amber-500/5 p-3 text-center">
              <p className="text-2xl font-bold text-amber-400">{duplicatePaths.length}</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">중복</p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-purple-500/20 bg-purple-500/5 p-3 text-center">
              <p className="text-2xl font-bold text-purple-400">{conflictPaths.length}</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">버전 충돌</p>
            </div>
          </div>

          {/* PATH 목록 */}
          <Card title="PATH 항목" icon={<FolderTree className="h-4 w-4" />}>
            <div className="max-h-[400px] space-y-1 overflow-y-auto">
              {pathEntries.map((entry, idx) => (
                <div
                  key={`${entry.path}-${idx}`}
                  className={`flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm ${
                    !entry.exists
                      ? "bg-red-500/5 border border-red-500/20"
                      : entry.duplicate
                      ? "bg-amber-500/5 border border-amber-500/20"
                      : entry.conflict_tool
                      ? "bg-purple-500/5 border border-purple-500/20"
                      : "hover:bg-[var(--color-muted)]/40"
                  }`}
                >
                  {!entry.exists ? (
                    <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                  ) : entry.duplicate ? (
                    <Copy className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  ) : entry.conflict_tool ? (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-purple-400" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
                  )}
                  <span className="flex-1 font-mono text-xs text-[var(--color-card-foreground)] break-all">
                    {entry.path}
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    entry.scope === "System" ? "bg-sky-500/15 text-sky-400" : "bg-green-500/15 text-green-400"
                  }`}>
                    {entry.scope}
                  </span>
                  {!entry.exists && (
                    <span className="shrink-0 text-[10px] font-semibold text-red-400">경로 없음</span>
                  )}
                  {entry.duplicate && (
                    <span className="shrink-0 text-[10px] font-semibold text-amber-400">중복</span>
                  )}
                  {entry.conflict_tool && (
                    <span className="shrink-0 text-[10px] font-semibold text-purple-400">
                      {entry.conflict_tool} 충돌
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ── 개발 도구 ── */}
      {activeTab === "tools" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {devTools.map((tool) => (
            <div
              key={tool.name}
              className={`rounded-[var(--radius-md)] border p-4 ${
                tool.found
                  ? tool.conflict
                    ? "border-amber-500/30 bg-amber-500/5"
                    : "border-[var(--color-border)] bg-[var(--color-card)]"
                  : "border-[var(--color-border)] bg-[var(--color-card)] opacity-60"
              }`}
            >
              <div className="flex items-center gap-2">
                <Terminal className={`h-4 w-4 ${tool.found ? "text-green-500" : "text-[var(--color-muted-foreground)]"}`} />
                <span className="font-medium text-[var(--color-card-foreground)]">{tool.name}</span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  tool.found ? "bg-green-500/15 text-green-400" : "bg-gray-500/15 text-gray-400"
                }`}>
                  {tool.found ? "설치됨" : "미설치"}
                </span>
              </div>
              {tool.found && (
                <>
                  <p className="mt-2 font-mono text-xs text-[var(--color-muted-foreground)] truncate">
                    {tool.version}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-[var(--color-muted-foreground)] truncate">
                    {tool.path}
                  </p>
                </>
              )}
              {tool.conflict && (
                <div className="mt-2 flex items-start gap-1.5 rounded-[var(--radius-sm)] bg-amber-500/10 px-2 py-1.5">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                  <p className="text-[10px] text-amber-400">{tool.conflict}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── AI 캐시 관리 ── */}
      {activeTab === "cache" && (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-sm">
            <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
            <div>
              <p className="font-medium text-[var(--color-card-foreground)]">AI 캐시 경로 이동</p>
              <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                C드라이브에 쌓이는 AI 모델 캐시를 D드라이브 등으로 이동할 수 있습니다.
                기존 데이터를 복사한 뒤 심볼릭 링크를 생성하여 기존 프로그램과의 호환성을 유지합니다.
              </p>
            </div>
          </div>

          {aiCaches.map((cache) => (
            <div
              key={cache.env_var}
              className="flex items-center gap-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] p-4"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[var(--color-card-foreground)]">{cache.name}</p>
                <p className="mt-0.5 font-mono text-xs text-[var(--color-muted-foreground)]">
                  <span className="font-semibold text-sky-400">${cache.env_var}</span>
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-[var(--color-muted-foreground)] truncate">
                  {cache.current_path}
                </p>
                <div className="mt-1 flex items-center gap-3 text-xs">
                  <span className={cache.exists ? "text-green-400" : "text-gray-400"}>
                    {cache.exists ? "✓ 존재" : "✗ 없음"}
                  </span>
                  {cache.size_bytes > 0 && (
                    <span className="font-semibold text-[var(--color-card-foreground)]">
                      {formatSize(cache.size_bytes)}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleRelocate(cache.env_var)}
                className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-xs font-medium text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)]"
              >
                <ArrowRight className="h-3.5 w-3.5" />
                경로 이동
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
