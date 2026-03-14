import { useEffect, useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Package,
  Search,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  ArrowUpDown,
} from "lucide-react";
import Card from "@/components/common/Card";

interface InstalledProgram {
  name: string;
  publisher: string;
  version: string;
  install_date: string;
  size_mb: number;
  uninstall_string: string;
  registry_key: string;
}

type SortKey = "name" | "publisher" | "size_mb" | "install_date";
type SortDir = "asc" | "desc";

export default function ProgramUninstallPage() {
  const [programs, setPrograms] = useState<InstalledProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [actionMessage, setActionMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [uninstalling, setUninstalling] = useState<string | null>(null);

  const fetchPrograms = useCallback(async () => {
    try {
      setError(null);
      const result =
        await invoke<InstalledProgram[]>("get_installed_programs");
      setPrograms(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filteredPrograms = useMemo(() => {
    const filtered = programs.filter((p) => {
      if (searchQuery === "") return true;
      const q = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.publisher.toLowerCase().includes(q)
      );
    });

    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "publisher":
          cmp = a.publisher.localeCompare(b.publisher);
          break;
        case "size_mb":
          cmp = a.size_mb - b.size_mb;
          break;
        case "install_date":
          cmp = a.install_date.localeCompare(b.install_date);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return filtered;
  }, [programs, searchQuery, sortKey, sortDir]);

  const totalSizeMB = useMemo(
    () => programs.reduce((sum, p) => sum + p.size_mb, 0),
    [programs]
  );

  const handleUninstall = async (program: InstalledProgram) => {
    if (!program.uninstall_string) {
      setActionMessage({
        type: "error",
        text: `'${program.name}'의 제거 명령어를 찾을 수 없습니다.`,
      });
      return;
    }

    setUninstalling(program.registry_key);
    setActionMessage(null);

    try {
      const result = await invoke<string>("uninstall_program", {
        uninstallString: program.uninstall_string,
      });
      setActionMessage({ type: "success", text: `${program.name}: ${result}` });
    } catch (err) {
      setActionMessage({ type: "error", text: String(err) });
    } finally {
      setUninstalling(null);
    }
  };

  function formatDate(raw: string): string {
    if (!raw || raw.length !== 8) return raw || "-";
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }

  function formatSize(mb: number): string {
    if (mb <= 0) return "-";
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${mb.toFixed(1)} MB`;
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-3 text-[var(--color-muted-foreground)]">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>설치된 프로그램을 검색하는 중...</span>
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
              fetchPrograms();
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
      {/* 통계 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            설치된 프로그램
          </p>
          <p className="mt-1 text-2xl font-bold text-[var(--color-card-foreground)]">
            {programs.length}
          </p>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            총 용량
          </p>
          <p className="mt-1 text-2xl font-bold text-[var(--color-card-foreground)]">
            {formatSize(totalSizeMB)}
          </p>
        </div>
      </div>

      {/* 알림 */}
      {actionMessage && (
        <div
          className={`flex items-center gap-2 rounded-[var(--radius-md)] border px-4 py-2.5 text-sm ${
            actionMessage.type === "success"
              ? "border-green-500/30 bg-green-500/10 text-green-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {actionMessage.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{actionMessage.text}</span>
          <button
            onClick={() => setActionMessage(null)}
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
            onClick={() => {
              setLoading(true);
              fetchPrograms();
            }}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-xs font-medium text-[var(--color-card-foreground)] transition-colors hover:bg-[var(--color-muted)]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </Card>

      {/* 프로그램 테이블 */}
      <Card
        title={`프로그램 목록 (${filteredPrograms.length})`}
        icon={<Package className="h-4 w-4" />}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs font-medium text-[var(--color-muted-foreground)]">
                <SortHeader
                  label="프로그램"
                  sortKey="name"
                  currentKey={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                />
                <SortHeader
                  label="게시자"
                  sortKey="publisher"
                  currentKey={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                  className="hidden md:table-cell"
                />
                <th className="hidden pb-3 pr-3 lg:table-cell">버전</th>
                <SortHeader
                  label="설치일"
                  sortKey="install_date"
                  currentKey={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                  className="hidden lg:table-cell"
                />
                <SortHeader
                  label="크기"
                  sortKey="size_mb"
                  currentKey={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                />
                <th className="pb-3 text-right">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {filteredPrograms.map((program) => (
                <tr
                  key={program.registry_key}
                  className="transition-colors hover:bg-[var(--color-muted)]/30"
                >
                  <td className="py-3 pr-3">
                    <p className="font-medium text-[var(--color-card-foreground)]">
                      {program.name}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)] md:hidden">
                      {program.publisher || "-"}
                    </p>
                  </td>
                  <td className="hidden py-3 pr-3 text-[var(--color-card-foreground)] md:table-cell">
                    {program.publisher || "-"}
                  </td>
                  <td className="hidden py-3 pr-3 text-xs text-[var(--color-muted-foreground)] lg:table-cell">
                    {program.version || "-"}
                  </td>
                  <td className="hidden py-3 pr-3 text-xs text-[var(--color-muted-foreground)] lg:table-cell">
                    {formatDate(program.install_date)}
                  </td>
                  <td className="py-3 pr-3 text-xs text-[var(--color-muted-foreground)]">
                    {formatSize(program.size_mb)}
                  </td>
                  <td className="py-3 text-right">
                    <button
                      onClick={() => handleUninstall(program)}
                      disabled={
                        uninstalling === program.registry_key ||
                        !program.uninstall_string
                      }
                      title={
                        program.uninstall_string
                          ? "프로그램 제거"
                          : "제거 명령어 없음"
                      }
                      className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-red-500/30 px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-40"
                    >
                      {uninstalling === program.registry_key ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                      <span className="hidden sm:inline">제거</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredPrograms.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--color-muted-foreground)]">
              검색 결과가 없습니다.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  currentKey,
  dir,
  onClick,
  className = "",
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  dir: SortDir;
  onClick: (key: SortKey) => void;
  className?: string;
}) {
  const isActive = sortKey === currentKey;
  return (
    <th className={`pb-3 pr-3 ${className}`}>
      <button
        onClick={() => onClick(sortKey)}
        className="flex items-center gap-1 hover:text-[var(--color-foreground)]"
      >
        {label}
        <ArrowUpDown
          className={`h-3 w-3 ${isActive ? "text-[var(--color-primary)]" : "opacity-40"}`}
        />
        {isActive && (
          <span className="text-[10px] text-[var(--color-primary)]">
            {dir === "asc" ? "▲" : "▼"}
          </span>
        )}
      </button>
    </th>
  );
}
