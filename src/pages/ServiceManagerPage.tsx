import { useEffect, useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Settings2,
  Search,
  Play,
  Square,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronDown,
  Power,
  PowerOff,
} from "lucide-react";
import SafetyBanner from "@/components/common/SafetyBanner";
import SkeletonRows from "@/components/common/SkeletonRows";
import { useT } from "@/i18n/useT";

interface WindowsService {
  name: string;
  display_name: string;
  status: string;
  start_type: string;
  description: string;
}

type StatusFilter = "all" | "Running" | "Stopped";
type StartTypeFilter = "all" | "Automatic" | "Manual" | "Disabled";


export default function ServiceManagerPage() {
  const t = useT();
  const [services, setServices] = useState<WindowsService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [startTypeFilter, setStartTypeFilter] = useState<StartTypeFilter>("all");
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchServices = useCallback(async () => {
    try {
      setError(null);
      const result = await invoke<WindowsService[]>("get_services");
      setServices(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  const filteredServices = useMemo(() => {
    return services.filter((s) => {
      const matchesSearch =
        searchQuery === "" ||
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || s.status === statusFilter;
      const matchesStartType = startTypeFilter === "all" || s.start_type === startTypeFilter;
      return matchesSearch && matchesStatus && matchesStartType;
    });
  }, [services, searchQuery, statusFilter, startTypeFilter]);

  const stats = useMemo(() => {
    const running = services.filter((s) => s.status === "Running").length;
    const stopped = services.filter((s) => s.status === "Stopped").length;
    return { total: services.length, running, stopped };
  }, [services]);

  const handleAction = async (serviceName: string, action: "start" | "stop" | "restart") => {
    setActionLoading(`${serviceName}-${action}`);
    setActionMessage(null);
    try {
      const result = await invoke<string>("control_service", { payload: { name: serviceName, action } });
      setActionMessage({ type: "success", text: result });
      await fetchServices();
    } catch (err) {
      setActionMessage({ type: "error", text: String(err) });
    } finally {
      setActionLoading(null);
    }
  };

  const handleStartTypeChange = async (serviceName: string, newStartType: string) => {
    setActionLoading(`${serviceName}-starttype`);
    setActionMessage(null);
    try {
      const result = await invoke<string>("set_service_start_type", { name: serviceName, startType: newStartType });
      setActionMessage({ type: "success", text: result });
      await fetchServices();
    } catch (err) {
      setActionMessage({ type: "error", text: String(err) });
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) return <SkeletonRows rows={10} cols={4} />;

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[var(--color-destructive)]">
          <AlertCircle className="h-8 w-8" />
          <p className="text-sm">{error}</p>
          <button
            onClick={() => { setLoading(true); fetchServices(); }}
            className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-1.5 text-sm text-white hover:opacity-90"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  const statusOptions: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "전체" },
    { key: "Running", label: "실행 중" },
    { key: "Stopped", label: "중지" },
  ];

  const startTypeOptions: { key: StartTypeFilter; label: string }[] = [
    { key: "all", label: "전체" },
    { key: "Automatic", label: "자동" },
    { key: "Manual", label: "수동" },
    { key: "Disabled", label: "사용 안 함" },
  ];

  return (
    <div className="space-y-4">
      <SafetyBanner message="Windows 핵심 서비스는 변경할 수 없도록 보호됩니다. 여기서는 타사 프로그램 서비스만 관리할 수 있습니다." />

      {/* 알림 메시지 */}
      {actionMessage && (
        <div
          className={`flex items-center gap-2 rounded-[var(--radius-md)] border px-4 py-2.5 text-sm ${
            actionMessage.type === "success"
              ? "border-green-500/30 bg-green-500/10 text-green-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {actionMessage.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="ml-auto text-xs opacity-60 hover:opacity-100">{t("common.close")}</button>
        </div>
      )}

      {/* ── 통합 바: 통계 칩 + 검색 + 필터 + 새로고침 ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* 통계 칩 */}
        <div className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-xs">
          <Settings2 className="h-3.5 w-3.5 text-[var(--color-primary)]" />
          <span className="font-bold text-[var(--color-card-foreground)]">{stats.total}</span>
          <span className="text-[var(--color-muted-foreground)]">{t("common.all")}</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-xs">
          <Power className="h-3.5 w-3.5 text-emerald-400" />
          <span className="font-bold text-emerald-400">{stats.running}</span>
          <span className="text-emerald-400/70">{t("common.running")}</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-gray-500/20 bg-gray-500/5 px-3 py-1.5 text-xs">
          <PowerOff className="h-3.5 w-3.5 text-gray-400" />
          <span className="font-bold text-gray-400">{stats.stopped}</span>
          <span className="text-gray-400/70">{t("common.stopped")}</span>
        </div>

        {/* 검색 */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
          <input
            type="text"
            placeholder="서비스 이름, 표시 이름, 설명 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-full border border-[var(--color-border)] bg-[var(--color-card)] py-1.5 pl-9 pr-3 text-sm focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>

        {/* 상태 필터 - 세그먼트 */}
        <div className="flex items-center gap-0.5 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] p-0.5">
          {statusOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setStatusFilter(opt.key)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                statusFilter === opt.key
                  ? "bg-[var(--color-primary)] text-white"
                  : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* 시작 유형 필터 - 세그먼트 */}
        <div className="flex items-center gap-0.5 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] p-0.5">
          {startTypeOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setStartTypeFilter(opt.key)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                startTypeFilter === opt.key
                  ? "bg-[var(--color-primary)] text-white"
                  : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* 새로고침 */}
        <button
          onClick={() => { setLoading(true); fetchServices(); }}
          className="rounded-full border border-[var(--color-border)] bg-[var(--color-card)] p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── 서비스 카드 리스트 ── */}
      <div className="space-y-1.5">
        {filteredServices.length === 0 ? (
          <p className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">
            {t("common.noResults")}
          </p>
        ) : (
          filteredServices.map((service) => {
            const isRunning = service.status === "Running";
            const isStopLoading = actionLoading === `${service.name}-stop`;
            const isStartLoading = actionLoading === `${service.name}-start`;
            const isRestartLoading = actionLoading === `${service.name}-restart`;
            const isStartTypeLoading = actionLoading === `${service.name}-starttype`;
            const anyLoading = isStopLoading || isStartLoading || isRestartLoading || isStartTypeLoading;

            return (
              <div
                key={service.name}
                className="flex items-center gap-3 rounded-[var(--radius-md)] border border-transparent px-4 py-3 transition-all hover:border-[var(--color-border)] hover:bg-[var(--color-muted)]/20"
              >
                {/* 상태 뱃지 */}
                <span className={`shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  isRunning
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                    : "border-gray-500/20 bg-gray-500/10 text-gray-400"
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? "bg-emerald-400" : "bg-gray-400"}`} />
                  {isRunning ? t("common.running") : t("common.stopped")}
                </span>

                {/* 서비스 이름 + 표시 이름 + 설명 */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-[var(--color-card-foreground)]">
                      {service.display_name}
                    </p>
                    <span className="hidden shrink-0 rounded bg-[var(--color-muted)]/50 px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)] sm:inline">
                      {service.name}
                    </span>
                  </div>
                  {service.description && (
                    <p className="mt-0.5 truncate text-xs text-[var(--color-muted-foreground)]">
                      {service.description}
                    </p>
                  )}
                </div>

                {/* 시작 유형 */}
                <div className="relative shrink-0">
                  <select
                    value={service.start_type}
                    onChange={(e) => handleStartTypeChange(service.name, e.target.value)}
                    disabled={isStartTypeLoading}
                    className="appearance-none rounded-full border border-[var(--color-border)] bg-[var(--color-card)] py-1 pl-2.5 pr-6 text-[11px] font-medium text-[var(--color-foreground)] focus:outline-none disabled:opacity-50"
                  >
                    <option value="Automatic">자동</option>
                    <option value="Manual">수동</option>
                    <option value="Disabled">사용 안 함</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
                </div>

                {/* 작업 버튼 */}
                <div className="flex shrink-0 items-center gap-1">
                  {isRunning ? (
                    <>
                      <button
                        onClick={() => handleAction(service.name, "stop")}
                        disabled={anyLoading}
                        className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-red-500/20 px-2 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                      >
                        {isStopLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}
                        {t("common.stop")}
                      </button>
                      <button
                        onClick={() => handleAction(service.name, "restart")}
                        disabled={anyLoading}
                        className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)] disabled:opacity-50"
                      >
                        {isRestartLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                        {t("common.restart")}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleAction(service.name, "start")}
                      disabled={anyLoading}
                      className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-emerald-500/20 px-2 py-1 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
                    >
                      {isStartLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                      {t("common.start")}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 하단: 표시 개수 */}
      {filteredServices.length > 0 && (
        <p className="text-center text-xs text-[var(--color-muted-foreground)]">
          {filteredServices.length}개 서비스 표시 (전체 {stats.total}개)
        </p>
      )}
    </div>
  );
}
