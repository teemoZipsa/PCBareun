import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Download,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Package,
  Search,
  ArrowUpCircle,
  AlertTriangle,
} from "lucide-react";
import Card from "@/components/common/Card";

/* ── Types ─────────────────────────────────────── */

interface SoftwareInfo {
  name: string;
  current_version: string;
  publisher: string;
  install_date: string;
  uninstall_string: string;
}

type Phase = "idle" | "loading" | "loaded";

/* ── Component ──────────────────────────────────── */

export default function SoftwareUpdaterPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [software, setSoftware] = useState<SoftwareInfo[]>([]);
  const [wingetAvailable, setWingetAvailable] = useState(false);
  const [wingetOutput, setWingetOutput] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState<Record<string, "pending" | "success" | "error">>({});
  const [updateMsg, setUpdateMsg] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setPhase("loading");
    setError("");
    try {
      const [sw, winget] = await Promise.all([
        invoke<SoftwareInfo[]>("get_updatable_software"),
        invoke<boolean>("check_winget_available"),
      ]);
      setSoftware(sw);
      setWingetAvailable(winget);

      if (winget) {
        try {
          const output = await invoke<string>("winget_list_upgrades");
          setWingetOutput(output);
        } catch {
          setWingetOutput("");
        }
      }
      setPhase("loaded");
    } catch (e: any) {
      setError(String(e));
      setPhase("idle");
    }
  }, []);

  const upgrade = async (name: string) => {
    setUpdating((p) => ({ ...p, [name]: "pending" }));
    setUpdateMsg((p) => ({ ...p, [name]: "" }));
    try {
      const msg = await invoke<string>("winget_upgrade", { packageName: name });
      setUpdating((p) => ({ ...p, [name]: "success" }));
      setUpdateMsg((p) => ({ ...p, [name]: msg }));
    } catch (e: any) {
      setUpdating((p) => ({ ...p, [name]: "error" }));
      setUpdateMsg((p) => ({ ...p, [name]: String(e) }));
    }
  };

  const filtered = software.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.publisher.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted-foreground)]">
        설치된 소프트웨어를 확인하고, winget을 통해 최신 버전으로 업데이트합니다.
      </p>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={load}
          disabled={phase === "loading"}
          className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {phase === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Package className="h-4 w-4" />
          )}
          {phase === "loading" ? "소프트웨어 목록 로딩 중..." : "소프트웨어 목록 불러오기"}
        </button>
        {phase === "loaded" && (
          <button
            onClick={load}
            className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)]/30"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            새로고침
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-[var(--radius-md)] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error}
        </div>
      )}

      {phase === "loaded" && (
        <>
          {/* winget status */}
          <Card
            title="winget 상태"
            icon={<Download className="h-4 w-4" />}
          >
            <div className="flex items-center gap-2 py-1">
              {wingetAvailable ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm text-emerald-500">winget 사용 가능</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="text-sm text-red-500">
                    winget을 사용할 수 없습니다. Microsoft Store에서 "앱 설치 관리자"를 설치하세요.
                  </span>
                </>
              )}
            </div>
          </Card>

          {/* winget upgrades output */}
          {wingetAvailable && wingetOutput && (
            <Card
              title="업데이트 가능 목록 (winget)"
              icon={<ArrowUpCircle className="h-4 w-4" />}
            >
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-[var(--radius-sm)] bg-[var(--color-background)] p-3 font-mono text-xs text-[var(--color-muted-foreground)]">
                {wingetOutput}
              </pre>
            </Card>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
            <input
              type="text"
              placeholder="소프트웨어 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] py-2.5 pl-10 pr-4 text-sm text-[var(--color-card-foreground)] outline-none transition-colors focus:border-[var(--color-primary)] placeholder:text-[var(--color-muted-foreground)]/50"
            />
          </div>

          {/* Software List */}
          <Card
            title={`설치된 소프트웨어 (${filtered.length}개)`}
            icon={<Package className="h-4 w-4" />}
          >
            <div className="max-h-[520px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted-foreground)]">
                    <th className="pb-2 pr-4 font-medium">이름</th>
                    <th className="pb-2 pr-4 font-medium">버전</th>
                    <th className="pb-2 pr-4 font-medium">게시자</th>
                    <th className="pb-2 pr-4 font-medium">설치일</th>
                    {wingetAvailable && <th className="pb-2 font-medium">업데이트</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((sw) => (
                    <tr
                      key={sw.name + sw.current_version}
                      className="border-b border-[var(--color-border)]/50 last:border-0"
                    >
                      <td className="py-2 pr-4 font-medium text-[var(--color-card-foreground)]">
                        {sw.name}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs text-[var(--color-muted-foreground)]">
                        {sw.current_version}
                      </td>
                      <td className="py-2 pr-4 text-[var(--color-muted-foreground)]">
                        {sw.publisher || "-"}
                      </td>
                      <td className="py-2 pr-4 text-[var(--color-muted-foreground)]">
                        {sw.install_date
                          ? `${sw.install_date.slice(0, 4)}-${sw.install_date.slice(4, 6)}-${sw.install_date.slice(6, 8)}`
                          : "-"}
                      </td>
                      {wingetAvailable && (
                        <td className="py-2">
                          {updating[sw.name] === "pending" ? (
                            <Loader2 className="h-4 w-4 animate-spin text-[var(--color-primary)]" />
                          ) : updating[sw.name] === "success" ? (
                            <div className="flex items-center gap-1">
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              <span className="text-xs text-emerald-500">완료</span>
                            </div>
                          ) : updating[sw.name] === "error" ? (
                            <div className="group relative">
                              <div className="flex items-center gap-1">
                                <AlertTriangle className="h-4 w-4 text-amber-500" />
                                <span className="text-xs text-amber-500">실패</span>
                              </div>
                              {updateMsg[sw.name] && (
                                <div className="absolute bottom-full left-0 z-10 mb-1 hidden w-64 rounded-[var(--radius-sm)] bg-[var(--color-background)] p-2 text-xs text-[var(--color-muted-foreground)] shadow-lg group-hover:block">
                                  {updateMsg[sw.name]}
                                </div>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={() => upgrade(sw.name)}
                              className="flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-primary)]/10 px-2.5 py-1 text-xs font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)]/20"
                            >
                              <ArrowUpCircle className="h-3 w-3" />
                              업데이트
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <p className="py-8 text-center text-sm text-[var(--color-muted-foreground)]">
                  검색 결과가 없습니다.
                </p>
              )}
            </div>
          </Card>
        </>
      )}

      {/* Idle hint */}
      {phase === "idle" && !error && (
        <Card>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Package className="h-10 w-10 text-[var(--color-muted-foreground)]/50" />
            <p className="text-sm text-[var(--color-muted-foreground)]">
              소프트웨어 목록을 불러오면 설치된 프로그램과
              <br />
              업데이트 가능 여부를 확인할 수 있습니다.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
