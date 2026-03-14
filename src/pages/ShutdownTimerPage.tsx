import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Power,
  RotateCcw,
  LogOut,
  Timer,
  Play,
  Square,
  AlertTriangle,
} from "lucide-react";
import Card from "@/components/common/Card";

/* ── Types ─────────────────────────────────────── */

type Action = "shutdown" | "restart" | "logoff";

interface Preset {
  label: string;
  seconds: number;
}

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

/* ── Helpers ───────────────────────────────────── */

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* ── Component ──────────────────────────────────── */

export default function ShutdownTimerPage() {
  const [action, setAction] = useState<Action>("shutdown");
  const [totalSec, setTotalSec] = useState(1800);
  const [remaining, setRemaining] = useState(0);
  const [running, setRunning] = useState(false);
  const [customH, setCustomH] = useState(0);
  const [customM, setCustomM] = useState(30);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setRunning(false);
    setRemaining(0);
  }, []);

  const start = useCallback(() => {
    if (totalSec <= 0) return;
    setRemaining(totalSec);
    setRunning(true);
  }, [totalSec]);

  // countdown tick
  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          invoke("execute_shutdown", { action }).catch(console.error);
          stop();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, action, stop]);

  const progress = running && totalSec > 0 ? ((totalSec - remaining) / totalSec) * 100 : 0;

  const applyPreset = (sec: number) => {
    setTotalSec(sec);
    setCustomH(Math.floor(sec / 3600));
    setCustomM(Math.floor((sec % 3600) / 60));
  };

  const applyCustom = () => {
    const sec = customH * 3600 + customM * 60;
    if (sec > 0) setTotalSec(sec);
  };

  const actionInfo = ACTIONS.find((a) => a.key === action)!;

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted-foreground)]">
        지정한 시간 후 자동으로 시스템 종료, 재시작, 또는 로그오프를 실행합니다.
      </p>

      {/* Action Select */}
      <Card title="동작 선택" icon={<Power className="h-4 w-4" />}>
        <div className="flex gap-2 py-2">
          {ACTIONS.map((a) => (
            <button
              key={a.key}
              onClick={() => !running && setAction(a.key)}
              disabled={running}
              className={`flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] border px-4 py-3 text-sm font-medium transition-colors ${
                action === a.key
                  ? `border-[var(--color-primary)] bg-[var(--color-primary)]/10 ${a.color}`
                  : "border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]/50"
              } disabled:cursor-not-allowed`}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Timer Setting */}
      {!running && (
        <Card title="시간 설정" icon={<Timer className="h-4 w-4" />}>
          <div className="space-y-3 py-2">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.seconds}
                  onClick={() => applyPreset(p.seconds)}
                  className={`rounded-[var(--radius-md)] border px-3 py-1.5 text-sm transition-colors ${
                    totalSec === p.seconds
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                      : "border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]/50"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-muted-foreground)]">직접 입력:</span>
              <input
                type="number"
                min={0}
                max={23}
                value={customH}
                onChange={(e) => setCustomH(Number(e.target.value))}
                className="w-16 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-center text-sm focus:border-[var(--color-primary)] focus:outline-none"
              />
              <span className="text-xs text-[var(--color-muted-foreground)]">시간</span>
              <input
                type="number"
                min={0}
                max={59}
                value={customM}
                onChange={(e) => setCustomM(Number(e.target.value))}
                className="w-16 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-center text-sm focus:border-[var(--color-primary)] focus:outline-none"
              />
              <span className="text-xs text-[var(--color-muted-foreground)]">분</span>
              <button
                onClick={applyCustom}
                className="rounded-[var(--radius-md)] bg-[var(--color-muted)]/50 px-3 py-1 text-xs font-medium text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)]"
              >
                적용
              </button>
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              설정 시간: {formatTime(totalSec)}
            </p>
          </div>
        </Card>
      )}

      {/* Timer Display */}
      <Card>
        <div className="flex flex-col items-center gap-4 py-6">
          {running ? (
            <>
              <div className="relative flex h-44 w-44 items-center justify-center">
                <svg className="absolute h-full w-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="44" fill="none" stroke="var(--color-border)" strokeWidth="6" />
                  <circle
                    cx="50" cy="50" r="44" fill="none"
                    stroke="var(--color-primary)" strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 44}`}
                    strokeDashoffset={`${2 * Math.PI * 44 * (1 - progress / 100)}`}
                    className="transition-all duration-1000 ease-linear"
                  />
                </svg>
                <div className="text-center">
                  <p className="text-3xl font-bold text-[var(--color-card-foreground)] tabular-nums">
                    {formatTime(remaining)}
                  </p>
                  <p className={`mt-1 text-xs font-medium ${actionInfo.color}`}>
                    {actionInfo.label} 예약됨
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-[var(--radius-md)] bg-amber-500/10 px-4 py-2 text-xs text-amber-500">
                <AlertTriangle className="h-4 w-4" />
                타이머 종료 시 {actionInfo.label}이(가) 자동 실행됩니다.
              </div>
              <button
                onClick={stop}
                className="flex items-center gap-2 rounded-[var(--radius-md)] bg-red-500 px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                <Square className="h-4 w-4" />
                타이머 취소
              </button>
            </>
          ) : (
            <>
              <div className="text-center">
                <p className="text-4xl font-bold text-[var(--color-card-foreground)] tabular-nums">
                  {formatTime(totalSec)}
                </p>
                <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                  후 {actionInfo.label}
                </p>
              </div>
              <button
                onClick={start}
                disabled={totalSec <= 0}
                className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                타이머 시작
              </button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
