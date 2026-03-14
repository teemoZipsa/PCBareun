import { useState, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Shield,
  Search,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Globe,
  Monitor,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import Card from "@/components/common/Card";

/* ── Types ─────────────────────────────────────── */

interface PrivacyItem {
  id: string;
  name: string;
  group: string;
  size_bytes: number;
  file_count: number;
}

interface CleanResult {
  id: string;
  cleaned_bytes: number;
  cleaned_files: number;
  failed_files: number;
}

interface CleanSummary {
  results: CleanResult[];
  total_cleaned_bytes: number;
  total_cleaned_files: number;
}

type Phase = "idle" | "scanning" | "scanned" | "cleaning" | "done";

/* ── Helpers ───────────────────────────────────── */

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function groupIcon(group: string) {
  if (group.includes("Chrome") || group.includes("Edge") || group.includes("Firefox")) {
    return <Globe className="h-4 w-4" />;
  }
  return <Monitor className="h-4 w-4" />;
}

/* ── Component ──────────────────────────────────── */

export default function PrivacyCleanerPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [items, setItems] = useState<PrivacyItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CleanSummary | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  /* ── grouped items ─── */
  const grouped = useMemo(() => {
    const map = new Map<string, PrivacyItem[]>();
    for (const item of items) {
      const arr = map.get(item.group) ?? [];
      arr.push(item);
      map.set(item.group, arr);
    }
    return map;
  }, [items]);

  /* ── stats ─── */
  const totalSize = useMemo(
    () => items.reduce((s, i) => s + i.size_bytes, 0),
    [items]
  );
  const totalFiles = useMemo(
    () => items.reduce((s, i) => s + i.file_count, 0),
    [items]
  );
  const selectedSize = useMemo(
    () =>
      items
        .filter((i) => selected.has(i.id))
        .reduce((s, i) => s + i.size_bytes, 0),
    [items, selected]
  );
  const selectedCount = useMemo(() => selected.size, [selected]);

  /* ── actions ─── */
  const handleScan = useCallback(async () => {
    setPhase("scanning");
    setError(null);
    setSummary(null);
    try {
      const result = await invoke<PrivacyItem[]>("scan_privacy_items");
      setItems(result);
      setSelected(new Set(result.map((i) => i.id)));
      setCollapsedGroups(new Set());
      setPhase("scanned");
    } catch (err) {
      setError(String(err));
      setPhase("idle");
    }
  }, []);

  const handleClean = useCallback(async () => {
    if (selected.size === 0) return;
    setPhase("cleaning");
    setError(null);
    try {
      const result = await invoke<CleanSummary>("clean_privacy_items", {
        itemIds: Array.from(selected),
      });
      setSummary(result);
      setPhase("done");
    } catch (err) {
      setError(String(err));
      setPhase("scanned");
    }
  }, [selected]);

  /* ── toggle helpers ─── */
  const toggleItem = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (group: string) => {
    const groupItems = grouped.get(group) ?? [];
    const allSelected = groupItems.every((i) => selected.has(i.id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const i of groupItems) {
        if (allSelected) next.delete(i.id);
        else next.add(i.id);
      }
      return next;
    });
  };

  const toggleCollapse = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(items.map((i) => i.id)));
  const selectNone = () => setSelected(new Set());

  /* ── render: idle ─── */
  if (phase === "idle") {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-16">
        <div className="relative">
          <div className="absolute inset-0 animate-pulse rounded-full bg-[var(--color-primary)]/20 blur-xl" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-2 border-[var(--color-primary)]/40 bg-[var(--color-card)]">
            <Shield className="h-10 w-10 text-[var(--color-primary)]" />
          </div>
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-[var(--color-card-foreground)]">
            개인정보 보호
          </h2>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            브라우저 캐시, 쿠키, 방문 기록 및 Windows 임시 파일을 검색하고
            안전하게 정리합니다.
          </p>
        </div>
        {error && (
          <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <button
          onClick={handleScan}
          className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-[var(--color-primary)]/25 transition-all hover:shadow-xl hover:shadow-[var(--color-primary)]/30 hover:brightness-110 active:scale-[0.98]"
        >
          <Search className="h-4 w-4" />
          스캔 시작
        </button>
      </div>
    );
  }

  /* ── render: scanning ─── */
  if (phase === "scanning") {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-[var(--color-primary)]" />
        <p className="text-sm text-[var(--color-muted-foreground)]">
          개인정보 항목을 스캔하고 있습니다...
        </p>
      </div>
    );
  }

  /* ── render: done ─── */
  if (phase === "done" && summary) {
    return (
      <div className="space-y-4">
        {/* 성공 헤더 */}
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/15">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold text-[var(--color-card-foreground)]">
              정리 완료
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
              <span className="font-semibold text-green-500">
                {formatBytes(summary.total_cleaned_bytes)}
              </span>{" "}
              ({summary.total_cleaned_files}개 파일) 정리됨
            </p>
          </div>
        </div>

        {/* 상세 결과 */}
        <Card
          title="정리 상세 결과"
          icon={<Shield className="h-4 w-4" />}
        >
          <div className="space-y-2">
            {summary.results.map((r) => {
              const item = items.find((i) => i.id === r.id);
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-[var(--radius-sm)] bg-[var(--color-muted)]/30 px-3 py-2 text-sm"
                >
                  <span className="text-[var(--color-card-foreground)]">
                    {item ? `${item.group} – ${item.name}` : r.id}
                  </span>
                  <div className="flex items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
                    <span className="text-green-500">
                      {formatBytes(r.cleaned_bytes)}
                    </span>
                    <span>{r.cleaned_files}개 삭제</span>
                    {r.failed_files > 0 && (
                      <span className="text-amber-400">
                        {r.failed_files}개 실패
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* 다시 스캔 */}
        <div className="flex justify-center">
          <button
            onClick={handleScan}
            className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-2 text-sm font-medium text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)]"
          >
            <Search className="h-4 w-4" />
            다시 스캔
          </button>
        </div>
      </div>
    );
  }

  /* ── render: scanned / cleaning ─── */
  return (
    <div className="space-y-4">
      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="발견 항목" value={`${items.length}개`} />
        <StatCard label="전체 크기" value={formatBytes(totalSize)} sub={`${totalFiles.toLocaleString()}개 파일`} />
        <StatCard
          label="선택된 크기"
          value={formatBytes(selectedSize)}
          sub={`${selectedCount}개 항목`}
          highlight
        />
      </div>

      {/* 에러 */}
      {error && (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-xs opacity-60 hover:opacity-100"
          >
            닫기
          </button>
        </div>
      )}

      {/* 전체 선택 / 해제 + 정리 버튼 */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={selectAll}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)]"
            >
              전체 선택
            </button>
            <button
              onClick={selectNone}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)]"
            >
              전체 해제
            </button>
            <button
              onClick={handleScan}
              disabled={phase === "cleaning"}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)] disabled:opacity-50"
            >
              다시 스캔
            </button>
          </div>
          <button
            onClick={handleClean}
            disabled={phase === "cleaning" || selected.size === 0}
            className="flex items-center gap-2 rounded-[var(--radius-md)] bg-red-500 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-red-600 disabled:opacity-50 disabled:hover:bg-red-500"
          >
            {phase === "cleaning" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {phase === "cleaning"
              ? "정리 중..."
              : `선택 항목 정리 (${formatBytes(selectedSize)})`}
          </button>
        </div>
      </Card>

      {/* 그룹별 항목 */}
      {Array.from(grouped.entries()).map(([group, groupItems]) => {
        const groupSelectedCount = groupItems.filter((i) =>
          selected.has(i.id)
        ).length;
        const allSelected = groupSelectedCount === groupItems.length;
        const someSelected =
          groupSelectedCount > 0 && groupSelectedCount < groupItems.length;
        const isCollapsed = collapsedGroups.has(group);
        const groupSize = groupItems.reduce((s, i) => s + i.size_bytes, 0);

        return (
          <Card key={group}>
            {/* 그룹 헤더 */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => toggleCollapse(group)}
                className="text-[var(--color-muted-foreground)] transition-transform"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              {/* 그룹 체크박스 */}
              <label className="relative flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={() => toggleGroup(group)}
                  className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-[var(--color-border)] bg-[var(--color-background)] transition-colors checked:border-[var(--color-primary)] checked:bg-[var(--color-primary)]"
                />
                <svg
                  className="pointer-events-none absolute left-0 top-0 hidden h-4 w-4 text-white peer-checked:block"
                  viewBox="0 0 16 16"
                  fill="none"
                >
                  <path
                    d="M4 8l3 3 5-5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </label>

              {groupIcon(group)}
              <span className="text-sm font-semibold text-[var(--color-card-foreground)]">
                {group}
              </span>
              <span className="text-xs text-[var(--color-muted-foreground)]">
                ({groupItems.length}개 · {formatBytes(groupSize)})
              </span>
            </div>

            {/* 그룹 아이템 */}
            {!isCollapsed && (
              <div className="mt-3 space-y-1 pl-7">
                {groupItems.map((item) => (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 transition-colors hover:bg-[var(--color-muted)]/40"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggleItem(item.id)}
                      className="h-3.5 w-3.5 cursor-pointer appearance-none rounded border border-[var(--color-border)] bg-[var(--color-background)] transition-colors checked:border-[var(--color-primary)] checked:bg-[var(--color-primary)]"
                    />
                    <span className="flex-1 text-sm text-[var(--color-card-foreground)]">
                      {item.name}
                    </span>
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      {item.file_count.toLocaleString()}개 파일
                    </span>
                    <span className="min-w-[64px] text-right text-xs font-medium text-[var(--color-primary)]">
                      {formatBytes(item.size_bytes)}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </Card>
        );
      })}

      {items.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12">
          <CheckCircle2 className="h-10 w-10 text-green-500" />
          <p className="text-sm text-[var(--color-muted-foreground)]">
            정리할 항목이 없습니다. 시스템이 깨끗합니다!
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ────────────────────────────── */

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-[var(--radius-md)] border bg-[var(--color-card)] px-4 py-3 ${highlight
          ? "border-[var(--color-primary)]/30"
          : "border-[var(--color-border)]"
        }`}
    >
      <p className="text-xs text-[var(--color-muted-foreground)]">{label}</p>
      <p
        className={`mt-1 text-lg font-bold ${highlight
            ? "text-[var(--color-primary)]"
            : "text-[var(--color-card-foreground)]"
          }`}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
          {sub}
        </p>
      )}
    </div>
  );
}
