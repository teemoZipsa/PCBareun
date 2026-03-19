import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Calendar,
  Play,
  ToggleLeft,
  ToggleRight,
  Search,
  RefreshCw,
  Loader2,
  Clock,
  ChevronDown,
  ChevronRight,
  Power,
  PowerOff,
} from "lucide-react";
import SkeletonRows from "@/components/common/SkeletonRows";

/* ── Types ─────────────────────────────────────── */

interface ScheduledTask {
  name: string;
  path: string;
  state: string;
  last_run: string;
  next_run: string;
  trigger: string;
  author: string;
  description: string;
}

type SortKey = "name" | "state" | "next_run" | "last_run";
type SortDir = "asc" | "desc";

/* ── Helpers ───────────────────────────────────── */

function stateColor(state: string) {
  switch (state) {
    case "Ready":
      return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
    case "Running":
      return "text-blue-400 bg-blue-500/10 border-blue-500/20";
    case "Disabled":
      return "text-gray-400 bg-gray-500/10 border-gray-500/20";
    case "Queued":
      return "text-amber-400 bg-amber-500/10 border-amber-500/20";
    default:
      return "text-gray-400 bg-gray-500/10 border-gray-500/20";
  }
}

function stateLabel(state: string) {
  switch (state) {
    case "Ready": return "활성";
    case "Running": return "실행중";
    case "Disabled": return "비활성";
    case "Queued": return "대기";
    default: return state;
  }
}

function formatTrigger(raw: string): string {
  if (!raw) return "-";
  if (raw === "Logon") return "로그온 시";
  if (raw === "Boot") return "부팅 시";
  if (raw === "Idle") return "유휴 시";
  if (raw.startsWith("Daily")) return `매일 ${raw.replace("Daily ", "")}`;
  if (raw.startsWith("Weekly")) return `매주 ${raw.replace("Weekly ", "")}`;
  if (raw.startsWith("Time ")) {
    const ts = raw.replace("Time ", "");
    try {
      const d = new Date(ts);
      if (!isNaN(d.getTime())) {
        return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
      }
    } catch { /* fallthrough */ }
  }
  return raw;
}

function formatDateTime(raw: string): string {
  if (!raw) return "-";
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    // 미래 시점
    if (diffMs < 0) {
      const absDiff = -diffMs;
      if (absDiff < 3600000) return `${Math.floor(absDiff / 60000)}분 후`;
      if (absDiff < 86400000) return `${Math.floor(absDiff / 3600000)}시간 후`;
      return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
    }
    // 과거
    if (diffMs < 60000) return "방금";
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}분 전`;
    if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}시간 전`;
    if (diffMs < 604800000) return `${Math.floor(diffMs / 86400000)}일 전`;
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")}`;
  } catch {
    return raw;
  }
}

/* ── Component ──────────────────────────────────── */

export default function TaskSchedulerPage() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [acting, setActing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showDisabled, setShowDisabled] = useState(true);
  const [hideSystemTasks, setHideSystemTasks] = useState(true);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke<ScheduledTask[]>("get_scheduled_tasks");
      setTasks(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const toggleTask = async (t: ScheduledTask) => {
    const enable = t.state === "Disabled";
    setActing(t.path + t.name);
    try {
      await invoke("set_task_enabled", {
        taskName: t.name,
        taskPath: t.path,
        enabled: enable,
      });
      await fetchTasks();
    } catch (err) {
      alert(String(err));
    } finally {
      setActing(null);
    }
  };

  const runNow = async (t: ScheduledTask) => {
    setActing(t.path + t.name);
    try {
      await invoke("run_task_now", {
        taskName: t.name,
        taskPath: t.path,
      });
      await fetchTasks();
    } catch (err) {
      alert(String(err));
    } finally {
      setActing(null);
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SYSTEM_VENDORS = ["\\NVIDIA\\", "\\Intel\\", "\\Google\\", "\\Mozilla\\", "\\Apple\\", "\\Adobe\\", "\\Lenovo\\", "\\HP\\", "\\Dell\\", "\\ASUS\\", "\\Acer\\", "\\Samsung\\", "\\Realtek\\", "\\Overwolf\\"];

  const filtered = tasks
    .filter((t) => {
      if (!showDisabled && t.state === "Disabled") return false;
      if (hideSystemTasks) {
        const pathUpper = t.path.toUpperCase();
        const authorUpper = t.author.toUpperCase();
        if (SYSTEM_VENDORS.some((v) => pathUpper.includes(v.toUpperCase()) || authorUpper.includes(v.replace(/\\/g, "").toUpperCase()))) {
          return false;
        }
      }
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        t.path.toLowerCase().includes(q) ||
        t.author.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const m = sortDir === "asc" ? 1 : -1;
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      return av < bv ? -m : av > bv ? m : 0;
    });

  const readyCount = tasks.filter((t) => t.state === "Ready" || t.state === "Running").length;
  const disabledCount = tasks.filter((t) => t.state === "Disabled").length;

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: "name", label: "이름" },
    { key: "state", label: "상태" },
    { key: "last_run", label: "최근 실행" },
    { key: "next_run", label: "다음 실행" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Windows 예약 작업을 조회하고 활성화/비활성화/즉시 실행할 수 있습니다.
        </p>
        <button
          onClick={fetchTasks}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          새로고침
        </button>
      </div>

      {/* ── 통합 바: 통계 칩 + 검색 + 정렬 + 필터 ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-xs">
          <Calendar className="h-3.5 w-3.5 text-[var(--color-primary)]" />
          <span className="font-bold text-[var(--color-card-foreground)]">{tasks.length}</span>
          <span className="text-[var(--color-muted-foreground)]">전체</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-xs">
          <Power className="h-3.5 w-3.5 text-emerald-400" />
          <span className="font-bold text-emerald-400">{readyCount}</span>
          <span className="text-emerald-400/70">활성</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-gray-500/20 bg-gray-500/5 px-3 py-1.5 text-xs">
          <PowerOff className="h-3.5 w-3.5 text-gray-400" />
          <span className="font-bold text-gray-400">{disabledCount}</span>
          <span className="text-gray-400/70">비활성</span>
        </div>

        {/* 검색 */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
          <input
            type="text"
            className="w-full rounded-full border border-[var(--color-border)] bg-[var(--color-card)] py-1.5 pl-9 pr-3 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            placeholder="작업 이름, 경로, 작성자 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* 정렬 */}
        <div className="flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] p-0.5">
          {sortOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => handleSort(opt.key)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                sortKey === opt.key
                  ? "bg-[var(--color-primary)] text-white"
                  : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              }`}
            >
              {opt.label}
              {sortKey === opt.key && (sortDir === "asc" ? " ↑" : " ↓")}
            </button>
          ))}
        </div>

        {/* 필터 토글 */}
        <button
          onClick={() => setShowDisabled((v) => !v)}
          className={`flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
            showDisabled
              ? "border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
              : "border-[var(--color-border)] text-[var(--color-muted-foreground)]"
          }`}
        >
          {showDisabled ? <ToggleRight className="h-3 w-3" /> : <ToggleLeft className="h-3 w-3" />}
          비활성 표시
        </button>
        <button
          onClick={() => setHideSystemTasks((v) => !v)}
          className={`flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
            hideSystemTasks
              ? "border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
              : "border-[var(--color-border)] text-[var(--color-muted-foreground)]"
          }`}
        >
          {hideSystemTasks ? <ToggleRight className="h-3 w-3" /> : <ToggleLeft className="h-3 w-3" />}
          시스템 숨기기
        </button>
      </div>

      {/* ── 작업 카드 리스트 ── */}
      {loading && tasks.length === 0 ? (
        <SkeletonRows rows={10} cols={5} />
      ) : (
        <div className="space-y-1.5">
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">
              {search ? "검색 결과가 없습니다." : "예약 작업이 없습니다."}
            </p>
          ) : (
            filtered.map((t) => {
              const key = t.path + t.name;
              const isActing = acting === key;
              const isExpanded = expanded === key;
              const isDisabled = t.state === "Disabled";

              return (
                <div key={key} className="group">
                  <div
                    className={`flex items-center gap-3 rounded-[var(--radius-md)] border px-4 py-3 transition-all ${
                      isExpanded
                        ? "border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5"
                        : "border-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-muted)]/20"
                    }`}
                  >
                    {/* 상태 뱃지 */}
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${stateColor(t.state)}`}>
                      {stateLabel(t.state)}
                    </span>

                    {/* 이름 + 트리거 */}
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-medium ${isDisabled ? "text-[var(--color-muted-foreground)]" : "text-[var(--color-card-foreground)]"}`}>
                        {t.name}
                      </p>
                      <div className="mt-0.5 flex items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
                        {t.trigger && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTrigger(t.trigger)}
                          </span>
                        )}
                        {t.author && (
                          <span className="hidden sm:inline truncate max-w-[120px]">{t.author}</span>
                        )}
                      </div>
                    </div>

                    {/* 마지막 실행 / 다음 실행 */}
                    <div className="hidden shrink-0 items-center gap-6 md:flex">
                      <div className="text-right">
                        <p className="text-[10px] text-[var(--color-muted-foreground)]">최근 실행</p>
                        <p className="text-xs font-medium text-[var(--color-card-foreground)]">
                          {formatDateTime(t.last_run)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-[var(--color-muted-foreground)]">다음 실행</p>
                        <p className="text-xs font-medium text-[var(--color-card-foreground)]">
                          {formatDateTime(t.next_run)}
                        </p>
                      </div>
                    </div>

                    {/* 관리 버튼 */}
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => setExpanded(isExpanded ? null : key)}
                        className="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)]/30 hover:text-[var(--color-foreground)]"
                        title="상세 정보"
                      >
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => toggleTask(t)}
                        disabled={isActing}
                        title={isDisabled ? "활성화" : "비활성화"}
                        className={`rounded-[var(--radius-sm)] px-2 py-1.5 text-xs font-medium transition-colors ${
                          isDisabled
                            ? "text-emerald-400 hover:bg-emerald-500/10"
                            : "text-amber-400 hover:bg-amber-500/10"
                        } disabled:opacity-50`}
                      >
                        {isActing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : isDisabled ? (
                          <span className="flex items-center gap-1"><Power className="h-3.5 w-3.5" /> 활성화</span>
                        ) : (
                          <span className="flex items-center gap-1"><PowerOff className="h-3.5 w-3.5" /> 비활성화</span>
                        )}
                      </button>
                      <button
                        onClick={() => runNow(t)}
                        disabled={isActing || isDisabled}
                        title="즉시 실행"
                        className="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1.5 text-xs font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)]/10 disabled:opacity-30"
                      >
                        <Play className="h-3.5 w-3.5" />
                        실행
                      </button>
                    </div>
                  </div>

                  {/* 확장: 상세 정보 */}
                  {isExpanded && (
                    <div className="ml-4 mr-4 mb-2 rounded-b-[var(--radius-md)] border border-t-0 border-[var(--color-primary)]/20 bg-[var(--color-muted)]/10 px-4 py-3">
                      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                        <div>
                          <span className="text-[var(--color-muted-foreground)]">경로: </span>
                          <span className="font-mono text-[var(--color-card-foreground)] break-all">{t.path}</span>
                        </div>
                        {t.author && (
                          <div>
                            <span className="text-[var(--color-muted-foreground)]">작성자: </span>
                            <span className="text-[var(--color-card-foreground)]">{t.author}</span>
                          </div>
                        )}
                        {t.trigger && (
                          <div>
                            <span className="text-[var(--color-muted-foreground)]">트리거: </span>
                            <span className="text-[var(--color-card-foreground)]">{formatTrigger(t.trigger)}</span>
                          </div>
                        )}
                        <div>
                          <span className="text-[var(--color-muted-foreground)]">상태: </span>
                          <span className="text-[var(--color-card-foreground)]">{t.state}</span>
                        </div>
                        {/* 모바일에서만 보이는 실행 정보 */}
                        <div className="md:hidden">
                          <span className="text-[var(--color-muted-foreground)]">최근 실행: </span>
                          <span className="text-[var(--color-card-foreground)]">{formatDateTime(t.last_run)}</span>
                        </div>
                        <div className="md:hidden">
                          <span className="text-[var(--color-muted-foreground)]">다음 실행: </span>
                          <span className="text-[var(--color-card-foreground)]">{formatDateTime(t.next_run)}</span>
                        </div>
                      </div>
                      {t.description && (
                        <p className="mt-2 text-xs text-[var(--color-muted-foreground)] border-t border-[var(--color-border)] pt-2">{t.description}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 하단: 표시 개수 */}
      {filtered.length > 0 && (
        <p className="text-center text-xs text-[var(--color-muted-foreground)]">
          {filtered.length}개 작업 표시 (전체 {tasks.length}개)
        </p>
      )}
    </div>
  );
}
