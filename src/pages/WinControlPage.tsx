import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Shield, Zap, RefreshCw, AlertTriangle, CheckCircle,
  Power, RotateCcw, LogOut, Timer, Play, Square,
  BrainCircuit, Bot,
} from "lucide-react";
import Card from "@/components/common/Card";

/* ════════════════════════════════════════════════════
   Section 1: Windows 업데이트 & 전원 관리
   ════════════════════════════════════════════════════ */

interface WinControlStatus {
  update_paused: boolean;
  current_power_plan: string;
  ultimate_available: boolean;
  recall_disabled: boolean;
  copilot_disabled: boolean;
}

/* ════════════════════════════════════════════════════
   Section 2: 종료 타이머
   ════════════════════════════════════════════════════ */

type Action = "shutdown" | "restart" | "logoff";

interface Preset { label: string; seconds: number }

const PRESETS: Preset[] = [
  { label: "10분", seconds: 600 },
  { label: "30분", seconds: 1800 },
  { label: "1시간", seconds: 3600 },
  { label: "2시간", seconds: 7200 },
  { label: "3시간", seconds: 10800 },
];

const ACTIONS: { key: Action; label: string; icon: React.ReactNode; color: string }[] = [
  { key: "shutdown", label: "시스템 종료", icon: <Power className="h-5 w-5" />, color: "text-red-500" },
  { key: "restart", label: "재시작", icon: <RotateCcw className="h-5 w-5" />, color: "text-amber-500" },
  { key: "logoff", label: "로그오프", icon: <LogOut className="h-5 w-5" />, color: "text-blue-500" },
];

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* ════════════════════════════════════════════════════
   Main Component
   ════════════════════════════════════════════════════ */

export default function WinControlPage() {
  // ── Windows Control state ──
  const [status, setStatus] = useState<WinControlStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionResult, setActionResult] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [acting, setActing] = useState(false);

  // ── Shutdown timer state ──
  const [timerAction, setTimerAction] = useState<Action>("shutdown");
  const [totalSec, setTotalSec] = useState(1800);
  const [remaining, setRemaining] = useState(0);
  const [running, setRunning] = useState(false);
  const [customH, setCustomH] = useState(0);
  const [customM, setCustomM] = useState(30);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Windows Control handlers ──
  const fetchStatus = async () => {
    setLoading(true);
    try {
      const data = await invoke<WinControlStatus>("get_wincontrol_status");
      setStatus(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleToggleUpdate = async () => {
    if (!status) return;
    setActing(true); setActionResult(null);
    try {
      const msg = await invoke<string>("toggle_windows_update", { pause: !status.update_paused });
      setActionResult({ type: "success", msg });
      await fetchStatus();
    } catch (e) { setActionResult({ type: "error", msg: `${e}` }); }
    finally { setActing(false); }
  };

  const handleUltimate = async () => {
    setActing(true); setActionResult(null);
    try {
      const msg = await invoke<string>("activate_ultimate_performance");
      setActionResult({ type: "success", msg });
      await fetchStatus();
    } catch (e) { setActionResult({ type: "error", msg: `${e}` }); }
    finally { setActing(false); }
  };

  const handleToggleRecall = async () => {
    if (!status) return;
    const newVal = !status.recall_disabled;
    setActing(true); setActionResult(null);
    try {
      const msg = await invoke<string>("toggle_recall", { disable: newVal });
      setActionResult({ type: "success", msg });
      // 낙관적 UI 업데이트 — 레지스트리 읽기 지연 방지
      setStatus(prev => prev ? { ...prev, recall_disabled: newVal } : prev);
    } catch (e) { setActionResult({ type: "error", msg: `${e}` }); }
    finally { setActing(false); }
  };

  const handleToggleCopilot = async () => {
    if (!status) return;
    const newVal = !status.copilot_disabled;
    setActing(true); setActionResult(null);
    try {
      const msg = await invoke<string>("toggle_copilot", { disable: newVal });
      setActionResult({ type: "success", msg });
      setStatus(prev => prev ? { ...prev, copilot_disabled: newVal } : prev);
    } catch (e) { setActionResult({ type: "error", msg: `${e}` }); }
    finally { setActing(false); }
  };

  // ── Shutdown timer handlers ──
  const stopTimer = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setRunning(false); setRemaining(0);
  }, []);

  const startTimer = useCallback(() => {
    if (totalSec <= 0) return;
    setRemaining(totalSec); setRunning(true);
  }, [totalSec]);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          invoke("execute_shutdown", { action: timerAction }).catch(console.error);
          stopTimer(); return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, timerAction, stopTimer]);

  const progress = running && totalSec > 0 ? ((totalSec - remaining) / totalSec) * 100 : 0;
  const applyPreset = (sec: number) => { setTotalSec(sec); setCustomH(Math.floor(sec / 3600)); setCustomM(Math.floor((sec % 3600) / 60)); };
  const applyCustom = () => { const sec = customH * 3600 + customM * 60; if (sec > 0) setTotalSec(sec); };
  const timerInfo = ACTIONS.find((a) => a.key === timerAction)!;

  // ── 자동 상태 조회 ──
  useEffect(() => { fetchStatus(); }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[var(--color-foreground)]">Windows 제어</h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">업데이트, 전원 관리, 종료 타이머를 한곳에서 제어합니다.</p>
      </div>

      {actionResult && (
        <div className={`rounded-[var(--radius-md)] border p-3 text-sm ${
          actionResult.type === "success"
            ? "border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success)]"
            : "border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/10 text-[var(--color-destructive)]"
        }`}>
          {actionResult.type === "success" ? "✅" : "❌"} {actionResult.msg}
        </div>
      )}

      {/* ── Section 1: 업데이트 & 전원 ── */}
      {loading && (
        <div className="flex h-20 items-center justify-center">
          <RefreshCw className="h-5 w-5 animate-spin text-[var(--color-muted-foreground)]" />
        </div>
      )}

      {status && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Windows Update */}
          <Card title="Windows 자동 업데이트" icon={<Shield className="h-4 w-4" />}>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {status.update_paused
                  ? <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  : <CheckCircle className="h-5 w-5 text-[var(--color-success)]" />}
                <div>
                  <p className="text-sm font-medium text-[var(--color-card-foreground)]">
                    {status.update_paused ? "업데이트 중지됨" : "업데이트 활성화됨"}
                  </p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    {status.update_paused ? "Windows 자동 업데이트가 차단되어 있습니다." : "Windows 자동 업데이트가 정상 작동 중입니다."}
                  </p>
                </div>
              </div>
              <div className="rounded-[var(--radius-sm)] bg-yellow-500/10 border border-yellow-500/20 p-2 text-xs text-yellow-600 dark:text-yellow-400">
                ⚠️ 장기간 차단 시 보안 취약점 발생 가능. 작업 후 다시 활성화하세요.
              </div>
              <button onClick={handleToggleUpdate} disabled={acting}
                className={`w-full rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium transition-colors ${
                  status.update_paused ? "bg-[var(--color-success)] text-white hover:opacity-90" : "bg-yellow-500 text-white hover:opacity-90"
                }`}>
                {acting ? "처리 중..." : status.update_paused ? "✅ 업데이트 재개" : "⏸️ 업데이트 일시 정지"}
              </button>
            </div>
          </Card>

          {/* Power Plan */}
          <Card title="전원 관리 옵션" icon={<Zap className="h-4 w-4" />}>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Zap className="h-5 w-5 text-[var(--color-primary)]" />
                <div>
                  <p className="text-sm font-medium text-[var(--color-card-foreground)]">현재: {status.current_power_plan || "알 수 없음"}</p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    {status.ultimate_available ? "Ultimate Performance 설치됨" : "Ultimate Performance 설치 가능"}
                  </p>
                </div>
              </div>
              <div className="rounded-[var(--radius-sm)] bg-blue-500/10 border border-blue-500/20 p-2 text-xs text-blue-600 dark:text-blue-400">
                💡 최고 성능 모드: CPU/GPU 전력 제한 해제. 노트북은 배터리 소모 증가.
              </div>
              <button onClick={handleUltimate} disabled={acting}
                className="w-full rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] transition-colors hover:opacity-90">
                {acting ? "처리 중..." : "⚡ 최고 성능(Ultimate Performance) 활성화"}
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* ── Section 1.5: Windows AI 제어 ── */}
      {status && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Recall */}
          <Card title="Windows Recall (AI 타임라인)" icon={<BrainCircuit className="h-4 w-4" />}>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {status.recall_disabled
                  ? <CheckCircle className="h-5 w-5 text-[var(--color-success)]" />
                  : <AlertTriangle className="h-5 w-5 text-yellow-500" />}
                <div>
                  <p className="text-sm font-medium text-[var(--color-card-foreground)]">
                    {status.recall_disabled ? "Recall 비활성화됨" : "Recall 활성화됨"}
                  </p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    화면 활동을 AI가 분석하여 스크린샷으로 저장합니다. 개인정보 위험 우려.
                  </p>
                </div>
              </div>
              <div className="rounded-[var(--radius-sm)] bg-purple-500/10 border border-purple-500/20 p-2 text-xs text-purple-600 dark:text-purple-400">
                🧠 Recall은 PC 활동을 스크린샷으로 기록합니다. 보안이 우려되면 꺼두세요.
              </div>
              <button onClick={handleToggleRecall} disabled={acting}
                className={`w-full rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium transition-colors ${
                  status.recall_disabled ? "bg-purple-500 text-white hover:opacity-90" : "bg-[var(--color-destructive)] text-white hover:opacity-90"
                }`}>
                {acting ? "처리 중..." : status.recall_disabled ? "🧠 Recall 활성화" : "🚫 Recall 비활성화"}
              </button>
            </div>
          </Card>

          {/* Copilot */}
          <Card title="Windows Copilot" icon={<Bot className="h-4 w-4" />}>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {status.copilot_disabled
                  ? <CheckCircle className="h-5 w-5 text-[var(--color-success)]" />
                  : <AlertTriangle className="h-5 w-5 text-yellow-500" />}
                <div>
                  <p className="text-sm font-medium text-[var(--color-card-foreground)]">
                    {status.copilot_disabled ? "Copilot 비활성화됨" : "Copilot 활성화됨"}
                  </p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    Windows 내장 AI 도우미. 필요 없으면 꺼서 리소스 절약.
                  </p>
                </div>
              </div>
              <div className="rounded-[var(--radius-sm)] bg-blue-500/10 border border-blue-500/20 p-2 text-xs text-blue-600 dark:text-blue-400">
                🤖 Copilot 비활성화 시 작업표시줄 Copilot 아이콘이 사라집니다.
              </div>
              <button onClick={handleToggleCopilot} disabled={acting}
                className={`w-full rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium transition-colors ${
                  status.copilot_disabled ? "bg-blue-500 text-white hover:opacity-90" : "bg-[var(--color-destructive)] text-white hover:opacity-90"
                }`}>
                {acting ? "처리 중..." : status.copilot_disabled ? "🤖 Copilot 활성화" : "🚫 Copilot 비활성화"}
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* ── Section 2: 종료 타이머 ── */}
      <Card title="종료 타이머" icon={<Timer className="h-4 w-4" />}>
        <div className="space-y-4">
          {/* Action Select */}
          <div className="flex gap-2">
            {ACTIONS.map((a) => (
              <button key={a.key} onClick={() => !running && setTimerAction(a.key)} disabled={running}
                className={`flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-sm font-medium transition-colors ${
                  timerAction === a.key
                    ? `border-[var(--color-primary)] bg-[var(--color-primary)]/10 ${a.color}`
                    : "border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]/50"
                } disabled:cursor-not-allowed`}>
                {a.icon} {a.label}
              </button>
            ))}
          </div>

          {/* Timer Setting */}
          {!running && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button key={p.seconds} onClick={() => applyPreset(p.seconds)}
                    className={`rounded-[var(--radius-md)] border px-3 py-1.5 text-sm transition-colors ${
                      totalSec === p.seconds
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                        : "border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]/50"
                    }`}>
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--color-muted-foreground)]">직접 입력:</span>
                <input type="number" min={0} max={23} value={customH} onChange={(e) => setCustomH(Number(e.target.value))}
                  className="w-14 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-center text-sm focus:border-[var(--color-primary)] focus:outline-none" />
                <span className="text-xs text-[var(--color-muted-foreground)]">시간</span>
                <input type="number" min={0} max={59} value={customM} onChange={(e) => setCustomM(Number(e.target.value))}
                  className="w-14 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-center text-sm focus:border-[var(--color-primary)] focus:outline-none" />
                <span className="text-xs text-[var(--color-muted-foreground)]">분</span>
                <button onClick={applyCustom} className="rounded-[var(--radius-md)] bg-[var(--color-muted)]/50 px-3 py-1 text-xs font-medium text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)]">적용</button>
              </div>
            </div>
          )}

          {/* Timer Display */}
          <div className="flex flex-col items-center gap-3 py-4">
            {running ? (
              <>
                <div className="relative flex h-36 w-36 items-center justify-center">
                  <svg className="absolute h-full w-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="44" fill="none" stroke="var(--color-border)" strokeWidth="6" />
                    <circle cx="50" cy="50" r="44" fill="none" stroke="var(--color-primary)" strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 44}`} strokeDashoffset={`${2 * Math.PI * 44 * (1 - progress / 100)}`}
                      className="transition-all duration-1000 ease-linear" />
                  </svg>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-[var(--color-card-foreground)] tabular-nums">{formatTime(remaining)}</p>
                    <p className={`mt-1 text-xs font-medium ${timerInfo.color}`}>{timerInfo.label} 예약</p>
                  </div>
                </div>
                <button onClick={stopTimer} className="flex items-center gap-2 rounded-[var(--radius-md)] bg-red-500 px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90">
                  <Square className="h-4 w-4" /> 타이머 취소
                </button>
              </>
            ) : (
              <>
                <p className="text-3xl font-bold text-[var(--color-card-foreground)] tabular-nums">{formatTime(totalSec)}</p>
                <p className="text-sm text-[var(--color-muted-foreground)]">후 {timerInfo.label}</p>
                <button onClick={startTimer} disabled={totalSec <= 0}
                  className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50">
                  <Play className="h-4 w-4" /> 타이머 시작
                </button>
              </>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
