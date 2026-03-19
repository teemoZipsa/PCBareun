import { useState, useCallback, useMemo, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Database,
  Search,
  Wrench,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Shield,
  TriangleAlert,
  ChevronDown,
  ChevronRight,
  Save,
} from "lucide-react";
import Card from "@/components/common/Card";
import SafetyBanner from "@/components/common/SafetyBanner";
import { useScanCacheStore } from "@/store/scanCacheStore";

/* ── Types ─────────────────────────────────────── */

interface RegistryIssue {
  id: string;
  category: string;
  path: string;
  name: string;
  description: string;
  severity: string;
}

interface RegistryScanResult {
  issues: RegistryIssue[];
  total_count: number;
}

interface FailedItem {
  name: string;
  reason: string;
}

interface RegistryFixResult {
  fixed_count: number;
  failed_count: number;
  failed_items: FailedItem[];
}

type Phase = "idle" | "scanning" | "scanned" | "confirm-backup" | "fixing" | "done";

/* ── Helpers ───────────────────────────────────── */

const categoryLabels: Record<string, string> = {
  shared_dll: "존재하지 않는 공유 DLL",
  file_extension: "사용되지 않는 파일 확장자",
  activex: "ActiveX 및 클래스 문제",
  type_library: "형식 라이브러리",
  startup: "시작 시 실행",
  uninstall: "설치 프로그램 / 소프트웨어",
  app_path: "애플리케이션 경로",
  font: "글꼴",
  help_file: "도움말 파일",
  mui_cache: "MUI 캐시",
  sound_event: "사운드 이벤트",
  start_menu: "시작 메뉴 순서",
};

/** 전체 스캔 가능한 카테고리 키 (기본 체크 상태) */
const ALL_CATEGORIES = Object.keys(categoryLabels);

const severityColors: Record<string, string> = {
  low: "text-blue-400",
  medium: "text-amber-400",
  high: "text-red-400",
};

const severityLabels: Record<string, string> = {
  low: "낮음",
  medium: "보통",
  high: "높음",
};

/* ── Component ──────────────────────────────────── */

export default function RegistryCleanerPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [issues, setIssues] = useState<RegistryIssue[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [fixResult, setFixResult] = useState<RegistryFixResult | null>(null);
  /** 스캔할 카테고리 선택 */
  const [scanCategories, setScanCategories] = useState<Set<string>>(new Set(ALL_CATEGORIES));
  /** 접힌 그룹 */
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  /* ── restore cache on mount ─── */
  const { registryCache, setRegistryCache } = useScanCacheStore();
  useEffect(() => {
    if (registryCache && phase === "idle") {
      setIssues(registryCache.issues as RegistryIssue[]);
      setSelected(new Set(registryCache.selected));
      setPhase("scanned");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── grouped ─── */
  const grouped = useMemo(() => {
    const map = new Map<string, RegistryIssue[]>();
    for (const issue of issues) {
      const arr = map.get(issue.category) ?? [];
      arr.push(issue);
      map.set(issue.category, arr);
    }
    return map;
  }, [issues]);

  /* ── actions ─── */
  const handleScan = useCallback(async () => {
    setPhase("scanning");
    setError(null);
    setFixResult(null);
    try {
      const result = await invoke<RegistryScanResult>("scan_registry_issues", {
        categories: Array.from(scanCategories),
      });
      setIssues(result.issues);
      // Auto-select low/medium severity items only
      setSelected(
        new Set(
          result.issues
            .filter((i) => i.severity !== "high")
            .map((i) => i.id),
        ),
      );
      setRegistryCache(
        result.issues,
        result.issues.filter((i) => i.severity !== "high").map((i) => i.id),
      );
      setPhase("scanned");
    } catch (err) {
      setError(String(err));
      setPhase("idle");
    }
  }, []);

  const handleFix = useCallback(() => {
    if (selected.size === 0) return;
    setPhase("confirm-backup");
  }, [selected]);

  const executeFixWithBackup = useCallback(async (withBackup: boolean) => {
    setPhase("fixing");
    setError(null);
    try {
      if (withBackup) {
        await invoke<string>("create_restore_point");
      }
    } catch (err) {
      setError(`복원 지점 생성 실패: ${String(err)} — 백업 없이 계속 진행합니다.`);
    }
    try {
      const result = await invoke<RegistryFixResult>("fix_registry_issues", {
        issueIds: Array.from(selected),
        issuesJson: JSON.stringify(issues),
      });
      setFixResult(result);
      setPhase("done");
    } catch (err) {
      setError(String(err));
      setPhase("scanned");
    }
  }, [selected, issues]);

  /* ── toggles ─── */
  const toggleItem = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (category: string) => {
    const groupIssues = grouped.get(category) ?? [];
    const allSelected = groupIssues.every((i) => selected.has(i.id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const issue of groupIssues) {
        if (allSelected) next.delete(issue.id);
        else next.add(issue.id);
      }
      return next;
    });
  };

  const toggleCollapse = (category: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(issues.map((i) => i.id)));
  const selectNone = () => setSelected(new Set());

  /* ── render: idle ─── */
  if (phase === "idle") {
    const toggleCategory = (cat: string) => {
      setScanCategories((prev) => {
        const next = new Set(prev);
        if (next.has(cat)) next.delete(cat);
        else next.add(cat);
        return next;
      });
    };
    const selectAllCats = () => setScanCategories(new Set(ALL_CATEGORIES));
    const selectNoneCats = () => setScanCategories(new Set());

    return (
      <div className="flex gap-6">
        {/* ── 좌측: 카테고리 선택 ── */}
        <div className="w-64 shrink-0 space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-card-foreground)]">
            <Database className="h-4 w-4" />
            레지스트리 클리너
          </h3>
          <div className="space-y-0.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] p-2">
            {ALL_CATEGORIES.map((cat) => (
              <label
                key={cat}
                className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm transition-colors hover:bg-[var(--color-muted)]/50"
              >
                <input
                  type="checkbox"
                  checked={scanCategories.has(cat)}
                  onChange={() => toggleCategory(cat)}
                  className="cb-check"
                />
                <span className="text-[var(--color-card-foreground)]">
                  {categoryLabels[cat]}
                </span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={scanCategories.size === ALL_CATEGORIES.length ? selectNoneCats : selectAllCats}
              className="flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] py-1 text-xs text-[var(--color-card-foreground)] hover:bg-[var(--color-muted)]"
            >
              {scanCategories.size === ALL_CATEGORIES.length ? "전체 해제" : "전체 선택"}
            </button>
          </div>
        </div>

        {/* ── 우측: 스캔 버튼 영역 ── */}
        <div className="flex flex-1 flex-col items-center justify-center gap-6 py-16">
          <div className="relative">
            <div className="absolute inset-0 animate-pulse rounded-full bg-[var(--color-primary)]/20 blur-xl" />
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-2 border-[var(--color-primary)]/40 bg-[var(--color-card)]">
              <Database className="h-10 w-10 text-[var(--color-primary)]" />
            </div>
          </div>
          <div className="text-center">
            <h2 className="text-xl font-bold text-[var(--color-card-foreground)]">
              레지스트리 정리
            </h2>
            <p className="mt-2 max-w-md text-sm text-[var(--color-muted-foreground)]">
              좌측에서 스캔할 카테고리를 선택한 후 스캔 버튼을 눌러주세요.
              사용하지 않는 레지스트리 항목을 안전하게 정리합니다.
            </p>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              선택된 카테고리: {scanCategories.size}개 / {ALL_CATEGORIES.length}개
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
            disabled={scanCategories.size === 0}
            className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-[var(--color-primary)]/25 transition-all hover:shadow-xl hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
          >
            <Search className="h-4 w-4" />
            레지스트리 스캔
          </button>
        </div>
      </div>
    );
  }

  /* ── render: scanning ─── */
  if (phase === "scanning") {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-[var(--color-primary)]" />
        <p className="text-sm text-[var(--color-muted-foreground)]">
          레지스트리를 스캔하고 있습니다... 잠시만 기다려주세요.
        </p>
      </div>
    );
  }

  /* ── render: confirm-backup ─── */
  if (phase === "confirm-backup") {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-16">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-amber-500/40 bg-[var(--color-card)]">
          <Save className="h-8 w-8 text-amber-500" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold text-[var(--color-card-foreground)]">
            레지스트리 수정 전 백업
          </h2>
          <p className="mt-2 max-w-sm text-sm text-[var(--color-muted-foreground)]">
            Windows 복원 지점을 생성하면 문제 발생 시 이전 상태로 되돌릴 수 있습니다.
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            선택 항목: {selected.size}개
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => executeFixWithBackup(true)}
            className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white transition-all hover:brightness-110"
          >
            <Save className="h-4 w-4" />
            백업 후 진행
          </button>
          <button
            onClick={() => executeFixWithBackup(false)}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-2.5 text-sm font-medium text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)]"
          >
            백업 없이 진행
          </button>
          <button
            onClick={() => setPhase("scanned")}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-5 py-2.5 text-sm text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)]"
          >
            취소
          </button>
        </div>
      </div>
    );
  }

  /* ── render: done ─── */
  if (phase === "done" && fixResult) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/15">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold text-[var(--color-card-foreground)]">
              레지스트리 정리 완료
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
              <span className="font-semibold text-green-500">
                {fixResult.fixed_count}개
              </span>{" "}
              항목 수정 완료
              {fixResult.failed_count > 0 && (
                <span className="text-amber-400">
                  , {fixResult.failed_count}개 실패
                </span>
              )}
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {fixResult.failed_items.length > 0 && (
          <FailedItemsList items={fixResult.failed_items} />
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

  /* ── render: scanned / fixing ─── */
  return (
    <div className="space-y-4">
      <SafetyBanner message="사용하지 않는 레지스트리만 검색합니다. Windows 핵심 레지스트리는 건드리지 않습니다." />
      {/* 통계 */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="발견된 문제" value={`${issues.length}개`} />
        <StatCard
          label="위험도 높음"
          value={`${issues.filter((i) => i.severity === "high").length}개`}
          highlight
        />
        <StatCard
          label="선택됨"
          value={`${selected.size}개`}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 경고 */}
      <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm">
        <Shield className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <div>
          <p className="font-medium text-[var(--color-card-foreground)]">
            안전 안내
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
            위험도가 "높음"인 항목(서비스 등)은 주의가 필요합니다. 확실하지 않은 항목은 선택 해제하세요.
            레지스트리 수정 전 Windows 복원 지점을 만드는 것을 권장합니다.
          </p>
        </div>
      </div>

      {/* 버튼 */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={selected.size === issues.length ? selectNone : selectAll} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)]">
              {selected.size === issues.length ? "전체 해제" : "전체 선택"}
            </button>
            <button onClick={handleScan} disabled={phase === "fixing"} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)] disabled:opacity-50">
              다시 스캔
            </button>
          </div>
          <button
            onClick={handleFix}
            disabled={phase === "fixing" || selected.size === 0}
            className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110 disabled:opacity-50"
          >
            {phase === "fixing" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wrench className="h-4 w-4" />
            )}
            {phase === "fixing" ? "수정 중..." : `선택 항목 수정 (${selected.size}개)`}
          </button>
        </div>
      </Card>

      {/* 카테고리별 목록 (그룹 체크박스 + 접기/펼치기) */}
      {Array.from(grouped.entries()).map(([category, catIssues]) => {
        const groupSelectedCount = catIssues.filter((i) => selected.has(i.id)).length;
        const allSelected = groupSelectedCount === catIssues.length;
        const someSelected = groupSelectedCount > 0 && groupSelectedCount < catIssues.length;
        const isCollapsed = collapsedGroups.has(category);

        return (
          <Card key={category}>
            {/* 그룹 헤더 */}
            <div className="flex items-center gap-3">
              <button onClick={() => toggleCollapse(category)} className="text-[var(--color-muted-foreground)] transition-transform">
                {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              <label className="relative flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected; }}
                  onChange={() => toggleGroup(category)}
                  className="cb-check"
                />
              </label>

              <Database className="h-4 w-4 text-[var(--color-primary)]" />
              <span className="text-sm font-semibold text-[var(--color-card-foreground)]">
                {categoryLabels[category] || category}
              </span>
              <span className="text-xs text-[var(--color-muted-foreground)]">
                ({catIssues.length}개 · {groupSelectedCount}개 선택)
              </span>
            </div>

            {/* 그룹 아이템 */}
            {!isCollapsed && (
              <div className="mt-3 space-y-1 pl-7">
                {catIssues.map((issue) => (
                  <label
                    key={issue.id}
                    className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 transition-colors hover:bg-[var(--color-muted)]/40"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(issue.id)}
                      onChange={() => toggleItem(issue.id)}
                      className="cb-check"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--color-card-foreground)] truncate">
                        {issue.name}
                      </p>
                      <p className="text-xs text-[var(--color-muted-foreground)] truncate">
                        {issue.description}
                      </p>
                    </div>
                    <span className={`text-xs font-medium ${severityColors[issue.severity]}`}>
                      {issue.severity === "high" && <TriangleAlert className="mr-1 inline h-3 w-3" />}
                      {severityLabels[issue.severity]}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </Card>
        );
      })}

      {issues.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12">
          <CheckCircle2 className="h-10 w-10 text-green-500" />
          <p className="text-sm text-[var(--color-muted-foreground)]">
            레지스트리 문제가 발견되지 않았습니다!
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ────────────────────────────── */

function FailedItemsList({ items }: { items: FailedItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[var(--radius-md)] border border-red-500/20 bg-[var(--color-card)]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-red-400 transition-colors hover:bg-[var(--color-muted)]/30"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <AlertCircle className="h-4 w-4" />
        실패 항목 상세 ({items.length}개)
      </button>
      {open && (
        <div className="border-t border-red-500/10 px-4 py-2 space-y-2">
          {items.map((item, i) => (
            <div key={i} className="rounded-[var(--radius-sm)] bg-[var(--color-muted)]/30 px-3 py-2">
              <p className="text-sm font-medium text-[var(--color-card-foreground)]">{item.name}</p>
              <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">{item.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-[var(--radius-md)] border bg-[var(--color-card)] px-4 py-3 ${
        highlight ? "border-red-500/30" : "border-[var(--color-border)]"
      }`}
    >
      <p className="text-xs text-[var(--color-muted-foreground)]">{label}</p>
      <p
        className={`mt-1 text-lg font-bold ${
          highlight ? "text-red-400" : "text-[var(--color-card-foreground)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
