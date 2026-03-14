import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  MousePointerClick,
  RefreshCw,
  Loader2,
  Search,
  EyeOff,
  Eye,
  Trash2,
  FileText,
  FolderOpen,
  Monitor,
  HardDrive,
  Filter,
} from "lucide-react";
import Card from "@/components/common/Card";

/* ── Types ─────────────────────────────────────── */

interface ContextMenuItem {
  name: string;
  command: string;
  icon: string;
  registry_path: string;
  location: string; // "file" | "directory" | "background" | "drive"
}

type Phase = "idle" | "loading" | "loaded";

const LOCATION_LABELS: Record<string, { label: string; icon: typeof FileText }> = {
  file: { label: "파일", icon: FileText },
  directory: { label: "폴더", icon: FolderOpen },
  background: { label: "배경", icon: Monitor },
  drive: { label: "드라이브", icon: HardDrive },
};

/* ── Component ──────────────────────────────────── */

export default function ContextMenuPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [items, setItems] = useState<ContextMenuItem[]>([]);
  const [search, setSearch] = useState("");
  const [locFilter, setLocFilter] = useState<string>("all");
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState<Record<string, { type: "success" | "error"; msg: string }>>({});
  const [acting, setActing] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setPhase("loading");
    setError("");
    setActionMsg({});
    try {
      const data = await invoke<ContextMenuItem[]>("get_context_menu_items");
      setItems(data);
      setPhase("loaded");
    } catch (e: any) {
      setError(String(e));
      setPhase("idle");
    }
  }, []);

  const disableItem = async (regPath: string) => {
    setActing((p) => ({ ...p, [regPath]: true }));
    try {
      const msg = await invoke<string>("disable_context_menu_item", { registryPath: regPath });
      setActionMsg((p) => ({ ...p, [regPath]: { type: "success", msg } }));
    } catch (e: any) {
      setActionMsg((p) => ({ ...p, [regPath]: { type: "error", msg: String(e) } }));
    }
    setActing((p) => ({ ...p, [regPath]: false }));
  };

  const enableItem = async (regPath: string) => {
    setActing((p) => ({ ...p, [regPath]: true }));
    try {
      const msg = await invoke<string>("enable_context_menu_item", { registryPath: regPath });
      setActionMsg((p) => ({ ...p, [regPath]: { type: "success", msg } }));
    } catch (e: any) {
      setActionMsg((p) => ({ ...p, [regPath]: { type: "error", msg: String(e) } }));
    }
    setActing((p) => ({ ...p, [regPath]: false }));
  };

  const deleteItem = async (regPath: string) => {
    if (!confirm("이 컨텍스트 메뉴 항목을 완전히 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.")) return;
    setActing((p) => ({ ...p, [regPath]: true }));
    try {
      const msg = await invoke<string>("delete_context_menu_item", { registryPath: regPath });
      setActionMsg((p) => ({ ...p, [regPath]: { type: "success", msg } }));
      setItems((prev) => prev.filter((it) => it.registry_path !== regPath));
    } catch (e: any) {
      setActionMsg((p) => ({ ...p, [regPath]: { type: "error", msg: String(e) } }));
    }
    setActing((p) => ({ ...p, [regPath]: false }));
  };

  const locations = ["all", ...Array.from(new Set(items.map((i) => i.location)))];

  const filtered = items.filter((item) => {
    const matchSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.command.toLowerCase().includes(search.toLowerCase());
    const matchLoc = locFilter === "all" || item.location === locFilter;
    return matchSearch && matchLoc;
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted-foreground)]">
        마우스 우클릭 메뉴에 표시되는 항목을 관리합니다. 불필요한 항목을 비활성화하거나 삭제할 수 있습니다.
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
            <MousePointerClick className="h-4 w-4" />
          )}
          {phase === "loading" ? "스캔 중..." : "컨텍스트 메뉴 스캔"}
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
          {/* Search + Filter */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
              <input
                type="text"
                placeholder="메뉴 항목 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] py-2.5 pl-10 pr-4 text-sm text-[var(--color-card-foreground)] outline-none transition-colors focus:border-[var(--color-primary)] placeholder:text-[var(--color-muted-foreground)]/50"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Filter className="h-4 w-4 text-[var(--color-muted-foreground)]" />
              {locations.map((loc) => (
                <button
                  key={loc}
                  onClick={() => setLocFilter(loc)}
                  className={`rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-colors ${
                    locFilter === loc
                      ? "bg-[var(--color-primary)] text-white"
                      : "bg-[var(--color-muted)]/30 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]/50"
                  }`}
                >
                  {loc === "all"
                    ? "전체"
                    : LOCATION_LABELS[loc]?.label || loc}
                </button>
              ))}
            </div>
          </div>

          {/* Items List */}
          <Card
            title={`컨텍스트 메뉴 항목 (${filtered.length}개)`}
            icon={<MousePointerClick className="h-4 w-4" />}
          >
            <div className="max-h-[520px] space-y-2 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--color-muted-foreground)]">
                  검색 결과가 없습니다.
                </p>
              ) : (
                filtered.map((item) => {
                  const LocIcon = LOCATION_LABELS[item.location]?.icon || FileText;
                  return (
                    <div
                      key={item.registry_path}
                      className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-[var(--color-card-foreground)]">
                              {item.name}
                            </span>
                            <span className="flex items-center gap-1 rounded-full bg-[var(--color-muted)]/30 px-2 py-0.5 text-[10px] text-[var(--color-muted-foreground)]">
                              <LocIcon className="h-3 w-3" />
                              {LOCATION_LABELS[item.location]?.label || item.location}
                            </span>
                          </div>
                          {item.command && (
                            <p className="mt-1 truncate font-mono text-xs text-[var(--color-muted-foreground)]">
                              {item.command}
                            </p>
                          )}
                          <p className="mt-0.5 truncate text-[10px] text-[var(--color-muted-foreground)]/60">
                            {item.registry_path}
                          </p>
                          {actionMsg[item.registry_path] && (
                            <p
                              className={`mt-1 text-xs ${
                                actionMsg[item.registry_path].type === "success"
                                  ? "text-emerald-500"
                                  : "text-red-500"
                              }`}
                            >
                              {actionMsg[item.registry_path].msg}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {acting[item.registry_path] ? (
                            <Loader2 className="h-4 w-4 animate-spin text-[var(--color-primary)]" />
                          ) : (
                            <>
                              <button
                                onClick={() => disableItem(item.registry_path)}
                                title="비활성화 (LegacyDisable)"
                                className="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-amber-500/10 hover:text-amber-500"
                              >
                                <EyeOff className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => enableItem(item.registry_path)}
                                title="활성화 (LegacyDisable 제거)"
                                className="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-emerald-500/10 hover:text-emerald-500"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => deleteItem(item.registry_path)}
                                title="완전 삭제"
                                className="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-red-500/10 hover:text-red-500"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </>
      )}

      {/* Idle hint */}
      {phase === "idle" && !error && (
        <Card>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <MousePointerClick className="h-10 w-10 text-[var(--color-muted-foreground)]/50" />
            <p className="text-sm text-[var(--color-muted-foreground)]">
              스캔을 시작하면 레지스트리에서 컨텍스트 메뉴 항목을
              <br />
              검색하여 관리할 수 있습니다.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
