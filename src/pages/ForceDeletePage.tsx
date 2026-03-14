import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Trash2, AlertTriangle, FileWarning, Search, Key, ShieldAlert } from "lucide-react";
import Card from "@/components/common/Card";

/* ── Types ─────────────────────────────────────── */

interface FileCheckResult {
  path: string;
  exists: boolean;
  is_file: boolean;
  is_dir: boolean;
  size_bytes: number;
  locked: boolean;
}

interface ForceDeleteResult {
  path: string;
  success: boolean;
  message: string;
}

/* ── Component ──────────────────────────────────── */

export default function ForceDeletePage() {
  const [path, setPath] = useState("");
  const [status, setStatus] = useState<FileCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<ForceDeleteResult | null>(null);

  const handleCheck = useCallback(async (p: string) => {
    if (!p) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await invoke<FileCheckResult>("check_file_status", { path: p });
      setStatus(res);
    } catch (err) {
      console.error(err);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDelete = async () => {
    if (!status || !status.exists) return;
    if (!confirm(`이 동작은 되돌릴 수 없습니다.\n정말 "${status.path}"을(를) 강제 삭제하시겠습니까?`)) {
      return;
    }

    setDeleting(true);
    setResult(null);
    try {
      const res = await invoke<ForceDeleteResult>("force_delete_path", { path: status.path });
      setResult(res);
      if (res.success) {
        setStatus(null);
        setPath("");
      }
    } catch (err) {
      setResult({
        path: status.path,
        success: false,
        message: String(err),
      });
    } finally {
      setDeleting(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          시스템이나 다른 프로그램이 사용 중이어서 삭제되지 않는 파일/폴더를 강제로 삭제합니다.
        </p>
      </div>

      <Card title="경로 입력" icon={<Search className="h-4 w-4" />}>
        <div className="flex gap-2 py-2">
          <input
            type="text"
            className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            placeholder="C:\Users\Example\locked_file.txt (경로를 입력하거나 붙여넣으세요)"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCheck(path);
            }}
          />
          <button
            onClick={() => handleCheck(path)}
            disabled={loading || !path}
            className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "확인 중..." : "상태 확인"}
          </button>
        </div>
      </Card>

      {/* 확인 결과 */}
      {status && (
        <Card title="파일/폴더 정보" icon={<FileWarning className="h-4 w-4" />}>
          {!status.exists ? (
            <div className="flex items-center gap-3 rounded-[var(--radius-md)] bg-red-500/10 p-4 text-red-500">
              <AlertTriangle className="h-5 w-5" />
              <p className="text-sm font-medium">경로를 찾을 수 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-[var(--radius-sm)] bg-[var(--color-muted)]/30 p-3">
                  <p className="text-xs text-[var(--color-muted-foreground)]">타입</p>
                  <p className="mt-1 font-medium text-[var(--color-card-foreground)]">
                    {status.is_dir ? "폴더" : "파일"}
                  </p>
                </div>
                <div className="rounded-[var(--radius-sm)] bg-[var(--color-muted)]/30 p-3">
                  <p className="text-xs text-[var(--color-muted-foreground)]">크기</p>
                  <p className="mt-1 font-medium text-[var(--color-card-foreground)]">
                    {status.is_dir ? "알 수 없음 (하위 포함안됨)" : formatSize(status.size_bytes)}
                  </p>
                </div>
                <div className="col-span-2 rounded-[var(--radius-sm)] bg-[var(--color-muted)]/30 p-3">
                  <p className="text-xs text-[var(--color-muted-foreground)]">잠금 상태</p>
                  <div className="mt-1 flex items-center gap-2">
                    {status.locked ? (
                      <>
                        <Key className="h-4 w-4 text-amber-500" />
                        <span className="font-medium text-amber-500">다른 프로세스가 사용 중 (잠김)</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="h-4 w-4 text-green-500" />
                        <span className="font-medium text-green-500">잠겨있지 않음 (일반 삭제 가능)</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-[var(--radius-md)] border border-red-500/20 bg-red-500/5 p-4">
                <div className="flex items-start gap-3 text-red-400">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold">주의: 강제 삭제 경고</p>
                    <p className="text-xs text-red-400/80">
                      시스템 파일이나 현재 실행 중인 프로그램의 핵심 파일을 삭제하면 Windows 및 응용 프로그램에 치명적인 오류가 발생할 수 있습니다.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex items-center gap-2 rounded-[var(--radius-md)] bg-red-500 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    {deleting ? "삭제 진행 중..." : "영구 강제 삭제"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* 실행 결과 */}
      {result && (
        <div
          className={`rounded-[var(--radius-md)] p-4 text-sm ${
            result.success
              ? "border border-green-500/30 bg-green-500/10 text-green-500"
              : "border border-red-500/30 bg-red-500/10 text-red-500"
          }`}
        >
          <p className="font-bold">{result.success ? "삭제 성공" : "삭제 실패"}</p>
          <p className="mt-1 opacity-90">{result.message}</p>
        </div>
      )}
    </div>
  );
}
