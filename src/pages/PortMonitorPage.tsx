import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Network,
  Skull,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Zap,
  Plus,
  X,
} from "lucide-react";
import Card from "@/components/common/Card";

/* ── Types ── */
interface PortEntry {
  port: number;
  pid: number;
  process_name: string;
  protocol: string;
  state: string;
  memory_mb: number;
}

/* ── preset ports ── */
const PRESET_PORTS = [
  { port: 3000, label: "React / Next.js" },
  { port: 5173, label: "Vite" },
  { port: 8080, label: "Proxy / Spring" },
  { port: 8000, label: "FastAPI / Django" },
  { port: 5000, label: "Flask" },
  { port: 7860, label: "Gradio / WebUI" },
  { port: 8188, label: "ComfyUI" },
  { port: 11434, label: "Ollama" },
  { port: 3001, label: "Dev Alt" },
  { port: 4000, label: "GraphQL" },
];

/* ── helpers ── */
const stateColor: Record<string, string> = {
  Listen: "text-green-400",
  Established: "text-sky-400",
  TimeWait: "text-amber-400",
  CloseWait: "text-red-400",
  Listening: "text-green-400",
};

/* ── Component ── */
export default function PortMonitorPage() {
  const [entries, setEntries] = useState<PortEntry[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [customPort, setCustomPort] = useState("");
  const [extraPorts, setExtraPorts] = useState<{ port: number; label: string }[]>([]);

  const allPorts = [...PRESET_PORTS, ...extraPorts];

  const handleScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    setMsg(null);
    try {
      const portNums = allPorts.map((p) => p.port);
      const result = await invoke<PortEntry[]>("get_port_usage", { ports: portNums });
      setEntries(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setScanning(false);
    }
  }, [allPorts]);

  const handleKill = async (pid: number) => {
    try {
      const result = await invoke<string>("kill_process", { pid });
      setMsg(result);
      handleScan();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleKillZombieNodes = async () => {
    try {
      const result = await invoke<string>("kill_zombie_nodes");
      setMsg(result);
      handleScan();
    } catch (err) {
      setError(String(err));
    }
  };

  const addCustomPort = () => {
    const num = parseInt(customPort, 10);
    if (!num || num < 1 || num > 65535) return;
    if (allPorts.some((p) => p.port === num)) return;
    setExtraPorts((prev) => [...prev, { port: num, label: `Custom (${num})` }]);
    setCustomPort("");
  };

  const removeExtraPort = (port: number) => {
    setExtraPorts((prev) => prev.filter((p) => p.port !== port));
    setEntries((prev) => prev.filter((e) => e.port !== port));
  };

  // Group entries by port
  const portMap = new Map<number, PortEntry[]>();
  for (const e of entries) {
    const arr = portMap.get(e.port) ?? [];
    arr.push(e);
    portMap.set(e.port, arr);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted-foreground)]">
        개발/AI 서비스가 사용하는 주요 포트를 확인하고, 점유 중인 프로세스를 관리합니다.
      </p>

      {/* 커스텀 포트 + 액션 */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110 disabled:opacity-50"
          >
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {scanning ? "스캔 중..." : "포트 스캔"}
          </button>

          <button
            onClick={handleKillZombieNodes}
            className="flex items-center gap-2 rounded-[var(--radius-md)] border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20"
          >
            <Skull className="h-4 w-4" />
            좀비 Node.js 일괄 종료
          </button>

          <div className="ml-auto flex items-center gap-2">
            <input
              type="number"
              placeholder="포트 번호"
              value={customPort}
              onChange={(e) => setCustomPort(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addCustomPort(); }}
              className="w-28 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
            <button
              onClick={addCustomPort}
              className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)]"
            >
              <Plus className="h-3.5 w-3.5" />
              추가
            </button>
          </div>
        </div>
      </Card>

      {msg && (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-sm text-green-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{msg}</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 포트 그리드 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {allPorts.map(({ port, label }) => {
          const portEntries = portMap.get(port) ?? [];
          const isOccupied = portEntries.length > 0;
          const isExtra = extraPorts.some((p) => p.port === port);
          return (
            <div
              key={port}
              className={`relative rounded-[var(--radius-md)] border p-4 transition-colors ${
                isOccupied
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-[var(--color-border)] bg-[var(--color-card)]"
              }`}
            >
              {isExtra && (
                <button
                  onClick={() => removeExtraPort(port)}
                  className="absolute right-2 top-2 text-[var(--color-muted-foreground)] hover:text-red-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}

              <div className="flex items-center gap-2">
                <Network className={`h-4 w-4 ${isOccupied ? "text-amber-500" : "text-green-500"}`} />
                <span className="font-mono text-lg font-bold text-[var(--color-card-foreground)]">
                  :{port}
                </span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  isOccupied
                    ? "bg-amber-500/20 text-amber-400"
                    : "bg-green-500/20 text-green-400"
                }`}>
                  {isOccupied ? "사용 중" : "비어 있음"}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{label}</p>

              {portEntries.length > 0 && (
                <div className="mt-3 space-y-2">
                  {portEntries.map((entry, idx) => (
                    <div
                      key={`${entry.pid}-${idx}`}
                      className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-background)] px-3 py-2"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--color-card-foreground)] truncate">
                          {entry.process_name}
                          <span className="ml-2 text-xs text-[var(--color-muted-foreground)]">
                            PID {entry.pid}
                          </span>
                        </p>
                        <p className="text-xs text-[var(--color-muted-foreground)]">
                          {entry.protocol} ·{" "}
                          <span className={stateColor[entry.state] || "text-gray-400"}>
                            {entry.state}
                          </span>
                          {" "}· {entry.memory_mb} MB
                        </p>
                      </div>
                      <button
                        onClick={() => handleKill(entry.pid)}
                        title="프로세스 종료"
                        className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20"
                      >
                        <Trash2 className="h-3 w-3" />
                        Kill
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {entries.length === 0 && !scanning && (
        <div className="flex flex-col items-center gap-3 py-10">
          <Zap className="h-10 w-10 text-[var(--color-muted-foreground)]" />
          <p className="text-sm text-[var(--color-muted-foreground)]">
            "포트 스캔" 버튼을 눌러 점유 상태를 확인하세요.
          </p>
        </div>
      )}
    </div>
  );
}
