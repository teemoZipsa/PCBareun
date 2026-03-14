import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Thermometer,
  Cpu,
  MonitorCog,
  RefreshCw,
  AlertCircle,
  Activity,
} from "lucide-react";
import Card from "@/components/common/Card";
import GaugeChart from "@/components/common/GaugeChart";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/* ── Types ─────────────────────────────────────── */

interface CpuTempInfo {
  label: string;
  temperature: number;
}

interface GpuTempInfo {
  name: string;
  temperature: number;
  driver: string;
}

interface HardwareTemps {
  cpu_name: string;
  cpu_temps: CpuTempInfo[];
  cpu_avg_temp: number;
  gpu: GpuTempInfo | null;
}

interface HistoryPoint {
  time: string;
  cpu: number;
  gpu: number;
}

/* ── Helpers ───────────────────────────────────── */

function tempColor(value: number): string {
  if (value <= 0) return "var(--color-muted-foreground)";
  if (value < 50) return "var(--color-success)";
  if (value < 75) return "var(--color-warning)";
  return "var(--color-destructive)";
}

function tempLabel(value: number): string {
  if (value <= 0) return "정보 없음";
  if (value < 50) return "정상";
  if (value < 75) return "주의";
  return "위험";
}

/* ── Component ──────────────────────────────────── */

export default function CpuGpuTempPage() {
  const [data, setData] = useState<HardwareTemps | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTemps = useCallback(async () => {
    try {
      setError(null);
      const result = await invoke<HardwareTemps>("get_hardware_temps");
      setData(result);

      // Add to history
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now
        .getMinutes()
        .toString()
        .padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

      setHistory((prev) => {
        const next = [
          ...prev,
          {
            time: timeStr,
            cpu: result.cpu_avg_temp,
            gpu: result.gpu?.temperature ?? 0,
          },
        ];
        return next.slice(-60); // keep last 60 data points
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTemps();
    intervalRef.current = setInterval(fetchTemps, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchTemps]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchTemps();
  };

  if (loading || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-3 text-[var(--color-muted-foreground)]">
          <Activity className="h-5 w-5 animate-pulse" />
          <span>온도 정보를 불러오는 중...</span>
        </div>
      </div>
    );
  }

  const cpuTemp = data.cpu_avg_temp;
  const gpuTemp = data.gpu?.temperature ?? 0;

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          CPU/GPU 온도를 실시간으로 모니터링합니다. (3초 간격 자동 갱신)
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

      {/* 에러 */}
      {error && (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 게이지 카드 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* CPU 온도 게이지 */}
        <Card title="CPU 온도" icon={<Cpu className="h-4 w-4" />}>
          <div className="flex flex-col items-center gap-2 py-2">
            {cpuTemp > 0 ? (
              <GaugeChart
                value={cpuTemp}
                label="CPU"
                sublabel={data.cpu_name}
                color={tempColor(cpuTemp)}
              />
            ) : (
              <div className="flex h-[140px] flex-col items-center justify-center gap-2">
                <Thermometer className="h-8 w-8 text-[var(--color-muted-foreground)]" />
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  관리자 권한이 필요합니다
                </p>
              </div>
            )}
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{
                color: tempColor(cpuTemp),
                backgroundColor: `color-mix(in srgb, ${tempColor(cpuTemp)} 15%, transparent)`,
              }}
            >
              {tempLabel(cpuTemp)}
            </span>
          </div>
        </Card>

        {/* GPU 온도 게이지 */}
        <Card title="GPU 온도" icon={<MonitorCog className="h-4 w-4" />}>
          <div className="flex flex-col items-center gap-2 py-2">
            {gpuTemp > 0 ? (
              <GaugeChart
                value={gpuTemp}
                label="GPU"
                sublabel={data.gpu?.name ?? ""}
                color={tempColor(gpuTemp)}
              />
            ) : (
              <div className="flex h-[140px] flex-col items-center justify-center gap-2">
                <MonitorCog className="h-8 w-8 text-[var(--color-muted-foreground)]" />
                <p className="text-xs text-center text-[var(--color-muted-foreground)]">
                  {data.gpu ? "GPU 온도 정보 없음" : "GPU를 찾을 수 없음"}
                </p>
              </div>
            )}
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{
                color: tempColor(gpuTemp),
                backgroundColor: `color-mix(in srgb, ${tempColor(gpuTemp)} 15%, transparent)`,
              }}
            >
              {gpuTemp > 0 ? tempLabel(gpuTemp) : "—"}
            </span>
          </div>
        </Card>

        {/* 상세 정보 */}
        <Card
          title="상세 정보"
          icon={<Thermometer className="h-4 w-4" />}
          className="sm:col-span-2 lg:col-span-1"
        >
          <div className="space-y-3 text-sm">
            <InfoRow label="프로세서" value={data.cpu_name} />
            {data.cpu_temps.map((t, i) => (
              <InfoRow
                key={i}
                label={t.label}
                value={t.temperature > 0 ? `${t.temperature}°C` : "—"}
                valueColor={tempColor(t.temperature)}
              />
            ))}
            {data.cpu_temps.length === 0 && (
              <InfoRow label="CPU 온도" value="데이터 없음" />
            )}
            <div className="border-t border-[var(--color-border)] pt-3" />
            <InfoRow
              label="GPU"
              value={data.gpu?.name ?? "감지되지 않음"}
            />
            {data.gpu && (
              <>
                <InfoRow
                  label="GPU 온도"
                  value={gpuTemp > 0 ? `${gpuTemp}°C` : "—"}
                  valueColor={tempColor(gpuTemp)}
                />
                <InfoRow label="드라이버" value={data.gpu.driver} />
              </>
            )}
          </div>
        </Card>
      </div>

      {/* 온도 이력 그래프 */}
      {history.length > 1 && (
        <Card title="온도 이력" icon={<Activity className="h-4 w-4" />}>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  domain={[0, 100]}
                  unit="°C"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    fontSize: 12,
                  }}
                  formatter={(value: unknown, name: unknown) => [
                    `${value}°C`,
                    name === "cpu" ? "CPU" : "GPU",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="cpu"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  dot={false}
                  name="cpu"
                />
                <Line
                  type="monotone"
                  dataKey="gpu"
                  stroke="var(--color-warning)"
                  strokeWidth={2}
                  dot={false}
                  name="gpu"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center justify-center gap-4 text-xs text-[var(--color-muted-foreground)]">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-primary)]" />
              CPU
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-warning)]" />
              GPU
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ── Sub-components ────────────────────────────── */

function InfoRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-muted-foreground)]">{label}</span>
      <span
        className="font-medium"
        style={{ color: valueColor ?? "var(--color-card-foreground)" }}
      >
        {value}
      </span>
    </div>
  );
}
