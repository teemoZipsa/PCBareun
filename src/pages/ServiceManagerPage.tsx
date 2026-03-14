import { useEffect, useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Settings2,
  Search,
  Play,
  Square,
  RotateCcw,
  Filter,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronDown,
} from "lucide-react";
import Card from "@/components/common/Card";

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
  const [services, setServices] = useState<WindowsService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [startTypeFilter, setStartTypeFilter] =
    useState<StartTypeFilter>("all");
  const [actionMessage, setActionMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
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

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const filteredServices = useMemo(() => {
    return services.filter((s) => {
      const matchesSearch =
        searchQuery === "" ||
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.description.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || s.status === statusFilter;

      const matchesStartType =
        startTypeFilter === "all" || s.start_type === startTypeFilter;

      return matchesSearch && matchesStatus && matchesStartType;
    });
  }, [services, searchQuery, statusFilter, startTypeFilter]);

  const stats = useMemo(() => {
    const running = services.filter((s) => s.status === "Running").length;
    const stopped = services.filter((s) => s.status === "Stopped").length;
    return { total: services.length, running, stopped };
  }, [services]);

  const handleAction = async (
    serviceName: string,
    action: "start" | "stop" | "restart"
  ) => {
    setActionLoading(`${serviceName}-${action}`);
    setActionMessage(null);
    try {
      const result = await invoke<string>("control_service", {
        payload: { name: serviceName, action },
      });
      setActionMessage({ type: "success", text: result });
      await fetchServices();
    } catch (err) {
      setActionMessage({ type: "error", text: String(err) });
    } finally {
      setActionLoading(null);
    }
  };

  const handleStartTypeChange = async (
    serviceName: string,
    newStartType: string
  ) => {
    setActionLoading(`${serviceName}-starttype`);
    setActionMessage(null);
    try {
      const result = await invoke<string>("set_service_start_type", {
        name: serviceName,
        startType: newStartType,
      });
      setActionMessage({ type: "success", text: result });
      await fetchServices();
    } catch (err) {
      setActionMessage({ type: "error", text: String(err) });
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-3 text-[var(--color-muted-foreground)]">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>서비스 목록을 불러오는 중...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[var(--color-destructive)]">
          <AlertCircle className="h-8 w-8" />
          <p className="text-sm">{error}</p>
          <button
            onClick={() => {
              setLoading(true);
              fetchServices();
            }}
            className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-1.5 text-sm text-white hover:opacity-90"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 상단 통계 */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="전체 서비스" value={stats.total} />
        <StatCard
          label="실행 중"
          value={stats.running}
          color="var(--color-success)"
        />
        <StatCard
          label="중지됨"
          value={stats.stopped}
          color="var(--color-muted-foreground)"
        />
      </div>

      {/* 알림 메시지 */}
      {actionMessage && (
        <div
          className={`flex items-center gap-2 rounded-[var(--radius-md)] border px-4 py-2.5 text-sm ${
            actionMessage.type === "success"
              ? "border-green-500/30 bg-green-500/10 text-green-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {actionMessage.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{actionMessage.text}</span>
          <button
            onClick={() => setActionMessage(null)}
            className="ml-auto text-xs opacity-60 hover:opacity-100"
          >
            닫기
          </button>
        </div>
      )}

      {/* 검색 및 필터 */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          {/* 검색 */}
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
            <input
              type="text"
              placeholder="서비스 이름, 표시 이름, 설명 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)] py-2 pl-9 pr-3 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>

          {/* 상태 필터 */}
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as StatusFilter)
              }
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-2 text-xs text-[var(--color-foreground)] focus:outline-none"
            >
              <option value="all">모든 상태</option>
              <option value="Running">실행 중</option>
              <option value="Stopped">중지됨</option>
            </select>
          </div>

          {/* 시작 유형 필터 */}
          <select
            value={startTypeFilter}
            onChange={(e) =>
              setStartTypeFilter(e.target.value as StartTypeFilter)
            }
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-2 text-xs text-[var(--color-foreground)] focus:outline-none"
          >
            <option value="all">모든 시작 유형</option>
            <option value="Automatic">자동</option>
            <option value="Manual">수동</option>
            <option value="Disabled">사용 안 함</option>
          </select>

          {/* 새로고침 */}
          <button
            onClick={() => {
              setLoading(true);
              fetchServices();
            }}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-xs font-medium text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </Card>

      {/* 서비스 테이블 */}
      <Card
        title={`서비스 목록 (${filteredServices.length})`}
        icon={<Settings2 className="h-4 w-4" />}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs font-medium text-[var(--color-muted-foreground)]">
                <th className="pb-3 pr-3">상태</th>
                <th className="pb-3 pr-3">서비스 이름</th>
                <th className="hidden pb-3 pr-3 md:table-cell">표시 이름</th>
                <th className="pb-3 pr-3">시작 유형</th>
                <th className="pb-3 text-right">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {filteredServices.map((service) => (
                <ServiceRow
                  key={service.name}
                  service={service}
                  actionLoading={actionLoading}
                  onAction={handleAction}
                  onStartTypeChange={handleStartTypeChange}
                />
              ))}
            </tbody>
          </table>
          {filteredServices.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--color-muted-foreground)]">
              검색 결과가 없습니다.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3">
      <p className="text-xs text-[var(--color-muted-foreground)]">{label}</p>
      <p
        className="mt-1 text-2xl font-bold"
        style={{ color: color || "var(--color-card-foreground)" }}
      >
        {value}
      </p>
    </div>
  );
}

function ServiceRow({
  service,
  actionLoading,
  onAction,
  onStartTypeChange,
}: {
  service: WindowsService;
  actionLoading: string | null;
  onAction: (name: string, action: "start" | "stop" | "restart") => void;
  onStartTypeChange: (name: string, startType: string) => void;
}) {
  const isRunning = service.status === "Running";

  return (
    <tr className="group transition-colors hover:bg-[var(--color-muted)]/30">
      {/* 상태 */}
      <td className="py-3 pr-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
            isRunning
              ? "bg-green-500/15 text-green-500"
              : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isRunning ? "bg-green-500" : "bg-[var(--color-muted-foreground)]"
            }`}
          />
          {isRunning ? "실행 중" : "중지"}
        </span>
      </td>

      {/* 서비스 이름 */}
      <td className="py-3 pr-3">
        <div>
          <p className="font-medium text-[var(--color-card-foreground)]">
            {service.name}
          </p>
          {/* 모바일에서 표시 이름 보이기 */}
          <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)] md:hidden">
            {service.display_name}
          </p>
          {service.description && (
            <p className="mt-0.5 line-clamp-1 text-xs text-[var(--color-muted-foreground)]">
              {service.description}
            </p>
          )}
        </div>
      </td>

      {/* 표시 이름 (데스크톱) */}
      <td className="hidden py-3 pr-3 md:table-cell">
        <span className="text-[var(--color-card-foreground)]">
          {service.display_name}
        </span>
      </td>

      {/* 시작 유형 */}
      <td className="py-3 pr-3">
        <div className="relative inline-block">
          <select
            value={service.start_type}
            onChange={(e) => onStartTypeChange(service.name, e.target.value)}
            disabled={actionLoading === `${service.name}-starttype`}
            className="appearance-none rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-background)] py-1 pl-2 pr-6 text-xs text-[var(--color-foreground)] focus:outline-none disabled:opacity-50"
          >
            <option value="Automatic">자동</option>
            <option value="Manual">수동</option>
            <option value="Disabled">사용 안 함</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
        </div>
      </td>

      {/* 작업 버튼 */}
      <td className="py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          {isRunning ? (
            <>
              <ActionButton
                icon={<Square className="h-3 w-3" />}
                label="중지"
                onClick={() => onAction(service.name, "stop")}
                loading={actionLoading === `${service.name}-stop`}
                variant="danger"
              />
              <ActionButton
                icon={<RotateCcw className="h-3 w-3" />}
                label="재시작"
                onClick={() => onAction(service.name, "restart")}
                loading={actionLoading === `${service.name}-restart`}
              />
            </>
          ) : (
            <ActionButton
              icon={<Play className="h-3 w-3" />}
              label="시작"
              onClick={() => onAction(service.name, "start")}
              loading={actionLoading === `${service.name}-start`}
              variant="success"
            />
          )}
        </div>
      </td>
    </tr>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  loading,
  variant = "default",
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  loading: boolean;
  variant?: "default" | "success" | "danger";
}) {
  const colorMap = {
    default:
      "border-[var(--color-border)] text-[var(--color-card-foreground)] hover:bg-[var(--color-muted)]",
    success: "border-green-500/30 text-green-500 hover:bg-green-500/10",
    danger: "border-red-500/30 text-red-400 hover:bg-red-500/10",
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      title={label}
      className={`flex items-center gap-1 rounded-[var(--radius-sm)] border px-2 py-1 text-xs transition-colors disabled:opacity-50 ${colorMap[variant]}`}
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
