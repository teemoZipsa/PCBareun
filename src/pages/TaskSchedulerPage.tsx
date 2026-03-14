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
  Info,
} from "lucide-react";
import Card from "@/components/common/Card";

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

function SortHeader({
  label,
  sortKey,
  current,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  return (
    <th
      className="cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-card-foreground)]"
      onClick={() => onSort(sortKey)}
    >
      {label}
      {current === sortKey && (
        <span className="ml-1">{dir === "asc" ? "▲" : "▼"}</span>
      )}
    </th>
  );
}

function stateColor(state: string) {
  switch (state) {
    case "Ready":
      return "text-green-500 bg-green-500/10";
    case "Running":
      return "text-blue-500 bg-blue-500/10";
    case "Disabled":
      return "text-[var(--color-muted-foreground)] bg-[var(--color-muted)]/30";
    case "Queued":
      return "text-amber-500 bg-amber-500/10";
    default:
      return "text-[var(--color-muted-foreground)] bg-[var(--color-muted)]/30";
  }
}

function stateLabel(state: string) {
  switch (state) {
    case "Ready":
      return "준비됨";
    case "Running":
      return "실행 중";
    case "Disabled":
      return "비활성";
    case "Queued":
      return "대기 중";
    default:
      return state;
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

  const filtered = tasks
    .filter((t) => {
      if (!showDisabled && t.state === "Disabled") return false;
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

  const readyCount = tasks.filter((t) => t.state === "Ready").length;
  const disabledCount = tasks.filter((t) => t.state === "Disabled").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Windows 예약 작업을 조회하고 활성화/비활성화/즉시 실행할 수 있습니다.
          (시스템 작업 제외)
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <div className="flex items-center gap-3 py-1">
            <Calendar className="h-5 w-5 text-[var(--color-primary)]" />
            <div>
              <p className="text-xs text-[var(--color-muted-foreground)]">전체 작업</p>
              <p className="text-lg font-bold text-[var(--color-card-foreground)]">
                {tasks.length}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3 py-1">
            <Play className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-xs text-[var(--color-muted-foreground)]">활성</p>
              <p className="text-lg font-bold text-green-500">{readyCount}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3 py-1">
            <ToggleLeft className="h-5 w-5 text-[var(--color-muted-foreground)]" />
            <div>
              <p className="text-xs text-[var(--color-muted-foreground)]">비활성</p>
              <p className="text-lg font-bold text-[var(--color-muted-foreground)]">
                {disabledCount}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
          <input
            type="text"
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)] py-2 pl-9 pr-3 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            placeholder="작업 이름, 경로, 작성자 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          onClick={() => setShowDisabled((v) => !v)}
          className={`flex items-center gap-1.5 rounded-[var(--radius-md)] border px-3 py-2 text-xs font-medium transition-colors ${
            showDisabled
              ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
              : "border-[var(--color-border)] text-[var(--color-muted-foreground)]"
          }`}
        >
          {showDisabled ? (
            <ToggleRight className="h-3.5 w-3.5" />
          ) : (
            <ToggleLeft className="h-3.5 w-3.5" />
          )}
          비활성 표시
        </button>
      </div>

      {/* Table */}
      {loading && tasks.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-20 text-[var(--color-muted-foreground)]">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>작업 목록을 불러오는 중...</span>
        </div>
      ) : (
        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <SortHeader label="작업 이름" sortKey="name" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="상태" sortKey="state" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                    트리거
                  </th>
                  <SortHeader label="마지막 실행" sortKey="last_run" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="다음 실행" sortKey="next_run" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                    관리
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-10 text-center text-[var(--color-muted-foreground)]"
                    >
                      {search ? "검색 결과가 없습니다." : "예약 작업이 없습니다."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((t) => {
                    const key = t.path + t.name;
                    const isActing = acting === key;
                    const isExpanded = expanded === key;
                    return (
                      <tr
                        key={key}
                        className="transition-colors hover:bg-[var(--color-muted)]/20"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setExpanded(isExpanded ? null : key)}
                              className="text-[var(--color-muted-foreground)] hover:text-[var(--color-card-foreground)]"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </button>
                            <div>
                              <p className="font-medium text-[var(--color-card-foreground)]">
                                {t.name}
                              </p>
                              {isExpanded && (
                                <div className="mt-1 space-y-0.5 text-xs text-[var(--color-muted-foreground)]">
                                  <p>경로: {t.path}</p>
                                  {t.author && <p>작성자: {t.author}</p>}
                                  {t.description && <p>{t.description}</p>}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${stateColor(t.state)}`}
                          >
                            {stateLabel(t.state)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
                          {t.trigger || "-"}
                        </td>
                        <td className="px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
                          {t.last_run ? (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {t.last_run}
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
                          {t.next_run || "-"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => toggleTask(t)}
                              disabled={isActing}
                              title={t.state === "Disabled" ? "활성화" : "비활성화"}
                              className={`rounded-[var(--radius-sm)] p-1.5 transition-colors ${
                                t.state === "Disabled"
                                  ? "text-green-500 hover:bg-green-500/10"
                                  : "text-amber-500 hover:bg-amber-500/10"
                              } disabled:opacity-50`}
                            >
                              {isActing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : t.state === "Disabled" ? (
                                <ToggleRight className="h-4 w-4" />
                              ) : (
                                <ToggleLeft className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              onClick={() => runNow(t)}
                              disabled={isActing || t.state === "Disabled"}
                              title="즉시 실행"
                              className="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)]/10 disabled:opacity-50"
                            >
                              <Play className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="border-t border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-muted-foreground)]">
              {filtered.length}개 작업 표시 (전체 {tasks.length}개)
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
