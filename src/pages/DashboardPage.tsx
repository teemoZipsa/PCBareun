import React, { useEffect, useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useT } from "@/i18n/useT";
import {
  Cpu,
  MemoryStick,
  HardDrive,
  Monitor,
  Clock,
  RefreshCw,
  Activity,
  HeartPulse,
  Thermometer,
  Zap,
  AlertTriangle,
  X,
  Loader2,
  MonitorSmartphone,
  Skull,
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
  gpu_name: string;
  total_ram_gb: string;
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

function getHealthColor(score: number): string {
  if (score >= 75) return "var(--color-success)";
  if (score >= 50) return "var(--color-warning)";
  return "var(--color-destructive)";
}

export default function DashboardPage() {
  const t = useT();
  const [data, setData] = useState<SystemOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeResult, setOptimizeResult] = useState<{ before: number; after: number; freed: number } | null>(null);
  const [gpuUsage, setGpuUsage] = useState<{ name: string; utilization: number; vram_total_mb: number; vram_used_mb: number; vram_free_mb: number; vram_usage_percent: number } | null>(null);
  const [killingVram, setKillingVram] = useState(false);
  const [vramKillResult, setVramKillResult] = useState<{ killed_count: number; vram_before_mb: number; vram_after_mb: number; freed_mb: number } | null>(null);

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

  const fetchGpu = useCallback(async () => {
    try {
      const res = await invoke<{ name: string; utilization: number; vram_total_mb: number; vram_used_mb: number; vram_free_mb: number; vram_usage_percent: number } | null>("get_gpu_usage");
      setGpuUsage(res);
    } catch { /* GPU 없을 수 있음 */ }
  }, []);

  useEffect(() => {
    fetchData();
    fetchGpu();
    const id = setInterval(() => { fetchData(); fetchGpu(); }, 3000);
    return () => clearInterval(id);
  }, [fetchData, fetchGpu]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const healthScore = useMemo(() => {
    if (!data) return 0;
    const cpuFree = 100 - data.cpu_usage;
    const memFree = 100 - data.memory_usage_percent;
    const avgDiskFree =
      data.disks.length > 0
        ? data.disks.reduce((sum, d) => sum + (100 - d.usage_percent), 0) / data.disks.length
        : 50;
    return Math.round(cpuFree * 0.3 + memFree * 0.3 + avgDiskFree * 0.4);
  }, [data]);

  const healthMessage = useMemo(() => {
    if (!data) return "";
    if (healthScore >= 75) return t("dashboard.healthGood");
    if (healthScore >= 50) return t("dashboard.healthWarning");
    return t("dashboard.healthBad");
  }, [data, healthScore, t]);

  const handleOptimize = async () => {
    setOptimizing(true);
    try {
      const status = await invoke<{ total_gb: number; used_gb: number; available_gb: number; usage_percent: number }>("get_memory_status");
      const beforeMb = status.used_gb * 1024;
      await invoke("optimize_memory");
      const after = await invoke<{ total_gb: number; used_gb: number; available_gb: number; usage_percent: number }>("get_memory_status");
      const afterMb = after.used_gb * 1024;
      setOptimizeResult({ before: Math.round(beforeMb), after: Math.round(afterMb), freed: Math.round(beforeMb - afterMb) });
    } catch (_e) { /* ignore */ }
    setOptimizing(false);
  };

  const handleVramKill = async () => {
    setKillingVram(true);
    try {
      const result = await invoke<{ killed_count: number; vram_before_mb: number; vram_after_mb: number; freed_mb: number }>("kill_vram_zombies");
      setVramKillResult(result);
      fetchGpu();
    } catch { /* ignore */ }
    setKillingVram(false);
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
    <div className="space-y-3">
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

      {/* 게이지: 건강점수 + 리소스 모니터 (콤팩트) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* 건강 점수 — 작은 게이지 */}
        <Card title={t("dashboard.healthScore")} icon={<HeartPulse className="h-4 w-4" />} className="h-full">
          <div className="flex flex-col items-center gap-1 py-1">
            <GaugeChart
              value={healthScore}
              label={t("dashboard.healthScore")}
              color={getHealthColor(healthScore)}
              size={100}
            />
            <p className="text-center text-xs text-[var(--color-muted-foreground)] leading-tight">
              {healthMessage}
            </p>
          </div>
        </Card>

        {/* 리소스 모니터 — 수평 바 스타일 */}
        <div className="lg:col-span-4">
          <Card title="리소스 모니터" icon={<Activity className="h-4 w-4" />} className="h-full">
            <div className="space-y-3">
              {/* CPU */}
              <div className="flex items-center gap-3">
                <Cpu className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
                <span className="w-12 shrink-0 text-xs font-medium text-[var(--color-card-foreground)]">CPU</span>
                <div className="relative flex-1 h-5 rounded-full bg-[var(--color-muted)]/50 overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${data.cpu_usage}%`, backgroundColor: getGaugeColor(data.cpu_usage) }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white mix-blend-difference">
                    {data.cpu_usage.toFixed(0)}%
                  </span>
                </div>
                <span className="w-20 shrink-0 text-right text-[10px] text-[var(--color-muted-foreground)]">{data.cpu_cores}코어</span>
              </div>

              {/* RAM */}
              <div className="flex items-center gap-3">
                <MemoryStick className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
                <span className="w-12 shrink-0 text-xs font-medium text-[var(--color-card-foreground)]">RAM</span>
                <div className="relative flex-1 h-5 rounded-full bg-[var(--color-muted)]/50 overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${data.memory_usage_percent}%`, backgroundColor: getGaugeColor(data.memory_usage_percent) }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white mix-blend-difference">
                    {data.memory_usage_percent.toFixed(0)}%
                  </span>
                </div>
                <span className="w-20 shrink-0 text-right text-[10px] text-[var(--color-muted-foreground)]">
                  {data.used_memory_gb.toFixed(1)}/{data.total_memory_gb.toFixed(1)} GB
                </span>
                <button
                  onClick={handleOptimize}
                  disabled={optimizing}
                  className="shrink-0 flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-2 py-1 text-[10px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {optimizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                  최적화
                </button>
              </div>

              {/* GPU (NVIDIA일 때만) */}
              {gpuUsage && (
                <>
                  <div className="flex items-center gap-3">
                    <MonitorSmartphone className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
                    <span className="w-12 shrink-0 text-xs font-medium text-[var(--color-card-foreground)]">GPU</span>
                    <div className="relative flex-1 h-5 rounded-full bg-[var(--color-muted)]/50 overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${gpuUsage.utilization}%`, backgroundColor: getGaugeColor(gpuUsage.utilization) }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white mix-blend-difference">
                        {gpuUsage.utilization}%
                      </span>
                    </div>
                    <span className="w-20 shrink-0 text-right text-[10px] text-[var(--color-muted-foreground)] truncate">
                      {gpuUsage.name.replace('NVIDIA ', '')}
                    </span>
                  </div>

                  {/* VRAM */}
                  <div className="flex items-center gap-3">
                    <MonitorSmartphone className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
                    <span className="w-12 shrink-0 text-xs font-medium text-[var(--color-card-foreground)]">VRAM</span>
                    <div className="relative flex-1 h-5 rounded-full bg-[var(--color-muted)]/50 overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${gpuUsage.vram_usage_percent}%`, backgroundColor: getGaugeColor(gpuUsage.vram_usage_percent) }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white mix-blend-difference">
                        {gpuUsage.vram_usage_percent.toFixed(0)}%
                      </span>
                    </div>
                    <span className="w-20 shrink-0 text-right text-[10px] text-[var(--color-muted-foreground)]">
                      {(gpuUsage.vram_used_mb / 1024).toFixed(1)}/{(gpuUsage.vram_total_mb / 1024).toFixed(1)} GB
                    </span>
                    <button
                      onClick={handleVramKill}
                      disabled={killingVram}
                      className="shrink-0 flex items-center gap-1 rounded-[var(--radius-md)] bg-orange-500 px-2 py-1 text-[10px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {killingVram ? <Loader2 className="h-3 w-3 animate-spin" /> : <Skull className="h-3 w-3" />}
                      최적화
                    </button>
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* 2행: 시스템 정보 — 풀폭 한 줄 */}
      <Card title="시스템 정보" icon={<Monitor className="h-4 w-4" />}>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
          <InfoRow label="PC 이름" value={data.hostname} />
          <InfoRow label="운영체제" value={`${data.os_name} ${data.os_version}`} />
          <InfoRow label="프로세서" value={data.cpu_name} />
          <InfoRow label="코어" value={`${data.cpu_cores}개`} />
          <InfoRow label="그래픽" value={data.gpu_name} />
          <InfoRow label="RAM" value={data.total_ram_gb} />
          <div className="flex items-center gap-2">
            <span className="shrink-0 whitespace-nowrap text-[var(--color-muted-foreground)]">가동 시간:</span>
            <span className="flex items-center gap-1 font-medium text-[var(--color-card-foreground)]">
              <Clock className="h-3.5 w-3.5" />
              {formatUptime(data.uptime_seconds)}
            </span>
            {data.uptime_seconds > 259200 && (
              <span className="group relative">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 cursor-help" />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-[var(--radius-md)] bg-[var(--color-card)] border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-card-foreground)] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 whitespace-nowrap">
                  가동 시간이 3일을 초과했습니다. PC를 재부팅하면 성능이 향상됩니다.
                </span>
              </span>
            )}
          </div>
        </div>
      </Card>

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

      {/* CPU/GPU 온도 - 에러가 나도 대시보드는 영향 없음 */}
      <TempErrorBoundary>
        <TempSection />
      </TempErrorBoundary>

      {/* 메모리 최적화 결과 팝업 */}
      {optimizeResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative w-80 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-6 shadow-xl">
            <button onClick={() => setOptimizeResult(null)} className="absolute right-3 top-3 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
              <X className="h-4 w-4" />
            </button>
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                <Zap className="h-6 w-6 text-emerald-500" />
              </div>
              <h3 className="text-lg font-bold text-[var(--color-card-foreground)]">메모리 최적화 완료!</h3>
              <div className="space-y-1 text-sm text-[var(--color-muted-foreground)]">
                <p>최적화 전: <strong>{optimizeResult.before} MB</strong></p>
                <p>최적화 후: <strong>{optimizeResult.after} MB</strong></p>
                <p className="text-emerald-500 font-medium">{optimizeResult.freed > 0 ? `${optimizeResult.freed} MB 확보!` : '이미 최적 상태입니다.'}</p>
              </div>
              <button onClick={() => { setOptimizeResult(null); fetchData(); }} className="mt-2 w-full rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VRAM 최적화 결과 팝업 */}
      {vramKillResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative w-80 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-6 shadow-xl">
            <button onClick={() => setVramKillResult(null)} className="absolute right-3 top-3 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
              <X className="h-4 w-4" />
            </button>
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/10">
                <Skull className="h-6 w-6 text-orange-500" />
              </div>
              <h3 className="text-lg font-bold text-[var(--color-card-foreground)]">VRAM 최적화 완료!</h3>
              <div className="space-y-1 text-sm text-[var(--color-muted-foreground)]">
                <p>종료한 프로세스: <strong>{vramKillResult.killed_count}개</strong></p>
                <p>최적화 전: <strong>{Math.round(vramKillResult.vram_before_mb)} MB</strong></p>
                <p>최적화 후: <strong>{Math.round(vramKillResult.vram_after_mb)} MB</strong></p>
                <p className="text-orange-500 font-medium">{vramKillResult.freed_mb > 0 ? `${Math.round(vramKillResult.freed_mb)} MB VRAM 확보!` : '좀비 프로세스가 없습니다.'}</p>
              </div>
              <button onClick={() => setVramKillResult(null)} className="mt-2 w-full rounded-[var(--radius-md)] bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/* ── Sub-components ────────────────────────────── */

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
    <div className="flex items-center gap-2">
      <span className="shrink-0 whitespace-nowrap text-[var(--color-muted-foreground)]">{label}:</span>
      <span className="flex items-center gap-1 font-medium text-[var(--color-card-foreground)]">
        {icon && <span className="shrink-0">{icon}</span>}
        <span>{value}</span>
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
        <span className="text-xs">
          <span className={`font-medium ${disk.usage_percent < 70 ? 'text-emerald-500' : disk.usage_percent < 90 ? 'text-amber-500' : 'text-red-500'}`}>
            여유 {disk.free_gb.toFixed(1)} GB
          </span>
          <span className="text-[var(--color-muted-foreground)]">
            {' '}· {disk.used_gb.toFixed(1)} / {disk.total_gb.toFixed(1)} GB ({disk.usage_percent.toFixed(0)}%)
          </span>
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

/* ── TempSection: CPU/GPU 온도 (별도 컴포넌트로 분리) ── */
function TempSection() {
  const [cpuTemp, setCpuTemp] = useState<number | null>(null);
  const [gpuTemp, setGpuTemp] = useState<number | null>(null);

  useEffect(() => {
    const fetchTemps = async () => {
      try {
        const result = await invoke<{
          cpu_name: string;
          cpu_avg_temp: number;
          gpu: { name: string; temperature: number; driver: string } | null;
        }>("get_hardware_temps");
        // cpu_avg_temp이 0보다 크면 유효한 값
        if (result.cpu_avg_temp > 0) setCpuTemp(result.cpu_avg_temp);
        if (result.gpu && result.gpu.temperature > 0) setGpuTemp(result.gpu.temperature);
      } catch (_e) {
        // 온도 센서 없거나 실패 시 무시
      }
    };
    fetchTemps();
    const interval = setInterval(fetchTemps, 5000);
    return () => clearInterval(interval);
  }, []);

  if (cpuTemp === null && gpuTemp === null) return null;

  return (
    <Card title="CPU / GPU 온도" icon={<Thermometer className="h-4 w-4" />}>
      <div className="flex flex-wrap items-center gap-6">
        {cpuTemp !== null && (
          <div className="flex items-center gap-3">
            <Cpu className="h-5 w-5 text-[var(--color-muted-foreground)]" />
            <div>
              <p className="text-xs text-[var(--color-muted-foreground)]">CPU 온도</p>
              <p className={`text-xl font-bold ${cpuTemp > 80 ? "text-[var(--color-destructive)]" : cpuTemp > 60 ? "text-[var(--color-warning)]" : "text-[var(--color-success)]"}`}>
                {cpuTemp.toFixed(0)}°C
              </p>
            </div>
          </div>
        )}
        {gpuTemp !== null && (
          <div className="flex items-center gap-3">
            <Monitor className="h-5 w-5 text-[var(--color-muted-foreground)]" />
            <div>
              <p className="text-xs text-[var(--color-muted-foreground)]">GPU 온도</p>
              <p className={`text-xl font-bold ${gpuTemp > 80 ? "text-[var(--color-destructive)]" : gpuTemp > 60 ? "text-[var(--color-warning)]" : "text-[var(--color-success)]"}`}>
                {gpuTemp.toFixed(0)}°C
              </p>
            </div>
          </div>
        )}
        <div className="text-xs text-[var(--color-muted-foreground)]">5초 간격 자동 갱신</div>
      </div>
    </Card>
  );
}

/* ── Error Boundary: 온도 섹션 크래시 격리 ── */
class TempErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return null; // 온도 에러 시 그냥 안 보여줌
    return this.props.children;
  }
}
