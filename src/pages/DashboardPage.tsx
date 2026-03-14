import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Cpu,
  MemoryStick,
  HardDrive,
  Monitor,
  Clock,
  RefreshCw,
  Activity,
} from "lucide-react";
import Card from "@/components/common/Card";
import GaugeChart from "@/components/common/GaugeChart";

interface DiskInfo {
  name: string;
  mount_point: string;
  total_gb: number;
  used_gb: number;
  free_gb: number;
  usage_percent: number;
  fs_type: string;
}

interface SystemOverview {
  cpu_usage: number;
  total_memory_gb: number;
  used_memory_gb: number;
  memory_usage_percent: number;
  os_name: string;
  os_version: string;
  hostname: string;
  cpu_name: string;
  cpu_cores: number;
  disks: DiskInfo[];
  uptime_seconds: number;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}일 ${hours}시간 ${mins}분`;
  if (hours > 0) return `${hours}시간 ${mins}분`;
  return `${mins}분`;
}

function getGaugeColor(value: number): string {
  if (value < 50) return "var(--color-success)";
  if (value < 80) return "var(--color-warning)";
  return "var(--color-destructive)";
}

export default function DashboardPage() {
  const [data, setData] = useState<SystemOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const result = await invoke<SystemOverview>("get_system_overview");
      setData(result);
    } catch (err) {
      console.error("Failed to get system overview:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (loading || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-3 text-[var(--color-muted-foreground)]">
          <Activity className="h-5 w-5 animate-pulse" />
          <span>시스템 정보를 불러오는 중...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 상단: 새로고침 버튼 */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          시스템 상태를 실시간으로 모니터링합니다. (3초 간격 자동 갱신)
        </p>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-xs font-medium text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)]"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
          />
          새로고침
        </button>
      </div>

      {/* 게이지 섹션: CPU / RAM */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="CPU 사용량" icon={<Cpu className="h-4 w-4" />}>
          <div className="flex justify-center py-2">
            <GaugeChart
              value={data.cpu_usage}
              label="CPU"
              sublabel={`${data.cpu_cores}코어`}
              color={getGaugeColor(data.cpu_usage)}
            />
          </div>
        </Card>

        <Card title="메모리 사용량" icon={<MemoryStick className="h-4 w-4" />}>
          <div className="flex justify-center py-2">
            <GaugeChart
              value={data.memory_usage_percent}
              label="RAM"
              sublabel={`${data.used_memory_gb.toFixed(1)} / ${data.total_memory_gb.toFixed(1)} GB`}
              color={getGaugeColor(data.memory_usage_percent)}
            />
          </div>
        </Card>

        <Card
          title="시스템 정보"
          icon={<Monitor className="h-4 w-4" />}
          className="sm:col-span-2 lg:col-span-1"
        >
          <div className="space-y-3 text-sm">
            <InfoRow label="PC 이름" value={data.hostname} />
            <InfoRow label="운영체제" value={`${data.os_name} ${data.os_version}`} />
            <InfoRow label="프로세서" value={data.cpu_name} />
            <InfoRow label="코어 수" value={`${data.cpu_cores}개`} />
            <InfoRow
              label="가동 시간"
              value={formatUptime(data.uptime_seconds)}
              icon={<Clock className="h-3.5 w-3.5" />}
            />
          </div>
        </Card>
      </div>

      {/* 디스크 정보 */}
      <Card title="디스크 상태" icon={<HardDrive className="h-4 w-4" />}>
        <div className="space-y-4">
          {data.disks.map((disk, i) => (
            <DiskBar key={i} disk={disk} />
          ))}
          {data.disks.length === 0 && (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              디스크 정보를 가져올 수 없습니다.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

function InfoRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-muted-foreground)]">{label}</span>
      <span className="flex items-center gap-1.5 font-medium text-[var(--color-card-foreground)]">
        {icon}
        {value}
      </span>
    </div>
  );
}

function DiskBar({ disk }: { disk: DiskInfo }) {
  const usageColor =
    disk.usage_percent < 70
      ? "bg-[var(--color-success)]"
      : disk.usage_percent < 90
        ? "bg-[var(--color-warning)]"
        : "bg-[var(--color-destructive)]";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <HardDrive className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
          <span className="font-medium text-[var(--color-card-foreground)]">
            {disk.mount_point}
          </span>
          {disk.name && (
            <span className="text-xs text-[var(--color-muted-foreground)]">
              ({disk.name})
            </span>
          )}
        </div>
        <span className="text-xs text-[var(--color-muted-foreground)]">
          {disk.used_gb.toFixed(1)} / {disk.total_gb.toFixed(1)} GB (
          {disk.usage_percent.toFixed(0)}%)
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-muted)]">
        <div
          className={`h-full rounded-full transition-all duration-500 ${usageColor}`}
          style={{ width: `${Math.min(disk.usage_percent, 100)}%` }}
        />
      </div>
    </div>
  );
}
