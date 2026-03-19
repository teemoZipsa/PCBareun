import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Zap,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Gamepad2,
  Code,
  BrainCircuit,
  Globe,
  MessageSquare,
  Music,
  Monitor,
} from "lucide-react";
import Card from "@/components/common/Card";

/* ── Types ── */
interface KillableProcess {
  pid: number;
  name: string;
  memory_mb: number;
  cpu_percent: number;
  category: string;
  description: string;
}

interface KillResult {
  killed: number;
  failed: number;
  freed_mb: number;
}

/* ── Helpers ── */
const categoryInfo: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  browser: { label: "브라우저", icon: Globe, color: "text-sky-400" },
  messenger: { label: "메신저", icon: MessageSquare, color: "text-green-400" },
  media: { label: "미디어", icon: Music, color: "text-purple-400" },
  gaming: { label: "게임", icon: Gamepad2, color: "text-red-400" },
  dev: { label: "개발 도구", icon: Code, color: "text-amber-400" },
  other: { label: "기타", icon: Monitor, color: "text-gray-400" },
};

type PresetMode = "game" | "dev" | "ai";
const presets: { id: PresetMode; label: string; desc: string; icon: React.ElementType; killCategories: string[] }[] = [
  {
    id: "game",
    label: "게임 모드",
    desc: "브라우저, 메신저, 개발 도구 종료",
    icon: Gamepad2,
    killCategories: ["browser", "messenger", "dev", "media", "other"],
  },
  {
    id: "dev",
    label: "개발 모드",
    desc: "게임, 미디어, 메신저 종료",
    icon: Code,
    killCategories: ["gaming", "media", "messenger"],
  },
  {
    id: "ai",
    label: "AI 학습 모드",
    desc: "브라우저, 메신저, 게임, 미디어 전부 종료",
    icon: BrainCircuit,
    killCategories: ["browser", "messenger", "gaming", "media", "other"],
  },
];

/* ── Component ── */
export default function ProcessBoosterPage() {
  const [processes, setProcesses] = useState<KillableProcess[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KillResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [killing, setKilling] = useState(false);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    setResult(null);
    try {
      const res = await invoke<KillableProcess[]>("get_killable_processes");
      setProcesses(res);
      setSelected(new Set());
    } catch (err) {
      setError(String(err));
    } finally {
      setScanning(false);
    }
  }, []);

  const handleKill = async () => {
    if (selected.size === 0) return;
    setKilling(true);
    setError(null);
    try {
      const res = await invoke<KillResult>("kill_processes", { pids: Array.from(selected) });
      setResult(res);
      setSelected(new Set());
      handleScan();
    } catch (err) {
      setError(String(err));
    } finally {
      setKilling(false);
    }
  };

  const applyPreset = (mode: PresetMode) => {
    const preset = presets.find((p) => p.id === mode)!;
    const pids = new Set<number>();
    for (const proc of processes) {
      if (preset.killCategories.includes(proc.category)) pids.add(proc.pid);
    }
    setSelected(pids);
  };

  const toggleProcess = (pid: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  const totalMemory = processes.reduce((s, p) => s + p.memory_mb, 0);
  const selectedMemory = processes
    .filter((p) => selected.has(p.pid))
    .reduce((s, p) => s + p.memory_mb, 0);

  // Group by category
  const grouped = new Map<string, KillableProcess[]>();
  for (const proc of processes) {
    const arr = grouped.get(proc.category) ?? [];
    arr.push(proc);
    grouped.set(proc.category, arr);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted-foreground)]">
        불필요한 백그라운드 프로세스를 종료하여 RAM과 CPU를 확보합니다.
        시스템 필수 프로세스는 보호됩니다.
      </p>

      {/* 프리셋 모드 */}
      <div className="grid grid-cols-3 gap-3">
        {presets.map((preset) => {
          const Icon = preset.icon;
          const presetCount = processes.filter((p) => preset.killCategories.includes(p.category)).length;
          return (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset.id)}
              disabled={processes.length === 0}
              className="flex flex-col items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] p-4 text-left transition-all hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-primary)]/5 disabled:opacity-50"
            >
              <Icon className="h-6 w-6 text-[var(--color-primary)]" />
              <span className="text-sm font-semibold text-[var(--color-card-foreground)]">{preset.label}</span>
              <span className="text-[10px] text-[var(--color-muted-foreground)] text-center">{preset.desc}</span>
              {presetCount > 0 && (
                <span className="rounded-full bg-[var(--color-primary)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-primary)]">
                  {presetCount}개 대상
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 컨트롤 */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleScan}
              disabled={scanning}
              className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110 disabled:opacity-50"
            >
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {scanning ? "스캔 중..." : "프로세스 스캔"}
            </button>
            {processes.length > 0 && (
              <>
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  {processes.length}개 프로세스 · {totalMemory.toFixed(0)} MB 사용 중
                </p>
                <button
                  onClick={() => {
                    const allSelected = selected.size === processes.length;
                    setSelected(allSelected ? new Set() : new Set(processes.map((p) => p.pid)));
                  }}
                  className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] transition-colors"
                >
                  {selected.size === processes.length ? "전체 해제" : "전체 선택"}
                </button>
              </>
            )}
          </div>
          {selected.size > 0 && (
            <button
              onClick={handleKill}
              disabled={killing}
              className="flex items-center gap-2 rounded-[var(--radius-md)] bg-red-500 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-red-600 disabled:opacity-50"
            >
              {killing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {killing
                ? "종료 중..."
                : `${selected.size}개 종료 (${selectedMemory.toFixed(0)} MB)`}
            </button>
          )}
        </div>
      </Card>

      {error && (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-green-500/30 bg-green-500/10 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
          <div>
            <p className="text-sm font-medium text-green-400">
              {result.killed}개 프로세스 종료 완료
              {result.failed > 0 && <span className="text-amber-400"> ({result.failed}개 실패)</span>}
            </p>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              약 <span className="font-semibold text-green-400">{result.freed_mb.toFixed(0)} MB</span> RAM 확보
            </p>
          </div>
        </div>
      )}

      {/* 프로세스 목록 (카테고리별) */}
      {Array.from(grouped.entries()).map(([category, procs]) => {
        const info = categoryInfo[category] || categoryInfo.other;
        const Icon = info.icon;
        const catSelected = procs.filter((p) => selected.has(p.pid)).length;
        return (
          <Card key={category}>
            <div className="flex items-center gap-2 mb-3">
              <Icon className={`h-4 w-4 ${info.color}`} />
              <span className="text-sm font-semibold text-[var(--color-card-foreground)]">
                {info.label}
              </span>
              <span className="text-xs text-[var(--color-muted-foreground)]">
                ({procs.length}개{catSelected > 0 ? ` · ${catSelected}개 선택` : ""})
              </span>
              <button
                onClick={() => {
                  const allSel = procs.every((p) => selected.has(p.pid));
                  setSelected((prev) => {
                    const next = new Set(prev);
                    for (const p of procs) {
                      if (allSel) next.delete(p.pid);
                      else next.add(p.pid);
                    }
                    return next;
                  });
                }}
                className="ml-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
              >
                {procs.every((p) => selected.has(p.pid)) ? "전체 해제" : "전체 선택"}
              </button>
            </div>
            <div className="space-y-1">
              {procs.map((proc) => (
                <label
                  key={proc.pid}
                  className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 transition-colors hover:bg-[var(--color-muted)]/40"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(proc.pid)}
                    onChange={() => toggleProcess(proc.pid)}
                    className="cb-check"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--color-card-foreground)] truncate">
                      {proc.description || proc.name}
                      <span className="ml-2 text-xs text-[var(--color-muted-foreground)]">
                        ({proc.name} · PID {proc.pid})
                      </span>
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-mono text-amber-400">
                    {proc.memory_mb.toFixed(0)} MB
                  </span>
                  <span className="shrink-0 text-xs font-mono text-sky-400">
                    {proc.cpu_percent.toFixed(1)}%
                  </span>
                </label>
              ))}
            </div>
          </Card>
        );
      })}

      {processes.length === 0 && !scanning && (
        <div className="flex flex-col items-center gap-3 py-16">
          <Zap className="h-12 w-12 text-[var(--color-muted-foreground)]" />
          <div className="text-center">
            <p className="text-sm font-medium text-[var(--color-card-foreground)]">
              "프로세스 스캔" 버튼을 눌러 종료 가능한 프로세스를 확인하세요.
            </p>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              시스템 필수 프로세스는 자동으로 보호됩니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
