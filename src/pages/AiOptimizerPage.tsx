import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  BrainCircuit, Search, Trash2, AlertTriangle, Shield,
  Loader2, HardDrive, FileWarning, KeyRound, Eye,
  RefreshCw, ChevronRight, FolderOpen, Network, FolderTree, Container,
} from "lucide-react";
import Card from "@/components/common/Card";
import PortMonitorPage from "@/pages/PortMonitorPage";
import EnvManagerPage from "@/pages/EnvManagerPage";
import VhdxCompactorPage from "@/pages/VhdxCompactorPage";

// ── Types ──

interface AiModelFile {
  path: string;
  name: string;
  size_bytes: number;
  size_display: string;
  extension: string;
  last_modified: string;
}
interface AiModelScanResult {
  files: AiModelFile[];
  total_size_bytes: number;
  total_count: number;
}
interface OllamaModel {
  name: string;
  size_display: string;
  size_bytes: number;
  modified: string;
}
interface OllamaScanResult {
  installed: boolean;
  models: OllamaModel[];
  total_size_bytes: number;
}
interface ExposedSecret {
  file_path: string;
  secret_type: string;
  line_number: number;
  preview: string;
  risk_level: string;
}
interface SecretScanResult {
  secrets: ExposedSecret[];
  total_count: number;
  files_scanned: number;
}

type Tab = "models" | "ollama" | "secrets" | "ports" | "env" | "vhdx";

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

const EXT_COLORS: Record<string, string> = {
  ".gguf": "bg-purple-500/20 text-purple-400",
  ".safetensors": "bg-blue-500/20 text-blue-400",
  ".ckpt": "bg-orange-500/20 text-orange-400",
  ".pt": "bg-green-500/20 text-green-400",
  ".pth": "bg-green-500/20 text-green-400",
  ".bin": "bg-gray-500/20 text-gray-400",
  ".onnx": "bg-cyan-500/20 text-cyan-400",
};

export default function AiOptimizerPage() {
  const [tab, setTab] = useState<Tab>("models");

  // ── AI Model state ──
  const [modelResult, setModelResult] = useState<AiModelScanResult | null>(null);
  const [modelScanning, setModelScanning] = useState(false);
  const [deletingPaths, setDeletingPaths] = useState<Set<string>>(new Set());

  // ── Ollama state ──
  const [ollamaResult, setOllamaResult] = useState<OllamaScanResult | null>(null);
  const [ollamaScanning, setOllamaScanning] = useState(false);
  const [deletingModels, setDeletingModels] = useState<Set<string>>(new Set());

  // ── Secret state ──
  const [secretResult, setSecretResult] = useState<SecretScanResult | null>(null);
  const [secretScanning, setSecretScanning] = useState(false);

  // ── Handlers ──
  const openFolder = async (filePath: string) => {
    try {
      const dir = filePath.replace(/\\[^\\]+$/, '');
      await invoke("open_folder_in_explorer", { path: dir });
    } catch { /* ignore */ }
  };

  const scanModels = async () => {
    setModelScanning(true);
    try { setModelResult(await invoke<AiModelScanResult>("scan_ai_models")); } catch { /* ignore */ }
    setModelScanning(false);
  };

  const deleteModel = async (path: string) => {
    setDeletingPaths(prev => new Set(prev).add(path));
    try {
      await invoke("delete_ai_model", { path });
      setModelResult(prev => prev ? {
        ...prev,
        files: prev.files.filter(f => f.path !== path),
        total_count: prev.total_count - 1,
        total_size_bytes: prev.total_size_bytes - (prev.files.find(f => f.path === path)?.size_bytes || 0),
      } : prev);
    } catch { /* ignore */ }
    setDeletingPaths(prev => { const s = new Set(prev); s.delete(path); return s; });
  };

  const scanOllama = async () => {
    setOllamaScanning(true);
    try { setOllamaResult(await invoke<OllamaScanResult>("scan_ollama_models")); } catch { /* ignore */ }
    setOllamaScanning(false);
  };

  const deleteOllamaModel = async (name: string) => {
    setDeletingModels(prev => new Set(prev).add(name));
    try {
      await invoke("delete_ollama_model", { name });
      setOllamaResult(prev => prev ? {
        ...prev,
        models: prev.models.filter(m => m.name !== name),
        total_size_bytes: prev.total_size_bytes - (prev.models.find(m => m.name === name)?.size_bytes || 0),
      } : prev);
    } catch { /* ignore */ }
    setDeletingModels(prev => { const s = new Set(prev); s.delete(name); return s; });
  };

  const scanSecrets = async () => {
    setSecretScanning(true);
    try { setSecretResult(await invoke<SecretScanResult>("scan_exposed_secrets")); } catch { /* ignore */ }
    setSecretScanning(false);
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "models", label: "AI 모델 스캐너", icon: <HardDrive className="h-4 w-4" /> },
    { key: "ollama", label: "Ollama 관리", icon: <BrainCircuit className="h-4 w-4" /> },
    { key: "secrets", label: "API 키 보안", icon: <KeyRound className="h-4 w-4" /> },
    { key: "ports", label: "포트 점유 관리", icon: <Network className="h-4 w-4" /> },
    { key: "env", label: "환경변수 / PATH", icon: <FolderTree className="h-4 w-4" /> },
    { key: "vhdx", label: "VHDX 압축", icon: <Container className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[var(--color-foreground)] flex items-center gap-2">
          AI 및 개발 환경 최적화
          <span className="inline-flex items-center rounded-full bg-purple-500/20 px-1.5 py-px text-[9px] font-bold leading-none text-purple-400 ring-1 ring-purple-500/30 -translate-y-px">
            Beta
          </span>
        </h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          AI 모델, 개발 캐시, 노출된 API 키를 스캔하여 디스크를 절약하고 보안을 강화합니다.
        </p>
      </div>

      {/* 탭 선택 */}
      <div className="flex gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-1">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-all ${
              tab === t.key
                ? "bg-[var(--color-card)] text-[var(--color-card-foreground)] shadow-sm"
                : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ═══ Tab 1: AI 모델 스캐너 ═══ */}
      {tab === "models" && (
        <Card title="거대 AI 모델 파일 스캐너" icon={<Search className="h-4 w-4" />}>
          <div className="space-y-4">
            <div className="rounded-[var(--radius-sm)] bg-purple-500/10 border border-purple-500/20 p-3 text-xs text-purple-600 dark:text-purple-400">
              🗂️ PC 전체에서 100MB 이상의 AI 모델 파일 (.gguf, .safetensors, .ckpt, .pt 등)을 찾아 용량을 확보합니다.
            </div>

            <button onClick={scanModels} disabled={modelScanning}
              className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-purple-500 px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {modelScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {modelScanning ? "전체 드라이브 스캔 중... (시간 소요)" : "🔍 AI 모델 스캔 시작"}
            </button>

            {modelResult && (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--color-muted)]/50 px-4 py-2">
                  <span className="text-sm text-[var(--color-muted-foreground)]">발견된 모델</span>
                  <span className="text-sm font-bold text-[var(--color-card-foreground)]">
                    {modelResult.total_count}개 · {formatBytes(modelResult.total_size_bytes)}
                  </span>
                </div>

                {modelResult.files.length === 0 ? (
                  <p className="text-center text-sm text-[var(--color-muted-foreground)] py-4">
                    ✨ AI 모델 파일이 발견되지 않았습니다. 깨끗합니다!
                  </p>
                ) : (
                  <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                    {modelResult.files.sort((a, b) => b.size_bytes - a.size_bytes).map(f => (
                      <div key={f.path} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] p-3">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-bold ${EXT_COLORS[f.extension] || "bg-gray-500/20 text-gray-400"}`}>
                          {f.extension}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[var(--color-card-foreground)]">{f.name}</p>
                          <p className="truncate text-xs text-[var(--color-muted-foreground)]">{f.path}</p>
                        </div>
                        <span className="whitespace-nowrap text-sm font-bold text-orange-400">{f.size_display}</span>
                        <button onClick={() => openFolder(f.path)} title="폴더 열기"
                          className="rounded-[var(--radius-sm)] bg-blue-500/10 p-1.5 text-blue-400 hover:bg-blue-500/20">
                          <FolderOpen className="h-4 w-4" />
                        </button>
                        <button onClick={() => deleteModel(f.path)} disabled={deletingPaths.has(f.path)}
                          className="rounded-[var(--radius-sm)] bg-red-500/10 p-1.5 text-red-500 hover:bg-red-500/20 disabled:opacity-50">
                          {deletingPaths.has(f.path) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ═══ Tab 2: Ollama 관리 ═══ */}
      {tab === "ollama" && (
        <Card title="Ollama 로컬 LLM 관리" icon={<BrainCircuit className="h-4 w-4" />}>
          <div className="space-y-4">
            <div className="rounded-[var(--radius-sm)] bg-blue-500/10 border border-blue-500/20 p-3 text-xs text-blue-600 dark:text-blue-400">
              🦙 설치된 Ollama 모델을 확인하고, 안 쓰는 모델을 삭제하여 디스크 용량을 확보합니다.
            </div>

            <button onClick={scanOllama} disabled={ollamaScanning}
              className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-blue-500 px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {ollamaScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {ollamaScanning ? "모델 목록 조회 중..." : "🦙 Ollama 모델 스캔"}
            </button>

            {ollamaResult && (
              <div className="space-y-3">
                {!ollamaResult.installed ? (
                  <p className="text-center text-sm text-[var(--color-muted-foreground)] py-4">
                    Ollama가 설치되어 있지 않습니다.
                  </p>
                ) : ollamaResult.models.length === 0 ? (
                  <p className="text-center text-sm text-[var(--color-muted-foreground)] py-4">
                    ✨ 설치된 Ollama 모델이 없습니다.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--color-muted)]/50 px-4 py-2">
                      <span className="text-sm text-[var(--color-muted-foreground)]">설치된 모델</span>
                      <span className="text-sm font-bold text-[var(--color-card-foreground)]">
                        {ollamaResult.models.length}개 · {formatBytes(ollamaResult.total_size_bytes)}
                      </span>
                    </div>
                    <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                      {ollamaResult.models.map(m => (
                        <div key={m.name} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] p-3">
                          <BrainCircuit className="h-5 w-5 text-blue-400 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-[var(--color-card-foreground)]">{m.name}</p>
                            <p className="text-xs text-[var(--color-muted-foreground)]">{m.modified}</p>
                          </div>
                          <span className="whitespace-nowrap text-sm font-bold text-blue-400">{m.size_display}</span>
                          <button onClick={() => deleteOllamaModel(m.name)} disabled={deletingModels.has(m.name)}
                            className="rounded-[var(--radius-sm)] bg-red-500/10 p-1.5 text-red-500 hover:bg-red-500/20 disabled:opacity-50">
                            {deletingModels.has(m.name) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ═══ Tab 3: API 키 보안 스캔 ═══ */}
      {tab === "secrets" && (
        <Card title="API 키 / 토큰 노출 스캐너" icon={<Shield className="h-4 w-4" />}>
          <div className="space-y-4">
            <div className="rounded-[var(--radius-sm)] bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-600 dark:text-red-400">
              🔑 바탕화면, 문서, 다운로드, 프로젝트 폴더의 텍스트 파일에서 노출된 API 키와 토큰을 검색합니다.
              <br />해킹 및 요금 폭탄 위험이 있는 시크릿을 찾아 경고합니다.
            </div>

            <div className="rounded-[var(--radius-sm)] bg-[var(--color-muted)]/50 p-2 text-xs text-[var(--color-muted-foreground)]">
              <span className="font-medium">탐지 대상:</span> OpenAI (sk-), Claude (sk-ant-), AWS (AKIA), GitHub (ghp_/gho_), Slack (xox), Discord, Google (AIza), HuggingFace (hf_), Telegram, Supabase, MCP 토큰, 제너릭 API 키
            </div>

            <button onClick={scanSecrets} disabled={secretScanning}
              className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-red-500 px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {secretScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              {secretScanning ? "파일 스캔 중..." : "🔍 API 키/토큰 노출 스캔"}
            </button>

            {secretResult && (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--color-muted)]/50 px-4 py-2">
                  <span className="text-sm text-[var(--color-muted-foreground)]">
                    {secretResult.files_scanned.toLocaleString()}개 파일 스캔 완료
                  </span>
                  <span className={`text-sm font-bold ${secretResult.total_count > 0 ? "text-red-500" : "text-[var(--color-success)]"}`}>
                    {secretResult.total_count > 0 ? `⚠️ ${secretResult.total_count}개 발견!` : "✅ 안전합니다"}
                  </span>
                </div>

                {secretResult.secrets.length === 0 ? (
                  <p className="text-center text-sm text-[var(--color-success)] py-4">
                    🛡️ 노출된 API 키나 토큰이 발견되지 않았습니다. 안전합니다!
                  </p>
                ) : (
                  <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                    {secretResult.secrets.map((s, i) => (
                      <div key={`${s.file_path}-${s.line_number}-${i}`}
                        className={`rounded-[var(--radius-md)] border p-3 ${
                          s.risk_level === "high"
                            ? "border-red-500/30 bg-red-500/5"
                            : "border-yellow-500/30 bg-yellow-500/5"
                        }`}>
                        <div className="flex items-start gap-2">
                          {s.risk_level === "high"
                            ? <AlertTriangle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                            : <FileWarning className="h-4 w-4 shrink-0 text-yellow-500 mt-0.5" />}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                s.risk_level === "high" ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"
                              }`}>
                                {s.risk_level === "high" ? "위험" : "주의"}
                              </span>
                              <span className="text-sm font-medium text-[var(--color-card-foreground)]">{s.secret_type}</span>
                            </div>
                            <p className="mt-1 truncate text-xs text-[var(--color-muted-foreground)]">
                              <ChevronRight className="inline h-3 w-3" /> {s.file_path} (줄 {s.line_number})
                            </p>
                            <code className="mt-1 block rounded bg-black/20 px-2 py-1 text-xs text-orange-400 font-mono">
                              {s.preview}
                            </code>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ═══ Tab 4: 포트 점유 관리 ═══ */}
      {tab === "ports" && <PortMonitorPage />}

      {/* ═══ Tab 5: 환경변수 / PATH ═══ */}
      {tab === "env" && <EnvManagerPage />}

      {/* ═══ Tab 6: VHDX 압축 ═══ */}
      {tab === "vhdx" && <VhdxCompactorPage />}
    </div>
  );
}
