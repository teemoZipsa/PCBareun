import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Trash2,
  Shield,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Package,
  Eye,
  EyeOff,
  Megaphone,
  Sparkles,
  Lock,
  Clock,
  CalendarClock,
} from "lucide-react";
import Card from "@/components/common/Card";
import SafetyBanner from "@/components/common/SafetyBanner";

/* ── Types ─────────────────────────────────────── */

interface BloatwareApp {
  name: string;
  package_name: string;
  publisher: string;
  is_removable: boolean;
}

interface TelemetrySetting {
  id: string;
  name: string;
  description: string;
  is_enabled: boolean;
  category: string;
  requires_admin: boolean;
}

interface DebloatStatus {
  bloatware: BloatwareApp[];
  telemetry_settings: TelemetrySetting[];
}

interface UnusedProgram {
  name: string;
  publisher: string;
  version: string;
  install_date: string;
  last_modified: string;
  size_mb: number;
  install_location: string;
  days_unused: number;
  uninstall_string: string;
}

/* ── Helpers ───────────────────────────────────── */

const categoryIcons: Record<string, React.ReactNode> = {
  telemetry: <Eye className="h-4 w-4" />,
  privacy: <Shield className="h-4 w-4" />,
  ads: <Megaphone className="h-4 w-4" />,
  suggestions: <Sparkles className="h-4 w-4" />,
};

const categoryLabels: Record<string, string> = {
  telemetry: "원격 분석",
  privacy: "개인정보",
  ads: "광고",
  suggestions: "제안/추천",
};

/* ── Component ──────────────────────────────────── */

export default function DebloatPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DebloatStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState(false);
  const [actionMsg, setActionMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Unused programs
  const [unusedPrograms, setUnusedPrograms] = useState<UnusedProgram[]>([]);
  const [unusedLoading, setUnusedLoading] = useState(false);
  const [unusedYears, setUnusedYears] = useState(3);
  const [unusedScanned, setUnusedScanned] = useState(false);
  const [uninstallingName, setUninstallingName] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<DebloatStatus>("get_debloat_status");
      setData(result);
      // Default: none selected (user must explicitly choose)
      setSelectedApps(new Set());
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const scanUnusedPrograms = async (years: number) => {
    setUnusedLoading(true);
    try {
      const result = await invoke<UnusedProgram[]>("get_unused_programs", {
        minYears: years,
      });
      setUnusedPrograms(result);
      setUnusedScanned(true);
    } catch (err) {
      setActionMsg({ type: "error", text: String(err) });
    } finally {
      setUnusedLoading(false);
    }
  };

  const handleRemoveApps = async () => {
    if (selectedApps.size === 0) return;
    setRemoving(true);
    setActionMsg(null);
    try {
      const result = await invoke<string>("remove_bloatware_apps", {
        packageNames: Array.from(selectedApps),
      });
      setActionMsg({ type: "success", text: result });
      await fetchStatus();
    } catch (err) {
      setActionMsg({ type: "error", text: String(err) });
    } finally {
      setRemoving(false);
    }
  };

  const handleToggleSetting = async (
    settingId: string,
    currentEnabled: boolean,
  ) => {
    setTogglingId(settingId);
    setActionMsg(null);
    try {
      await invoke<string>("toggle_telemetry_setting", {
        settingId,
        enable: !currentEnabled,
      });
      const result = await invoke<DebloatStatus>("get_debloat_status");
      setData(result);
    } catch (err) {
      const errStr = String(err);
      if (errStr.includes("Access") || errStr.includes("denied") || errStr.includes("권한")) {
        setActionMsg({ type: "error", text: "관리자 권한이 필요합니다. 프로그램을 관리자로 재시작해주세요." });
      } else {
        setActionMsg({ type: "error", text: errStr });
      }
    } finally {
      setTogglingId(null);
    }
  };

  const toggleApp = (pkg: string) => {
    setSelectedApps((prev) => {
      const next = new Set(prev);
      if (next.has(pkg)) next.delete(pkg);
      else next.add(pkg);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary)]" />
        <p className="text-sm text-[var(--color-muted-foreground)]">
          시스템 상태를 확인하는 중...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-red-400">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">{error}</p>
        <button
          onClick={fetchStatus}
          className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-1.5 text-sm text-white hover:opacity-90"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (!data) return null;

  const enabledCount = data.telemetry_settings.filter(
    (s) => s.is_enabled,
  ).length;

  // Group telemetry settings by category
  const telemetryGrouped = new Map<string, TelemetrySetting[]>();
  for (const s of data.telemetry_settings) {
    const arr = telemetryGrouped.get(s.category) ?? [];
    arr.push(s);
    telemetryGrouped.set(s.category, arr);
  }

  return (
    <div className="space-y-4">
      <SafetyBanner message="Microsoft Store 앱만 제거합니다. Windows 핵심 기능에 영향 없으며, 언제든 다시 설치 가능합니다." />
      <p className="text-sm text-[var(--color-muted-foreground)]">
        불필요 앱 제거, 오래 사용하지 않은 프로그램 탐지, 개인정보 추적 설정을 관리합니다.
      </p>

      {/* 통계 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            제거 가능한 앱
          </p>
          <p className="mt-1 text-2xl font-bold text-[var(--color-card-foreground)]">
            {data.bloatware.length}
          </p>
        </div>
        <div className="rounded-[var(--radius-md)] border border-amber-500/30 bg-[var(--color-card)] px-4 py-3">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            활성화된 추적 설정
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-400">
            {enabledCount} / {data.telemetry_settings.length}
          </p>
        </div>
        <div className="rounded-[var(--radius-md)] border border-green-500/30 bg-[var(--color-card)] px-4 py-3">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            차단된 추적 설정
          </p>
          <p className="mt-1 text-2xl font-bold text-green-400">
            {data.telemetry_settings.length - enabledCount}
          </p>
        </div>
      </div>

      {/* 알림 */}
      {actionMsg && (
        <div
          className={`flex items-center gap-2 rounded-[var(--radius-md)] border px-4 py-2.5 text-sm ${
            actionMsg.type === "success"
              ? "border-green-500/30 bg-green-500/10 text-green-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {actionMsg.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{actionMsg.text}</span>
          <button
            onClick={() => setActionMsg(null)}
            className="ml-auto text-xs opacity-60 hover:opacity-100"
          >
            닫기
          </button>
        </div>
      )}

      {/* ── 오래 미사용 프로그램 ── */}
      <Card
        title="오래 사용하지 않은 프로그램"
        icon={<CalendarClock className="h-4 w-4" />}
      >
        <div className="space-y-3 py-1">
          <div className="flex items-center gap-3">
            <label className="text-sm text-[var(--color-muted-foreground)]">
              미사용 기간:
            </label>
            <select
              value={unusedYears}
              onChange={(e) => setUnusedYears(Number(e.target.value))}
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-card-foreground)] focus:border-[var(--color-primary)] focus:outline-none"
            >
              <option value={1}>1년 이상</option>
              <option value={2}>2년 이상</option>
              <option value={3}>3년 이상</option>
              <option value={5}>5년 이상</option>
            </select>
            <button
              onClick={() => scanUnusedPrograms(unusedYears)}
              disabled={unusedLoading}
              className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {unusedLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Clock className="h-3.5 w-3.5" />
              )}
              스캔
            </button>
          </div>

          {unusedLoading && (
            <div className="flex items-center justify-center gap-2 py-6">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--color-primary)]" />
              <span className="text-sm text-[var(--color-muted-foreground)]">
                설치된 프로그램의 마지막 사용 시점을 분석하는 중...
              </span>
            </div>
          )}

          {!unusedLoading && unusedScanned && unusedPrograms.length === 0 && (
            <div className="flex items-center gap-2 py-4 text-sm text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              {unusedYears}년 이상 미사용된 프로그램이 없습니다.
            </div>
          )}

          {!unusedLoading && unusedPrograms.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-xs font-medium text-[var(--color-muted-foreground)]">
                    <th className="pb-2 pr-3">프로그램</th>
                    <th className="hidden pb-2 pr-3 md:table-cell">게시자</th>
                    <th className="pb-2 pr-3">마지막 사용</th>
                    <th className="pb-2 pr-3">미사용</th>
                    <th className="pb-2 pr-3 text-right">크기</th>
                    <th className="pb-2 text-right">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {unusedPrograms.map((prog) => (
                    <tr
                      key={prog.install_location}
                      className="transition-colors hover:bg-[var(--color-muted)]/30"
                    >
                      <td className="py-2.5 pr-3">
                        <p className="font-medium text-[var(--color-card-foreground)]">
                          {prog.name}
                        </p>
                        <p className="text-xs text-[var(--color-muted-foreground)] md:hidden">
                          {prog.publisher || "-"}
                        </p>
                      </td>
                      <td className="hidden py-2.5 pr-3 text-[var(--color-muted-foreground)] md:table-cell">
                        {prog.publisher || "-"}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-[var(--color-muted-foreground)]">
                        {prog.last_modified}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                          prog.days_unused >= 1825
                            ? "bg-red-500/10 text-red-400"
                            : prog.days_unused >= 1095
                              ? "bg-amber-500/10 text-amber-400"
                              : "bg-yellow-500/10 text-yellow-500"
                        }`}>
                          <Clock className="h-3 w-3" />
                          {Math.floor(prog.days_unused / 365)}년 {Math.floor((prog.days_unused % 365) / 30)}개월
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-right text-xs text-[var(--color-muted-foreground)]">
                        {prog.size_mb > 0
                          ? prog.size_mb >= 1024
                            ? `${(prog.size_mb / 1024).toFixed(1)} GB`
                            : `${prog.size_mb.toFixed(1)} MB`
                          : "-"}
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={async () => {
                            if (!prog.uninstall_string) {
                              setActionMsg({ type: "error", text: `'${prog.name}'의 제거 명령어를 찾을 수 없습니다.` });
                              return;
                            }
                            setUninstallingName(prog.name);
                            try {
                              const result = await invoke<string>("uninstall_program", { uninstallString: prog.uninstall_string });
                              setActionMsg({ type: "success", text: `${prog.name}: ${result}` });
                            } catch (err) {
                              setActionMsg({ type: "error", text: String(err) });
                            } finally {
                              setUninstallingName(null);
                            }
                          }}
                          disabled={uninstallingName === prog.name || !prog.uninstall_string}
                          title={prog.uninstall_string ? "프로그램 제거" : "제거 명령어 없음"}
                          className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-red-500/30 px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-40"
                        >
                          {uninstallingName === prog.name ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                설치 폴더의 파일 수정일 기준으로 오래 사용되지 않은 프로그램입니다.
                삭제 버튼을 누르면 Windows 제거 프로그램이 실행됩니다.
              </p>
            </div>
          )}

          {!unusedScanned && !unusedLoading && (
            <p className="py-3 text-center text-xs text-[var(--color-muted-foreground)]">
              "스캔" 버튼을 눌러 오래 사용하지 않은 프로그램을 찾습니다.
            </p>
          )}
        </div>
      </Card>

      {/* ── 블로트웨어 제거 ── */}
      <Card
        title={`불필요 기본 앱 제거 (${data.bloatware.length})`}
        icon={<Package className="h-4 w-4" />}
      >
        {data.bloatware.length === 0 ? (
          <div className="flex items-center gap-2 py-4 text-sm text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            불필요한 기본 앱이 없습니다. 깨끗한 상태입니다!
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const allSelected = selectedApps.size === data.bloatware.length;
                    setSelectedApps(
                      allSelected ? new Set() : new Set(data.bloatware.map((a) => a.package_name)),
                    );
                  }}
                  className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-card-foreground)] hover:bg-[var(--color-muted)]"
                >
                  {selectedApps.size === data.bloatware.length ? "전체 해제" : "전체 선택"}
                </button>
              </div>
              <button
                onClick={handleRemoveApps}
                disabled={removing || selectedApps.size === 0}
                className="flex items-center gap-2 rounded-[var(--radius-md)] bg-red-500 px-4 py-1.5 text-xs font-medium text-white transition-all hover:bg-red-600 disabled:opacity-50"
              >
                {removing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                선택 앱 제거 ({selectedApps.size})
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {data.bloatware.map((app) => (
                <label
                  key={app.package_name}
                  className={`flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border p-3 transition-colors ${
                    selectedApps.has(app.package_name)
                      ? "border-red-500/40 bg-red-500/5"
                      : "border-[var(--color-border)] hover:bg-[var(--color-muted)]/30"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedApps.has(app.package_name)}
                    onChange={() => toggleApp(app.package_name)}
                    className="cb-check"
                  />
                  <span className="text-sm text-[var(--color-card-foreground)] truncate">
                    {app.name}
                  </span>
                </label>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* ── 추적/개인정보 설정 ── */}
      <Card
        title="추적 방지 / 개인정보 설정"
        icon={<Shield className="h-4 w-4" />}
      >
        <p className="mb-4 text-xs text-[var(--color-muted-foreground)]">
          토글을 끄면 해당 추적/광고 기능이 비활성화됩니다. Windows 기본 기능에는 영향을 주지 않습니다.
        </p>

        <div className="space-y-4">
          {Array.from(telemetryGrouped.entries()).map(
            ([category, settings]) => (
              <div key={category}>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  {categoryIcons[category]}
                  {categoryLabels[category] || category}
                </div>
                <div className="space-y-1">
                  {settings.map((setting) => (
                    <div
                      key={setting.id}
                      className="flex items-center justify-between rounded-[var(--radius-sm)] px-3 py-2.5 transition-colors hover:bg-[var(--color-muted)]/30"
                    >
                      <div className="min-w-0 flex-1 pr-4">
                        <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-card-foreground)]">
                          {setting.name}
                          {setting.requires_admin && (
                            <span title="관리자 권한 필요"><Lock className="h-3 w-3 text-amber-500" /></span>
                          )}
                        </p>
                        <p className="text-xs text-[var(--color-muted-foreground)]">
                          {setting.description}
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          handleToggleSetting(setting.id, setting.is_enabled)
                        }
                        disabled={togglingId === setting.id}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                          setting.is_enabled
                            ? "bg-amber-500"
                            : "bg-green-500"
                        } ${togglingId === setting.id ? "opacity-50" : ""}`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                            setting.is_enabled
                              ? "translate-x-6"
                              : "translate-x-1"
                          }`}
                        />
                      </button>
                      <span
                        className={`ml-2 w-14 text-right text-xs font-medium ${
                          setting.is_enabled
                            ? "text-amber-400"
                            : "text-green-400"
                        }`}
                      >
                        {setting.is_enabled ? (
                          <span className="flex items-center gap-1 justify-end">
                            <Eye className="h-3 w-3" />
                            활성
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 justify-end">
                            <EyeOff className="h-3 w-3" />
                            차단
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ),
          )}
        </div>
      </Card>

      {/* 안내 */}
      <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
        <Shield className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
        <div>
          <p className="font-medium text-[var(--color-card-foreground)]">안전 안내</p>
          <p className="mt-1">
            앱 제거는 Windows 핵심 기능에 영향을 주지 않습니다.
            추적 설정 변경은 레지스트리를 수정하며, 언제든지 다시 활성화할 수 있습니다.
            일부 설정은 관리자 권한이 필요합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
