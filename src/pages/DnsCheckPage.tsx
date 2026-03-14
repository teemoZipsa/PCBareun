import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  FileText,
  Globe,
  RotateCcw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import Card from "@/components/common/Card";

/* ── Types ─────────────────────────────────────── */

interface DnsAdapter {
  name: string;
  dns_servers: string[];
  interface_index: number;
}

interface DnsCheckResult {
  adapters: DnsAdapter[];
  hosts_modified: boolean;
  hosts_suspicious_entries: string[];
}

type Phase = "idle" | "scanning" | "done";

/* ── Component ──────────────────────────────────── */

export default function DnsCheckPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<DnsCheckResult | null>(null);
  const [safeMap, setSafeMap] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [resetMsg, setResetMsg] = useState<Record<number, string>>({});

  const scan = useCallback(async () => {
    setPhase("scanning");
    setError("");
    setResetMsg({});
    try {
      const r = await invoke<DnsCheckResult>("check_dns");
      setResult(r);

      // check each DNS server safety
      const map: Record<string, boolean> = {};
      for (const adapter of r.adapters) {
        for (const server of adapter.dns_servers) {
          if (!(server in map)) {
            map[server] = await invoke<boolean>("is_dns_safe", { server });
          }
        }
      }
      setSafeMap(map);
      setPhase("done");
    } catch (e: any) {
      setError(String(e));
      setPhase("idle");
    }
  }, []);

  const resetDns = async (interfaceIndex: number) => {
    try {
      const msg = await invoke<string>("reset_dns_to_auto", {
        interfaceIndex,
      });
      setResetMsg((prev) => ({ ...prev, [interfaceIndex]: msg }));
    } catch (e: any) {
      setResetMsg((prev) => ({
        ...prev,
        [interfaceIndex]: `오류: ${String(e)}`,
      }));
    }
  };

  // Overall safety assessment
  const allSafe =
    result &&
    result.adapters.every((a) => a.dns_servers.every((s) => safeMap[s])) &&
    !result.hosts_modified;

  const hasUnsafeDns =
    result &&
    result.adapters.some((a) => a.dns_servers.some((s) => !safeMap[s]));

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted-foreground)]">
        DNS 설정과 hosts 파일을 검사하여 변조 여부를 확인합니다.
      </p>

      {/* Scan Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={scan}
          disabled={phase === "scanning"}
          className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {phase === "scanning" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Shield className="h-4 w-4" />
          )}
          {phase === "scanning" ? "검사 중..." : "DNS 검사 시작"}
        </button>
        {phase === "done" && (
          <button
            onClick={scan}
            className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)]/30"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            재검사
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-[var(--radius-md)] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error}
        </div>
      )}

      {/* Results */}
      {phase === "done" && result && (
        <>
          {/* Overall Status */}
          <Card
            title="종합 판정"
            icon={
              allSafe ? (
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-red-500" />
              )
            }
          >
            <div className="flex items-center gap-3 py-3">
              {allSafe ? (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                    <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                  </div>
                  <div>
                    <p className="font-medium text-emerald-500">안전</p>
                    <p className="text-sm text-[var(--color-muted-foreground)]">
                      DNS 설정과 hosts 파일이 정상입니다.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
                    <XCircle className="h-6 w-6 text-red-500" />
                  </div>
                  <div>
                    <p className="font-medium text-red-500">주의 필요</p>
                    <p className="text-sm text-[var(--color-muted-foreground)]">
                      {hasUnsafeDns && "알 수 없는 DNS 서버가 감지되었습니다. "}
                      {result.hosts_modified &&
                        "hosts 파일에 의심스러운 항목이 있습니다."}
                    </p>
                  </div>
                </>
              )}
            </div>
          </Card>

          {/* DNS Adapters */}
          <Card
            title={`네트워크 어댑터 DNS (${result.adapters.length}개)`}
            icon={<Globe className="h-4 w-4" />}
          >
            <div className="space-y-3 py-2">
              {result.adapters.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  DNS가 설정된 어댑터가 없습니다.
                </p>
              ) : (
                result.adapters.map((adapter) => {
                  const adapterSafe = adapter.dns_servers.every(
                    (s) => safeMap[s]
                  );
                  return (
                    <div
                      key={adapter.interface_index}
                      className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {adapterSafe ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          )}
                          <span className="text-sm font-medium text-[var(--color-card-foreground)]">
                            {adapter.name}
                          </span>
                        </div>
                        {!adapterSafe && (
                          <button
                            onClick={() => resetDns(adapter.interface_index)}
                            className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-500 transition-colors hover:bg-amber-500/20"
                          >
                            <RotateCcw className="h-3 w-3" />
                            자동(DHCP)으로 초기화
                          </button>
                        )}
                      </div>
                      <div className="mt-2 space-y-1">
                        {adapter.dns_servers.map((server) => (
                          <div
                            key={server}
                            className="flex items-center gap-2 text-sm"
                          >
                            <span
                              className={`inline-block h-2 w-2 rounded-full ${safeMap[server] ? "bg-emerald-500" : "bg-red-500"}`}
                            />
                            <code className="text-xs text-[var(--color-muted-foreground)]">
                              {server}
                            </code>
                            <span
                              className={`text-xs ${safeMap[server] ? "text-emerald-500" : "text-red-500"}`}
                            >
                              {safeMap[server] ? "안전" : "알 수 없음"}
                            </span>
                          </div>
                        ))}
                      </div>
                      {resetMsg[adapter.interface_index] && (
                        <p className="mt-2 text-xs text-[var(--color-primary)]">
                          {resetMsg[adapter.interface_index]}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          {/* Hosts File */}
          <Card
            title="hosts 파일 검사"
            icon={<FileText className="h-4 w-4" />}
          >
            <div className="py-2">
              {result.hosts_modified ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-amber-500">
                    <AlertTriangle className="h-4 w-4" />
                    의심스러운 항목 {result.hosts_suspicious_entries.length}개
                    발견
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-[var(--radius-sm)] bg-[var(--color-background)] p-3">
                    {result.hosts_suspicious_entries.map((entry, i) => (
                      <p
                        key={i}
                        className="font-mono text-xs text-[var(--color-muted-foreground)]"
                      >
                        {entry}
                      </p>
                    ))}
                  </div>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    경로: C:\Windows\System32\drivers\etc\hosts
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-emerald-500">
                  <CheckCircle2 className="h-4 w-4" />
                  hosts 파일이 정상입니다. 의심스러운 항목이 없습니다.
                </div>
              )}
            </div>
          </Card>
        </>
      )}

      {/* Idle hint */}
      {phase === "idle" && !error && (
        <Card>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Shield className="h-10 w-10 text-[var(--color-muted-foreground)]/50" />
            <p className="text-sm text-[var(--color-muted-foreground)]">
              DNS 검사를 시작하면 네트워크 어댑터의 DNS 설정과
              <br />
              hosts 파일의 변조 여부를 확인합니다.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
