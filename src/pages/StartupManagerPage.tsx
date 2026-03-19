import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Rocket,
  AlertCircle,
  CheckCircle2,
  Search,
  RotateCcw,
  Monitor,
  Shield,
  FolderOpen,
} from "lucide-react";
import Card from "@/components/common/Card";
import SafetyBanner from "@/components/common/SafetyBanner";
import SkeletonRows from "@/components/common/SkeletonRows";

/* ── Types ─────────────────────────────────────── */

interface StartupItem {
  name: string;
  command: string;
  location: string;
  enabled: boolean;
  publisher: string;
}

const locationLabels: Record<string, string> = {
  HKCU_Run: "현재 사용자",
  HKLM_Run: "모든 사용자",
  Startup_Folder: "시작 폴더",
};

const locationIcons: Record<string, React.ElementType> = {
  HKCU_Run: Monitor,
  HKLM_Run: Shield,
  Startup_Folder: FolderOpen,
};

/* ── Component ──────────────────────────────────── */

export default function StartupManagerPage() {
  const [items, setItems] = useState<StartupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [togglingName, setTogglingName] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<StartupItem[]>("get_startup_items");
      setItems(result);
      setLoaded(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleToggle = async (item: StartupItem) => {
    if (item.location === "Startup_Folder") {
      setActionMsg({
        type: "error",
        text: "시작 폴더 항목은 파일을 직접 관리해야 합니다.",
      });
      return;
    }

    setTogglingName(item.name);
    setActionMsg(null);
    try {
      const result = await invoke<string>("toggle_startup_item", {
        name: item.name,
        location: item.location,
        enable: !item.enabled,
      });
      setActionMsg({ type: "success", text: result });
      // Refresh
      const updated = await invoke<StartupItem[]>("get_startup_items");
      setItems(updated);
    } catch (err) {
      setActionMsg({ type: "error", text: String(err) });
    } finally {
      setTogglingName(null);
    }
  };

  const filteredItems = items.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.command.toLowerCase().includes(q) ||
      item.publisher.toLowerCase().includes(q)
    );
  });

  const enabledCount = items.filter((i) => i.enabled).length;
  const disabledCount = items.length - enabledCount;

  /* ── Idle state ─── */
  if (!loaded && !loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-16">
        <div className="relative">
          <div className="absolute inset-0 animate-pulse rounded-full bg-[var(--color-primary)]/20 blur-xl" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-2 border-[var(--color-primary)]/40 bg-[var(--color-card)]">
            <Rocket className="h-10 w-10 text-[var(--color-primary)]" />
          </div>
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-[var(--color-card-foreground)]">
            시작 프로그램 관리
          </h2>
          <p className="mt-2 max-w-md text-sm text-[var(--color-muted-foreground)]">
            Windows 부팅 시 자동으로 실행되는 프로그램을 관리합니다.
            불필요한 시작 프로그램을 비활성화하면 부팅 속도가 빨라집니다.
          </p>
        </div>
        {error && (
          <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <button
          onClick={fetchItems}
          className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-[var(--color-primary)]/25 transition-all hover:shadow-xl hover:brightness-110 active:scale-[0.98]"
        >
          <Search className="h-4 w-4" />
          시작 프로그램 스캔
        </button>
      </div>
    );
  }

  if (loading) {
    return <SkeletonRows rows={8} cols={3} />;
  }

  return (
    <div className="space-y-4">
      <SafetyBanner message="시작 프로그램을 비활성화해도 프로그램 자체는 삭제되지 않습니다. 언제든 다시 활성화할 수 있습니다." />

      {/* 통계 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3">
          <p className="text-xs text-[var(--color-muted-foreground)]">전체</p>
          <p className="mt-1 text-2xl font-bold text-[var(--color-card-foreground)]">
            {items.length}
          </p>
        </div>
        <div className="rounded-[var(--radius-md)] border border-amber-500/30 bg-[var(--color-card)] px-4 py-3">
          <p className="text-xs text-[var(--color-muted-foreground)]">활성</p>
          <p className="mt-1 text-2xl font-bold text-amber-400">
            {enabledCount}
          </p>
        </div>
        <div className="rounded-[var(--radius-md)] border border-green-500/30 bg-[var(--color-card)] px-4 py-3">
          <p className="text-xs text-[var(--color-muted-foreground)]">비활성</p>
          <p className="mt-1 text-2xl font-bold text-green-400">
            {disabledCount}
          </p>
        </div>
      </div>

      {/* 알림 */}
      {actionMsg && (
        <div
          className={`flex items-center gap-2 rounded-[var(--radius-md)] border px-4 py-2.5 text-sm ${
            actionMsg.type === "success"
              ? "border-green-500/30 bg-green-500/10 text-green-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {actionMsg.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{actionMsg.text}</span>
          <button
            onClick={() => setActionMsg(null)}
            className="ml-auto text-xs opacity-60 hover:opacity-100"
          >
            닫기
          </button>
        </div>
      )}

      {/* 검색 + 새로고침 */}
      <Card>
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
            <input
              type="text"
              placeholder="프로그램 이름 또는 게시자 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)] py-2 pl-9 pr-3 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>
          <button
            onClick={fetchItems}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-xs font-medium text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </Card>

      {/* 목록 */}
      <Card
        title={`시작 프로그램 (${filteredItems.length})`}
        icon={<Rocket className="h-4 w-4" />}
      >
        {filteredItems.length === 0 ? (
          <div className="flex items-center gap-2 py-6 text-sm text-[var(--color-muted-foreground)]">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            {items.length === 0
              ? "시작 프로그램이 없습니다."
              : "검색 결과가 없습니다."}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredItems.map((item) => {
              const LocIcon = locationIcons[item.location] || Monitor;
              return (
                <div
                  key={`${item.name}-${item.location}`}
                  className="flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 transition-colors hover:bg-[var(--color-muted)]/30"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[var(--color-card-foreground)] truncate">
                        {item.name}
                      </p>
                      <span className="flex items-center gap-1 shrink-0 rounded-full bg-[var(--color-muted)]/50 px-2 py-0.5 text-[10px] text-[var(--color-muted-foreground)]">
                        <LocIcon className="h-2.5 w-2.5" />
                        {locationLabels[item.location] || item.location}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)] truncate">
                      {item.publisher
                        ? `${item.publisher} — ${item.command}`
                        : item.command}
                    </p>
                  </div>

                  {/* Toggle */}
                  <button
                    onClick={() => handleToggle(item)}
                    disabled={
                      togglingName === item.name ||
                      item.location === "Startup_Folder"
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                      item.enabled ? "bg-amber-500" : "bg-green-500"
                    } ${
                      togglingName === item.name ||
                      item.location === "Startup_Folder"
                        ? "opacity-50"
                        : ""
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                        item.enabled ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                  <span
                    className={`w-10 text-right text-xs font-medium ${
                      item.enabled ? "text-amber-400" : "text-green-400"
                    }`}
                  >
                    {item.enabled ? "활성" : "비활성"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* 안내 */}
      <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
        <Rocket className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
        <div>
          <p className="font-medium text-[var(--color-card-foreground)]">
            부팅 속도 팁
          </p>
          <p className="mt-1">
            시작 프로그램이 많을수록 부팅 시간이 길어집니다. 자주 사용하지 않는
            프로그램은 비활성화하여 부팅 속도를 개선하세요. 비활성화해도 프로그램은
            삭제되지 않으며, 수동으로 언제든 실행할 수 있습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
