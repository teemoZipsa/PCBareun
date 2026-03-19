import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  HardDrive,
  Loader2,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Clock,
  Thermometer,
  ShieldAlert,
} from "lucide-react";
import Card from "@/components/common/Card";

/* ── Types ─────────────────────────────────────── */

interface DiskHealthInfo {
  model: string;
  serial: string;
  media_type: string;
  size_gb: number;
  health_status: string;
  temperature: number | null;
  power_on_hours: number | null;
  read_errors: number | null;
  write_errors: number | null;
  wear_level: number | null;
  needs_admin: boolean;
}

/* ── Helpers ───────────────────────────────────── */

function formatPowerOnHours(hours: number | null): string {
  if (hours === null || hours === undefined) return "—";
  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  if (days > 365) {
    const years = (days / 365).toFixed(1);
    return `${years}년 (${hours.toLocaleString()}시간)`;
  }
  if (days > 0) return `${days}일 ${remainHours}시간`;
  return `${hours}시간`;
}

function healthIcon(status: string) {
  switch (status.toLowerCase()) {
    case "healthy":
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case "warning":
      return <AlertTriangle className="h-5 w-5 text-amber-400" />;
    case "unhealthy":
      return <XCircle className="h-5 w-5 text-red-500" />;
    default:
      return <AlertCircle className="h-5 w-5 text-[var(--color-muted-foreground)]" />;
  }
}

function healthLabel(status: string): { text: string; color: string } {
  switch (status.toLowerCase()) {
    case "healthy":
      return { text: "정상", color: "text-green-500" };
    case "warning":
      return { text: "주의", color: "text-amber-400" };
    case "unhealthy":
      return { text: "위험", color: "text-red-500" };
    default:
      return { text: status, color: "text-[var(--color-muted-foreground)]" };
  }
}

function mediaIcon(type: string) {
  if (type === "SSD") {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-blue-500/15">
        <HardDrive className="h-5 w-5 text-blue-400" />
      </div>
    );
  }
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-purple-500/15">
      <HardDrive className="h-5 w-5 text-purple-400" />
    </div>
  );
}

/* ── Component ──────────────────────────────────── */

export default function DiskHealthPage() {
  const [disks, setDisks] = useState<DiskHealthInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDisks = useCallback(async () => {
    try {
      setError(null);
      const result = await invoke<DiskHealthInfo[]>("get_disk_health");
      setDisks(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDisks();
  }, [fetchDisks]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-3 text-[var(--color-muted-foreground)]">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>디스크 상태를 확인하는 중...</span>
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
              fetchDisks();
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
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          SMART 데이터를 기반으로 디스크 건강 상태를 분석합니다.
        </p>
        <button
          onClick={() => {
            setLoading(true);
            fetchDisks();
          }}
          className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-xs font-medium text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          새로고침
        </button>
      </div>

      {/* 관리자 권한 안내 */}
      {disks.some((d) => d.needs_admin) && (
        <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-medium text-amber-500">
              SMART 데이터를 읽으려면 관리자 권한이 필요합니다
            </p>
            <p className="mt-0.5 text-xs text-amber-500/80">
              온도, 사용 시간, 오류 정보를 확인하려면 앱을 관리자 권한으로 다시 실행하세요.
            </p>
            <button
              onClick={async () => {
                try {
                  await invoke("restart_as_admin");
                } catch {}
              }}
              className="mt-2 rounded-[var(--radius-sm)] bg-amber-500 px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              관리자 권한으로 재시작
            </button>
          </div>
        </div>
      )}

      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="총 디스크" value={`${disks.length}개`} />
        <StatCard
          label="SSD"
          value={`${disks.filter((d) => d.media_type === "SSD").length}개`}
        />
        <StatCard
          label="HDD"
          value={`${disks.filter((d) => d.media_type === "HDD").length}개`}
        />
      </div>

      {/* 디스크 카드 목록 */}
      {disks.map((disk, i) => {
        const health = healthLabel(disk.health_status);
        return (
          <Card key={i}>
            {/* 디스크 헤더 */}
            <div className="flex items-center gap-4">
              {mediaIcon(disk.media_type)}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-[var(--color-card-foreground)]">
                    {disk.model}
                  </h3>
                  <span className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-muted-foreground)]">
                    {disk.media_type}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                  {disk.size_gb} GB · S/N: {disk.serial || "—"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {healthIcon(disk.health_status)}
                <span className={`text-sm font-semibold ${health.color}`}>
                  {health.text}
                </span>
              </div>
            </div>

            {/* SMART 속성 테이블 */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SmartAttribute
                icon={<Thermometer className="h-3.5 w-3.5" />}
                label="온도"
                value={
                  disk.temperature !== null
                    ? `${disk.temperature}°C`
                    : "—"
                }
              />
              <SmartAttribute
                icon={<Clock className="h-3.5 w-3.5" />}
                label="사용 시간"
                value={formatPowerOnHours(disk.power_on_hours)}
              />
              <SmartAttribute
                icon={<AlertCircle className="h-3.5 w-3.5" />}
                label="읽기 오류"
                value={
                  disk.read_errors !== null
                    ? disk.read_errors.toLocaleString()
                    : "—"
                }
                warn={!!disk.read_errors && disk.read_errors > 0}
              />
              <SmartAttribute
                icon={<AlertCircle className="h-3.5 w-3.5" />}
                label="쓰기 오류"
                value={
                  disk.write_errors !== null
                    ? disk.write_errors.toLocaleString()
                    : "—"
                }
                warn={!!disk.write_errors && disk.write_errors > 0}
              />
            </div>

            {/* SSD 마모도 */}
            {disk.media_type === "SSD" && disk.wear_level !== null && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="whitespace-nowrap text-[var(--color-muted-foreground)]">
                    SSD 마모도
                  </span>
                  <span className="font-medium text-[var(--color-card-foreground)]">
                    {disk.wear_level}%
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--color-muted)]">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${disk.wear_level < 50
                        ? "bg-green-500"
                        : disk.wear_level < 80
                          ? "bg-amber-400"
                          : "bg-red-500"
                      }`}
                    style={{ width: `${Math.min(disk.wear_level, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </Card>
        );
      })}

      {disks.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12">
          <HardDrive className="h-10 w-10 text-[var(--color-muted-foreground)]" />
          <p className="text-sm text-[var(--color-muted-foreground)]">
            디스크 정보를 가져올 수 없습니다.
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
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3">
      <p className="text-xs text-[var(--color-muted-foreground)]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[var(--color-card-foreground)]">
        {value}
      </p>
    </div>
  );
}

function SmartAttribute({
  icon,
  label,
  value,
  warn,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-sm)] bg-[var(--color-muted)]/30 px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
        {icon}
        {label}
      </div>
      <p
        className={`mt-1 text-sm font-semibold ${warn
            ? "text-amber-400"
            : "text-[var(--color-card-foreground)]"
          }`}
      >
        {value}
      </p>
    </div>
  );
}
