import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  HardDrive,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Shrink,
} from "lucide-react";
import Card from "@/components/common/Card";

/* ── Types ── */
interface VhdxFile {
  path: string;
  size_bytes: number;
  size_display: string;
  source: string;
  distro: string;
}

interface CompactResult {
  path: string;
  before_bytes: number;
  after_bytes: number;
  saved_bytes: number;
  success: boolean;
  error: string;
}

/* ── Helpers ── */
function formatSize(bytes: number) {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/* ── Component ── */
export default function VhdxCompactorPage() {
  const [files, setFiles] = useState<VhdxFile[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compacting, setCompacting] = useState<string | null>(null);
  const [result, setResult] = useState<CompactResult | null>(null);
  const [showConfirm, setShowConfirm] = useState<string | null>(null);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    setResult(null);
    try {
      const res = await invoke<VhdxFile[]>("scan_vhdx_files");
      setFiles(res);
    } catch (err) {
      setError(String(err));
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => { handleScan(); }, []);

  const handleCompact = async (path: string) => {
    setShowConfirm(null);
    setCompacting(path);
    setError(null);
    setResult(null);
    try {
      const res = await invoke<CompactResult>("compact_vhdx", { vhdxPath: path });
      setResult(res);
      handleScan();
    } catch (err) {
      setError(String(err));
    } finally {
      setCompacting(null);
    }
  };

  const totalSize = files.reduce((s, f) => s + f.size_bytes, 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted-foreground)]">
        WSL2 및 Docker가 사용하는 가상 디스크(VHDX) 파일을 탐지하고, 한 번의 클릭으로 용량을 압축합니다.
      </p>

      {/* 경고 배너 */}
      <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <div>
          <p className="font-medium text-[var(--color-card-foreground)]">압축 전 안내</p>
          <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
            VHDX 압축 시 <strong>WSL과 Docker가 자동으로 종료</strong>됩니다.
            실행 중인 컨테이너와 WSL 세션을 먼저 저장해 주세요.
            압축은 관리자 권한이 필요하며 수 분이 소요될 수 있습니다.
          </p>
        </div>
      </div>

      {/* 스캔 버튼 */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--color-card-foreground)]">
              발견된 VHDX: {files.length}개
              {totalSize > 0 && (
                <span className="ml-2 text-[var(--color-muted-foreground)]">
                  (합계 {formatSize(totalSize)})
                </span>
              )}
            </p>
          </div>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110 disabled:opacity-50"
          >
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {scanning ? "스캔 중..." : "VHDX 스캔"}
          </button>
        </div>
      </Card>

      {error && (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 결과 */}
      {result && (
        <div className={`flex items-center gap-3 rounded-[var(--radius-md)] border p-4 ${
          result.success
            ? "border-green-500/30 bg-green-500/10"
            : "border-red-500/30 bg-red-500/10"
        }`}>
          {result.success ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
          )}
          <div>
            <p className={`text-sm font-medium ${result.success ? "text-green-400" : "text-red-400"}`}>
              {result.success ? "압축 완료!" : "압축 실패"}
            </p>
            {result.success && result.saved_bytes > 0 && (
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {formatSize(result.before_bytes)} → {formatSize(result.after_bytes)}
                {" "}
                <span className="font-semibold text-green-400">
                  ({formatSize(result.saved_bytes)} 절약)
                </span>
              </p>
            )}
            {!result.success && result.error && (
              <p className="text-xs text-red-300">{result.error}</p>
            )}
          </div>
        </div>
      )}

      {/* VHDX 파일 목록 */}
      {files.length > 0 && (
        <div className="space-y-3">
          {files.map((file) => (
            <div
              key={file.path}
              className="flex items-center gap-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] p-4"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary)]/10">
                <HardDrive className="h-6 w-6 text-[var(--color-primary)]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-[var(--color-card-foreground)]">
                    {file.source}
                  </p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    file.source === "Docker"
                      ? "bg-sky-500/15 text-sky-400"
                      : "bg-purple-500/15 text-purple-400"
                  }`}>
                    {file.distro}
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-[10px] text-[var(--color-muted-foreground)] truncate">
                  {file.path}
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--color-card-foreground)]">
                  {file.size_display}
                </p>
              </div>

              {compacting === file.path ? (
                <div className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  압축 중...
                </div>
              ) : showConfirm === file.path ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCompact(file.path)}
                    className="rounded-[var(--radius-sm)] bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
                  >
                    WSL 종료 후 압축
                  </button>
                  <button
                    onClick={() => setShowConfirm(null)}
                    className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
                  >
                    취소
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowConfirm(file.path)}
                  disabled={!!compacting}
                  className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 text-sm font-medium text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)] disabled:opacity-50"
                >
                  <Shrink className="h-4 w-4" />
                  최적화
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {files.length === 0 && !scanning && (
        <div className="flex flex-col items-center gap-3 py-16">
          <HardDrive className="h-12 w-12 text-[var(--color-muted-foreground)]" />
          <div className="text-center">
            <p className="text-sm font-medium text-[var(--color-card-foreground)]">
              VHDX 파일을 찾을 수 없습니다
            </p>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              WSL2 또는 Docker Desktop이 설치되어 있지 않거나 아직 사용된 적이 없습니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
