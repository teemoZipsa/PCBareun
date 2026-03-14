import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertOctagon,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  FileWarning,
  Clock,
  Hash,
} from "lucide-react";
import Card from "@/components/common/Card";

/* ── Types ─────────────────────────────────────── */

interface BsodEvent {
  timestamp: string;
  bug_check_code: string;
  description: string;
  dump_file: string;
  parameters: string;
}

interface BsodSummary {
  events: BsodEvent[];
  total_events: number;
  dump_files_count: number;
  latest_event: string | null;
}

/* ── Component ──────────────────────────────────── */

export default function BsodAnalyzerPage() {
  const [data, setData] = useState<BsodSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const result = await invoke<BsodSummary>("get_bsod_events");
      setData(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-3 text-[var(--color-muted-foreground)]">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>블루스크린 이벤트를 분석하는 중...</span>
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
              fetchData();
            }}
            className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-1.5 text-sm text-white hover:opacity-90"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // No events: clean state
  if (data.total_events === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Windows 이벤트 로그에서 블루스크린(BSOD) 기록을 분석합니다.
          </p>
          <button
            onClick={() => {
              setLoading(true);
              fetchData();
            }}
            className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-xs font-medium text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            새로고침
          </button>
        </div>
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-500/15">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold text-[var(--color-card-foreground)]">
              깨끗한 상태
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
              블루스크린(BSOD) 이벤트가 발견되지 않았습니다.
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
              시스템이 안정적으로 운영되고 있습니다.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Windows 이벤트 로그에서 블루스크린(BSOD) 기록을 분석합니다.
        </p>
        <button
          onClick={() => {
            setLoading(true);
            fetchData();
          }}
          className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-xs font-medium text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          새로고침
        </button>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          icon={<AlertOctagon className="h-4 w-4 text-red-400" />}
          label="BSOD 이벤트"
          value={`${data.total_events}건`}
          color="text-red-400"
        />
        <StatCard
          icon={<FileWarning className="h-4 w-4 text-amber-400" />}
          label="덤프 파일"
          value={`${data.dump_files_count}개`}
        />
        <StatCard
          icon={<Clock className="h-4 w-4 text-[var(--color-primary)]" />}
          label="마지막 발생"
          value={data.latest_event ?? "—"}
          small
        />
      </div>

      {/* 이벤트 타임라인 */}
      <Card
        title={`이벤트 이력 (${data.events.length}건)`}
        icon={<AlertOctagon className="h-4 w-4" />}
      >
        <div className="space-y-0">
          {data.events.map((event, i) => (
            <div
              key={i}
              className="relative flex gap-4 pb-6 last:pb-0"
            >
              {/* 타임라인 라인 */}
              {i < data.events.length - 1 && (
                <div className="absolute left-[11px] top-6 h-[calc(100%-12px)] w-[2px] bg-[var(--color-border)]" />
              )}

              {/* 타임라인 점 */}
              <div className="relative z-10 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-red-500/40 bg-red-500/15">
                <div className="h-2 w-2 rounded-full bg-red-500" />
              </div>

              {/* 이벤트 내용 */}
              <div className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-muted)]/20 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Hash className="h-3.5 w-3.5 text-red-400" />
                    <span className="font-mono text-sm font-semibold text-red-400">
                      {event.bug_check_code || "불명"}
                    </span>
                  </div>
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    {event.timestamp}
                  </span>
                </div>
                {event.description && (
                  <p className="mt-1.5 text-sm font-medium text-[var(--color-card-foreground)]">
                    {event.description}
                  </p>
                )}
                {event.dump_file && (
                  <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                    📁 {event.dump_file}
                  </p>
                )}
                {event.parameters && (
                  <p className="mt-1 font-mono text-[10px] text-[var(--color-muted-foreground)]">
                    Parameters: {event.parameters}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ── Sub-components ────────────────────────────── */

function StatCard({
  icon,
  label,
  value,
  color,
  small,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color?: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
        {icon}
        {label}
      </div>
      <p
        className={`mt-1 font-bold ${color ?? "text-[var(--color-card-foreground)]"} ${small ? "text-sm" : "text-2xl"
          }`}
      >
        {value}
      </p>
    </div>
  );
}
