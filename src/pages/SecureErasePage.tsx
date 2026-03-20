import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  HardDrive,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ShieldOff,
  Trash2,
  RefreshCw,
  ShieldAlert,
  Zap,
  FileX2,
  AlertTriangle,
  Info,
} from "lucide-react";
import Card from "@/components/common/Card";

/* ── Types ─────────────────────────────────────── */

interface PartitionInfo {
  drive_letter: string;
  size_gb: number;
  file_system: string;
}

interface ErasableDrive {
  disk_number: number;
  model: string;
  size_gb: number;
  media_type: string | null;
  bus_type: string;
  partitions: PartitionInfo[];
  is_system: boolean;
  is_frozen: boolean;
}

interface EraseStatus {
  disk_number: number;
  state: "idle" | "running" | "completed" | "failed";
  method: string;
  error: string | null;
}

type EraseMethod = "secure-erase" | "zero-fill";

/* ── Component ──────────────────────────────────── */

export default function SecureErasePage() {
  const [drives, setDrives] = useState<ErasableDrive[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Erase flow state
  const [selectedDisk, setSelectedDisk] = useState<ErasableDrive | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<EraseMethod>("zero-fill");
  const [confirmStep, setConfirmStep] = useState(0); // 0: none, 1: method select, 2: confirm, 3: type name
  const [confirmInput, setConfirmInput] = useState("");
  const [eraseStatus, setEraseStatus] = useState<EraseStatus | null>(null);
  const [completedResult, setCompletedResult] = useState<EraseStatus | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDrives = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const result = await invoke<ErasableDrive[]>("get_erasable_drives");
      setDrives(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDrives();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchDrives]);

  /* ── Polling for erase status ── */
  const startPolling = useCallback(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const status = await invoke<EraseStatus>("get_erase_status");
        setEraseStatus(status);
        if (status.state === "completed" || status.state === "failed") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setCompletedResult(status);
          setEraseStatus(null);
          fetchDrives();
        }
      } catch {
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }, 2000);
  }, [fetchDrives]);

  /* ── Erase flow handlers ── */
  const handleSelectDisk = (disk: ErasableDrive) => {
    setSelectedDisk(disk);
    setSelectedMethod("zero-fill");
    setConfirmStep(1);
    setConfirmInput("");
    setCompletedResult(null);
  };

  const handleConfirmMethod = () => {
    setConfirmStep(2);
  };

  const handleConfirmProceed = () => {
    setConfirmStep(3);
    setConfirmInput("");
  };

  const handleStartErase = async () => {
    if (!selectedDisk) return;
    try {
      await invoke("start_secure_erase", {
        diskNumber: selectedDisk.disk_number,
        method: selectedMethod,
      });
      setConfirmStep(0);
      setEraseStatus({
        disk_number: selectedDisk.disk_number,
        state: "running",
        method: selectedMethod,
        error: null,
      });
      startPolling();
    } catch (err) {
      setCompletedResult({
        disk_number: selectedDisk.disk_number,
        state: "failed",
        method: selectedMethod,
        error: String(err),
      });
      setConfirmStep(0);
    }
  };

  const handleCancel = () => {
    setSelectedDisk(null);
    setConfirmStep(0);
    setConfirmInput("");
  };

  const isErasing = eraseStatus?.state === "running";
  const erasableDrives = drives.filter((d) => !d.is_system);
  const systemDrives = drives.filter((d) => d.is_system);

  /* ── Render ── */

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-3 text-[var(--color-muted-foreground)]">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>드라이브 정보를 불러오는 중...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[var(--color-destructive)]">
          <AlertCircle className="h-8 w-8" />
          <p className="text-sm">{error}</p>
          <button
            onClick={fetchDrives}
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
      {/* ── 경고 배너 ── */}
      <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-red-500/30 bg-red-500/10 px-4 py-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
        <div>
          <p className="text-sm font-medium text-red-500">
            ⚠️ 이 기능은 디스크의 모든 데이터를 영구적으로 삭제합니다
          </p>
          <p className="mt-0.5 text-xs text-red-500/80">
            삭제된 데이터는 어떠한 방법으로도 복구할 수 없습니다. PC를 중고로 처분하거나 양도할 때만 사용하시길 권장합니다.
          </p>
        </div>
      </div>

      {/* ── Header row ── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          보조 드라이브만 표시됩니다. 시스템(OS) 드라이브는 보호되어 삭제할 수 없습니다.
        </p>
        <button
          onClick={fetchDrives}
          disabled={isErasing}
          className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-xs font-medium text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)] disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          새로고침
        </button>
      </div>

      {/* ── 진행 중 상태 ── */}
      {eraseStatus?.state === "running" && (
        <Card>
          <div className="flex items-center gap-4 py-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 animate-pulse">
              <Loader2 className="h-6 w-6 text-amber-400 animate-spin" />
            </div>
            <div>
              <p className="font-semibold text-[var(--color-card-foreground)]">
                디스크 {eraseStatus.disk_number} 삭제 진행 중...
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                {eraseStatus.method === "secure-erase" ? "하드웨어 Secure Erase" : "Zero-Fill (전체 덮어쓰기)"} 방식으로 삭제 중입니다.
                디스크 용량에 따라 수십 분에서 수 시간이 걸릴 수 있습니다.
              </p>
              <p className="mt-1 text-[10px] text-amber-500">
                삭제 도중 프로그램을 종료하거나 PC 전원을 끄지 마세요.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ── 완료/실패 결과 ── */}
      {completedResult && (
        <Card>
          <div className="flex items-center gap-4 py-2">
            {completedResult.state === "completed" ? (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/15">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="font-semibold text-green-500">삭제 완료</p>
                  <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                    디스크 {completedResult.disk_number}의 데이터가 영구적으로 삭제되었습니다.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/15">
                  <AlertCircle className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <p className="font-semibold text-red-500">삭제 실패</p>
                  <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                    {completedResult.error || "알 수 없는 오류가 발생했습니다."}
                  </p>
                  <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">
                    관리자 권한으로 앱을 실행하고 다시 시도해 보세요.
                  </p>
                </div>
              </>
            )}
            <button
              onClick={() => setCompletedResult(null)}
              className="ml-auto text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            >
              닫기
            </button>
          </div>
        </Card>
      )}

      {/* ── 삭제 가능한 드라이브 목록 ── */}
      {erasableDrives.length > 0 ? (
        <div className="space-y-3">
          {erasableDrives.map((disk) => (
            <Card key={disk.disk_number}>
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-blue-500/15">
                  <HardDrive className="h-5 w-5 text-blue-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-[var(--color-card-foreground)]">
                      {disk.model}
                    </h3>
                    <span className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-muted-foreground)]">
                      {disk.media_type || "Unknown"}
                    </span>
                    <span className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-muted-foreground)]">
                      {disk.bus_type}
                    </span>
                    <span className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-muted-foreground)]">
                      Disk {disk.disk_number}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                    {disk.size_gb} GB
                    {disk.partitions.length > 0 && (
                      <> · 파티션: {disk.partitions.map((p) => `${p.drive_letter} (${p.size_gb}GB ${p.file_system})`).join(", ")}</>
                    )}
                    {disk.partitions.length === 0 && " · 파티션 없음"}
                  </p>
                </div>
                <button
                  onClick={() => handleSelectDisk(disk)}
                  disabled={isErasing}
                  className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-red-500 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="h-4 w-4" />
                  완전 삭제
                </button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-12">
          <ShieldOff className="h-10 w-10 text-[var(--color-muted-foreground)]" />
          <p className="text-sm text-[var(--color-muted-foreground)]">
            삭제 가능한 보조 드라이브가 없습니다.
          </p>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            USB 외장 드라이브나 보조 내장 드라이브를 연결하면 여기에 표시됩니다.
          </p>
        </div>
      )}

      {/* ── 시스템 드라이브 (보호됨) ── */}
      {systemDrives.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--color-muted-foreground)]">
            <ShieldAlert className="h-3.5 w-3.5" />
            보호된 시스템 드라이브
          </p>
          {systemDrives.map((disk) => (
            <div
              key={disk.disk_number}
              className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-muted)]/30 px-4 py-3 opacity-60"
            >
              <HardDrive className="h-4 w-4 text-[var(--color-muted-foreground)]" />
              <span className="text-sm text-[var(--color-muted-foreground)]">
                {disk.model} · {disk.size_gb} GB · Disk {disk.disk_number}
                {disk.partitions.length > 0 && ` · ${disk.partitions.map((p) => p.drive_letter).join(", ")}`}
              </span>
              <span className="ml-auto rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-500">
                보호됨
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── 삭제 방식 안내 ── */}
      <Card>
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
          <div className="space-y-2 text-xs text-[var(--color-muted-foreground)]">
            <p className="font-semibold text-[var(--color-card-foreground)]">삭제 방식 안내</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-3">
                <div className="flex items-center gap-1.5 font-medium text-[var(--color-card-foreground)]">
                  <Zap className="h-3.5 w-3.5 text-purple-400" />
                  Secure Erase (하드웨어)
                </div>
                <p className="mt-1 leading-relaxed">
                  SSD 컨트롤러에 직접 초기화 명령을 전송합니다.
                  가장 빠르고 SSD 수명에 영향이 거의 없지만, 일부 환경에서 실패할 수 있습니다.
                </p>
              </div>
              <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-3">
                <div className="flex items-center gap-1.5 font-medium text-[var(--color-card-foreground)]">
                  <FileX2 className="h-3.5 w-3.5 text-orange-400" />
                  Zero-Fill (덮어쓰기)
                </div>
                <p className="mt-1 leading-relaxed">
                  디스크 전체를 0으로 덮어씁니다.
                  모든 드라이브에서 안정적으로 동작하지만 SSD 쓰기 횟수를 소모하며,
                  드라이브 용량에 따라 수 시간 소요됩니다.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ═══════ 삭제 확인 모달 ═══════ */}
      {confirmStep > 0 && selectedDisk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-6 shadow-2xl">

            {/* Step 1 — 방식 선택 */}
            {confirmStep === 1 && (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/15">
                    <ShieldOff className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[var(--color-card-foreground)]">삭제 방식 선택</h3>
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      {selectedDisk.model} · {selectedDisk.size_gb} GB
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border p-3 transition-all ${
                      selectedMethod === "secure-erase"
                        ? "border-purple-500 bg-purple-500/10"
                        : "border-[var(--color-border)] hover:bg-[var(--color-muted)]/50"
                    }`}
                    onClick={() => setSelectedMethod("secure-erase")}
                  >
                    <input
                      type="radio"
                      name="method"
                      checked={selectedMethod === "secure-erase"}
                      onChange={() => setSelectedMethod("secure-erase")}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-card-foreground)]">
                        <Zap className="h-4 w-4 text-purple-400" />
                        Secure Erase (하드웨어)
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                        빠르고 SSD에 최적화. 일부 드라이브에서 실패할 수 있음
                      </p>
                      {selectedDisk.is_frozen && selectedDisk.bus_type === "SATA" && (
                        <p className="mt-1 flex items-center gap-1 text-[10px] text-amber-500">
                          <AlertTriangle className="h-3 w-3" />
                          이 SATA 드라이브는 보안 동결(Frozen) 상태일 수 있어 실패할 가능성이 있습니다
                        </p>
                      )}
                    </div>
                  </label>

                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border p-3 transition-all ${
                      selectedMethod === "zero-fill"
                        ? "border-orange-500 bg-orange-500/10"
                        : "border-[var(--color-border)] hover:bg-[var(--color-muted)]/50"
                    }`}
                    onClick={() => setSelectedMethod("zero-fill")}
                  >
                    <input
                      type="radio"
                      name="method"
                      checked={selectedMethod === "zero-fill"}
                      onChange={() => setSelectedMethod("zero-fill")}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-card-foreground)]">
                        <FileX2 className="h-4 w-4 text-orange-400" />
                        Zero-Fill (덮어쓰기)
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                        안정적이고 모든 드라이브 호환. 시간이 오래 걸림
                      </p>
                    </div>
                  </label>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={handleCancel}
                    className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] py-2 text-sm font-medium text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)]"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleConfirmMethod}
                    className="flex-1 rounded-[var(--radius-md)] bg-red-500 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
                  >
                    다음
                  </button>
                </div>
              </>
            )}

            {/* Step 2 — 최종 경고 */}
            {confirmStep === 2 && (
              <>
                <div className="flex flex-col items-center gap-3 mb-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20">
                    <AlertTriangle className="h-7 w-7 text-red-500" />
                  </div>
                  <h3 className="text-lg font-bold text-red-500">정말 삭제하시겠습니까?</h3>
                </div>

                <div className="rounded-[var(--radius-md)] bg-[var(--color-muted)]/50 p-3 text-sm">
                  <p className="text-[var(--color-card-foreground)]">
                    <strong>{selectedDisk.model}</strong> ({selectedDisk.size_gb} GB)
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                    방식: {selectedMethod === "secure-erase" ? "Secure Erase (하드웨어)" : "Zero-Fill (덮어쓰기)"}
                  </p>
                  {selectedDisk.partitions.length > 0 && (
                    <p className="mt-1 text-xs text-red-400">
                      다음 파티션이 삭제됩니다: {selectedDisk.partitions.map((p) => p.drive_letter).join(", ")}
                    </p>
                  )}
                </div>

                <div className="mt-3 rounded-[var(--radius-md)] border border-red-500/30 bg-red-500/10 px-3 py-2">
                  <p className="text-xs font-medium text-red-500">
                    ⚠️ 이 작업은 되돌릴 수 없습니다. 모든 데이터가 영구적으로 삭제됩니다.
                  </p>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => setConfirmStep(1)}
                    className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] py-2 text-sm font-medium text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)]"
                  >
                    뒤로
                  </button>
                  <button
                    onClick={handleConfirmProceed}
                    className="flex-1 rounded-[var(--radius-md)] bg-red-500 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
                  >
                    삭제 확인
                  </button>
                </div>
              </>
            )}

            {/* Step 3 — 디스크 이름 입력 (최종 안전장치) */}
            {confirmStep === 3 && (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/15">
                    <ShieldOff className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[var(--color-card-foreground)]">최종 확인</h3>
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      실수 방지를 위해 디스크 이름을 직접 입력해주세요
                    </p>
                  </div>
                </div>

                <p className="mb-2 text-sm text-[var(--color-card-foreground)]">
                  아래 칸에 <span className="font-bold text-red-500">"{selectedDisk.model}"</span>을(를) 정확히 입력하세요:
                </p>
                <input
                  type="text"
                  placeholder={selectedDisk.model}
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]/50 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                />

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => setConfirmStep(2)}
                    className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] py-2 text-sm font-medium text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)]"
                  >
                    뒤로
                  </button>
                  <button
                    onClick={handleStartErase}
                    disabled={confirmInput.trim() !== selectedDisk.model.trim()}
                    className="flex-1 rounded-[var(--radius-md)] bg-red-600 py-2 text-sm font-bold text-white transition-all hover:bg-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    🔥 영구 삭제 실행
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
