import { useState, useMemo, useCallback, useEffect } from "react";
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
  TriangleAlert,
  FileX,
  FolderOpen,
  Image,
  Download,
  Bug,
  FileText,
  Zap,
  HardDrive,
  BrainCircuit,
} from "lucide-react";
import Card from "@/components/common/Card";
import SafetyBanner from "@/components/common/SafetyBanner";
import { useScanCacheStore } from "@/store/scanCacheStore";
import { useToastStore } from "@/store/toastStore";

/* ── Types ─────────────────────────────────────── */

interface PrivacyItem {
  id: string;
  name: string;
  group: string;
  size_bytes: number;
  file_count: number;
}

interface TempCategory {
  id: string;
  name: string;
  description: string;
  file_count: number;
  total_size_bytes: number;
  path: string;
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

/* 공통 아이템 (임시파일 + 개인정보 통합) */
interface UnifiedItem {
  id: string;
  name: string;
  group: string;
  size_bytes: number;
  file_count: number;
  source: "temp" | "privacy";
}

type Phase = "idle" | "scanning" | "scanned" | "cleaning" | "done" | "confirming";

const RISKY_KEYWORDS = ["쿠키", "cookie", "로그인", "비밀번호", "password", "자동완성", "autofill"];

/* ── Helpers ───────────────────────────────────── */

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const tempCategoryIcons: Record<string, React.ElementType> = {
  user_temp: FolderOpen,
  win_temp: FileX,
  thumbnail_cache: Image,
  update_cache: Download,
  crash_dumps: Bug,
  win_logs: FileText,
  prefetch: Zap,
  gradio_cache: BrainCircuit,
  huggingface_cache: BrainCircuit,
};

function groupIcon(group: string) {
  if (group.includes("Chrome") || group.includes("Edge") || group.includes("Firefox")) {
    return <Globe className="h-4 w-4" />;
  }
  if (group === "시스템 임시 파일" || group === "AI / 개발 캐시") {
    return <HardDrive className="h-4 w-4" />;
  }
  return <Monitor className="h-4 w-4" />;
}

/* ── Component ──────────────────────────────────── */

export default function TempCleanerPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [items, setItems] = useState<UnifiedItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CleanSummary | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [tempCleanMsg, setTempCleanMsg] = useState<string | null>(null);

  /* ── restore cache on mount ─── */
  const { tempCache, setTempCache } = useScanCacheStore();
  useEffect(() => {
    if (tempCache && phase === "idle") {
      setItems(tempCache.items as UnifiedItem[]);
      setSelected(new Set(tempCache.selected));
      setPhase("scanned");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── grouped items ─── */
  const grouped = useMemo(() => {
    const map = new Map<string, UnifiedItem[]>();
    for (const item of items) {
      const arr = map.get(item.group) ?? [];
      arr.push(item);
      map.set(item.group, arr);
    }
    return map;
  }, [items]);

  /* ── stats ─── */
  const totalSize = useMemo(() => items.reduce((s, i) => s + i.size_bytes, 0), [items]);
  const totalFiles = useMemo(() => items.reduce((s, i) => s + i.file_count, 0), [items]);
  const selectedSize = useMemo(
    () => items.filter((i) => selected.has(i.id)).reduce((s, i) => s + i.size_bytes, 0),
    [items, selected]
  );
  const selectedCount = useMemo(() => selected.size, [selected]);

  /* ── actions ─── */
  const handleScan = useCallback(async () => {
    setPhase("scanning");
    setError(null);
    setSummary(null);
    setTempCleanMsg(null);
    try {
      // 두 스캔을 동시에 실행
      const [privacyResult, tempResult] = await Promise.all([
        invoke<PrivacyItem[]>("scan_privacy_items"),
        invoke<{ categories: TempCategory[] }>("scan_temp_files"),
      ]);

      const unified: UnifiedItem[] = [];

      // 개인정보 항목 변환
      for (const p of privacyResult) {
        unified.push({
          id: `privacy_${p.id}`,
          name: p.name,
          group: p.group,
          size_bytes: p.size_bytes,
          file_count: p.file_count,
          source: "privacy",
        });
      }

      // 임시파일 항목 변환
      const aiCategories = ["gradio_cache", "huggingface_cache"];
      for (const t of tempResult.categories) {
        if (t.file_count === 0) continue;
        unified.push({
          id: `temp_${t.id}`,
          name: t.name,
          group: aiCategories.includes(t.id) ? "AI / 개발 캐시" : "시스템 임시 파일",
          size_bytes: t.total_size_bytes,
          file_count: t.file_count,
          source: "temp",
        });
      }

      setItems(unified);
      setSelected(new Set(unified.map((i) => i.id)));
      setCollapsedGroups(new Set());
      setTempCache(unified, unified.map((i) => i.id));
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

    const privacyIds = Array.from(selected)
      .filter((id) => id.startsWith("privacy_"))
      .map((id) => id.replace("privacy_", ""));

    const tempIds = Array.from(selected)
      .filter((id) => id.startsWith("temp_"))
      .map((id) => id.replace("temp_", ""));

    try {
      let cleanSummary: CleanSummary | null = null;

      // 개인정보 삭제
      if (privacyIds.length > 0) {
        cleanSummary = await invoke<CleanSummary>("clean_privacy_items", {
          itemIds: privacyIds,
        });
      }

      // 임시 파일 삭제
      if (tempIds.length > 0) {
        const tempMsg = await invoke<string>("clean_temp_files", {
          categoryIds: tempIds,
        });
        setTempCleanMsg(tempMsg);
      }

      if (cleanSummary) {
        setSummary(cleanSummary);
      }

      // 토스트 알림
      const totalCleaned = cleanSummary?.total_cleaned_bytes ?? 0;
      const totalFiles = cleanSummary?.total_cleaned_files ?? 0;
      const failedCount = cleanSummary?.results.reduce((s, r) => s + r.failed_files, 0) ?? 0;
      useToastStore.getState().addToast(
        "success",
        `${totalFiles}개 항목 정리 완료 (${formatBytes(totalCleaned)} 확보)`,
        failedCount > 0 ? `⚠️ ${failedCount}개 파일은 접근 권한 부족으로 건너뜀` : undefined
      );

      setPhase("done");
    } catch (err) {
      setError(String(err));
      useToastStore.getState().addToast("error", "정리 실패", String(err));
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
            임시 파일 정리
          </h2>
          <p className="mt-2 max-w-md text-sm text-[var(--color-muted-foreground)]">
            시스템 임시 파일, 브라우저 캐시, 쿠키, 방문 기록 등을 한번에 스캔하여
            불필요한 파일을 정리합니다.
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
          className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-[var(--color-primary)]/25 transition-all hover:shadow-xl hover:brightness-110 active:scale-[0.98]"
        >
          <Search className="h-4 w-4" />
          통합 스캔 시작
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
          임시 파일을 스캔하고 있습니다...
        </p>
      </div>
    );
  }

  /* ── render: done ─── */
  if (phase === "done") {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/15">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold text-[var(--color-card-foreground)]">
              정리 완료
            </h2>
            {summary && (
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                <span className="font-semibold text-green-500">
                  {formatBytes(summary.total_cleaned_bytes)}
                </span>{" "}
                ({summary.total_cleaned_files}개 파일) 정리됨
              </p>
            )}
          </div>
        </div>

        {/* 개인정보 상세 결과 */}
        {summary && summary.results.length > 0 && (
          <Card title="브라우저 정리 결과" icon={<Shield className="h-4 w-4" />}>
            <div className="space-y-2">
              {summary.results.map((r) => {
                const item = items.find((i) => i.id === `privacy_${r.id}`);
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-[var(--radius-sm)] bg-[var(--color-muted)]/30 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate text-[var(--color-card-foreground)]">
                      {item ? `${item.group} – ${item.name}` : r.id}
                    </span>
                    <div className="flex items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
                      <span className="text-green-500">{formatBytes(r.cleaned_bytes)}</span>
                      <span>{r.cleaned_files}개 삭제</span>
                      {r.failed_files > 0 && (
                        <span className="text-amber-400">{r.failed_files}개 실패</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* 임시 파일 결과 */}
        {tempCleanMsg && (
          <div className={`flex items-center gap-2 rounded-[var(--radius-md)] border px-4 py-2.5 text-sm ${
            tempCleanMsg.includes("⚠️")
              ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
              : "border-green-500/30 bg-green-500/10 text-green-400"
          }`}>
            {tempCleanMsg.includes("⚠️") ? (
              <AlertCircle className="h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            )}
            <span>{tempCleanMsg}</span>
          </div>
        )}

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

  /* ── render: confirming ─── */
  if (phase === "confirming") {
    const riskyItems = items.filter(
      (i) =>
        selected.has(i.id) &&
        RISKY_KEYWORDS.some(
          (kw) => i.name.toLowerCase().includes(kw) || i.id.toLowerCase().includes(kw)
        )
    );

    return (
      <div className="mx-auto max-w-lg space-y-4 py-8">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/15">
            <TriangleAlert className="h-8 w-8 text-amber-500" />
          </div>
          <h2 className="text-lg font-bold text-[var(--color-card-foreground)]">
            정말 삭제하시겠습니까?
          </h2>
          <p className="text-center text-sm text-[var(--color-muted-foreground)]">
            선택한 <span className="font-semibold text-[var(--color-foreground)]">{selectedCount}개 항목</span> ({formatBytes(selectedSize)})을 삭제합니다.
            <br />이 작업은 되돌릴 수 없습니다.
          </p>
        </div>

        {riskyItems.length > 0 && (
          <div className="rounded-[var(--radius-md)] border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-500">
              <TriangleAlert className="h-4 w-4" />
              주의: 다음 항목은 로그인 정보를 포함할 수 있습니다
            </div>
            <ul className="mt-2 space-y-1 text-sm text-[var(--color-card-foreground)]">
              {riskyItems.map((item) => (
                <li key={item.id} className="flex items-center gap-2">
                  <span className="text-amber-500">!</span>
                  <span>{item.group} - {item.name}</span>
                  <button
                    onClick={() => toggleItem(item.id)}
                    className="ml-auto text-xs text-red-400 hover:text-red-300"
                  >
                    선택 해제
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-amber-500/80">
              쿠키를 삭제하면 저장된 로그인, 비밀번호, 사이트 설정이 초기화됩니다.
            </p>
          </div>
        )}

        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => setPhase("scanned")}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-6 py-2 text-sm font-medium text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)]"
          >
            취소
          </button>
          <button
            onClick={() => {
              setPhase("scanned");
              handleClean();
            }}
            className="flex items-center gap-2 rounded-[var(--radius-md)] bg-red-500 px-6 py-2 text-sm font-medium text-white transition-all hover:bg-red-600"
          >
            <Trash2 className="h-4 w-4" />
            확인, 삭제합니다
          </button>
        </div>
      </div>
    );
  }

  /* ── render: scanned / cleaning ─── */
  return (
    <div className="space-y-4">
      <SafetyBanner message="임시 파일과 브라우저 캐시를 정리합니다. 쿠키 삭제 시 로그인 정보가 초기화될 수 있습니다." />

      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="발견 항목" value={`${items.length}개`} sub={`${totalFiles.toLocaleString()}개 파일`} />
        <StatCard label="전체 크기" value={formatBytes(totalSize)} />
        <StatCard label="선택된 크기" value={formatBytes(selectedSize)} sub={`${selectedCount}개 항목`} highlight />
      </div>

      {/* 에러 */}
      {error && (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-xs opacity-60 hover:opacity-100">닫기</button>
        </div>
      )}

      {/* 전체 선택 / 해제 + 정리 버튼 */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={selected.size === items.length ? selectNone : selectAll} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)]">
              {selected.size === items.length ? "전체 해제" : "전체 선택"}
            </button>
            <button onClick={handleScan} disabled={phase === "cleaning"} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)] disabled:opacity-50">
              다시 스캔
            </button>
          </div>
          <button
            onClick={() => setPhase("confirming")}
            disabled={phase === "cleaning" || selected.size === 0}
            className="flex items-center gap-2 rounded-[var(--radius-md)] bg-red-500 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-red-600 disabled:opacity-50"
          >
            {phase === "cleaning" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {phase === "cleaning" ? "정리 중..." : `선택 항목 정리 (${formatBytes(selectedSize)})`}
          </button>
        </div>
      </Card>

      {/* 그룹별 항목 */}
      {Array.from(grouped.entries()).map(([group, groupItems]) => {
        const groupSelectedCount = groupItems.filter((i) => selected.has(i.id)).length;
        const allSelected = groupSelectedCount === groupItems.length;
        const someSelected = groupSelectedCount > 0 && groupSelectedCount < groupItems.length;
        const isCollapsed = collapsedGroups.has(group);
        const groupSize = groupItems.reduce((s, i) => s + i.size_bytes, 0);

        return (
          <Card key={group}>
            {/* 그룹 헤더 */}
            <div className="flex items-center gap-3">
              <button onClick={() => toggleCollapse(group)} className="text-[var(--color-muted-foreground)] transition-transform">
                {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              <label className="relative flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected; }}
                  onChange={() => toggleGroup(group)}
                  className="cb-check"
                />
              </label>

              {groupIcon(group)}
              <span className="text-sm font-semibold text-[var(--color-card-foreground)]">{group}</span>
              <span className="text-xs text-[var(--color-muted-foreground)]">
                ({groupItems.length}개 · {formatBytes(groupSize)})
              </span>
            </div>

            {/* 그룹 아이템 */}
            {!isCollapsed && (
              <div className="mt-3 space-y-1 pl-7">
                {groupItems.map((item) => {
                  const TempIcon = item.source === "temp" ? (tempCategoryIcons[item.id.replace("temp_", "")] || FileX) : null;
                  return (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 transition-colors hover:bg-[var(--color-muted)]/40"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggleItem(item.id)}
                        className="cb-check"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-card-foreground)] flex items-center gap-1.5">
                        {TempIcon && <TempIcon className="h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />}
                        {item.name}
                        {RISKY_KEYWORDS.some((kw) => item.name.toLowerCase().includes(kw) || item.id.toLowerCase().includes(kw)) && (
                          <span title="로그인 정보가 포함될 수 있습니다" className="text-amber-500">
                            <TriangleAlert className="h-3 w-3" />
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-xs text-[var(--color-muted-foreground)]">
                        {item.file_count.toLocaleString()}개 파일
                      </span>
                      <span className="min-w-[64px] text-right text-xs font-medium text-[var(--color-primary)]">
                        {formatBytes(item.size_bytes)}
                      </span>
                    </label>
                  );
                })}
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
      className={`rounded-[var(--radius-md)] border bg-[var(--color-card)] px-4 py-3 ${
        highlight ? "border-[var(--color-primary)]/30" : "border-[var(--color-border)]"
      }`}
    >
      <p className="text-xs text-[var(--color-muted-foreground)]">{label}</p>
      <p className={`mt-1 text-lg font-bold ${highlight ? "text-[var(--color-primary)]" : "text-[var(--color-card-foreground)]"}`}>
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">{sub}</p>
      )}
    </div>
  );
}
