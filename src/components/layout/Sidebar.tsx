import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { useT } from "@/i18n/useT";
import { useSidebarStore, ALL_TABS } from "@/store/sidebarStore";
import {
  LayoutDashboard,
  Settings,
  Cog,
  CalendarClock,
  PackageX,
  ShieldCheck,
  Globe,
  FileX2,
  PieChart,
  Copy,
  HardDrive,
  Thermometer,
  AlertTriangle,
  Timer,
  RefreshCw,
  Database,
  Zap,
  Rocket,
  FileX,
  GripVertical,
  Star,
  MemoryStick,
  Wifi,
  Server,
  BrainCircuit,
  Activity,
} from "lucide-react";

/* ── icon name → component map ─── */
const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard, Cog, CalendarClock, PackageX, ShieldCheck, Globe,
  FileX2, PieChart, Copy, HardDrive, Thermometer, AlertTriangle,
  Timer, RefreshCw, Database, Zap, Rocket, FileX, MemoryStick, Wifi,
  Server, BrainCircuit, Activity,
};

/* ── Sidebar ─── */
export default function Sidebar() {
  const t = useT();
  const { favorites, toggleFavorite, tabOrder, reorder } = useSidebarStore();

  // ── Mouse-based drag state ──
  const [dragPath, setDragPath] = useState<string | null>(null);
  const dragPathRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /** tabOrder 기준으로 정렬된 탭 */
  const sortedTabs = useMemo(() => {
    const tabMap = new Map(ALL_TABS.map((tab) => [tab.path, tab]));
    const ordered = tabOrder
      .map((path) => tabMap.get(path))
      .filter(Boolean) as typeof ALL_TABS;
    ALL_TABS.forEach((tab) => {
      if (!tabOrder.includes(tab.path)) ordered.push(tab);
    });
    return ordered;
  }, [tabOrder]);

  const favTabs = sortedTabs.filter((tab) => favorites.includes(tab.path));
  const otherTabs = sortedTabs.filter((tab) => !favorites.includes(tab.path));

  /* ── Mouse drag handlers ─── */
  const handleMouseDown = useCallback((e: React.MouseEvent, path: string) => {
    e.preventDefault();
    dragPathRef.current = path;
    setDragPath(path);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragPathRef.current || !listRef.current) return;
    // Find which tab element the mouse is over
    const items = listRef.current.querySelectorAll("[data-tab-path]");
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
        const targetPath = item.getAttribute("data-tab-path");
        if (targetPath && targetPath !== dragPathRef.current) {
          const fromIdx = tabOrder.indexOf(dragPathRef.current);
          const toIdx = tabOrder.indexOf(targetPath);
          if (fromIdx !== -1 && toIdx !== -1) {
            reorder(fromIdx, toIdx);
          }
        }
        break;
      }
    }
  }, [tabOrder, reorder]);

  const handleMouseUp = useCallback(() => {
    dragPathRef.current = null;
    setDragPath(null);
  }, []);

  useEffect(() => {
    if (dragPath) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [dragPath, handleMouseMove, handleMouseUp]);

  const renderTab = (tab: typeof ALL_TABS[0]) => {
    const Icon = iconMap[tab.iconName] || LayoutDashboard;
    const isFav = favorites.includes(tab.path);
    const isDragging = dragPath === tab.path;
    return (
      <li
        key={tab.path}
        data-tab-path={tab.path}
        className={`transition-all select-none ${isDragging ? "opacity-40 scale-95" : ""}`}
      >
        <div className="group flex items-center">
          {/* 드래그 핸들 — mousedown 으로 드래그 시작 */}
          <span
            onMouseDown={(e) => handleMouseDown(e, tab.path)}
            className="flex items-center justify-center w-5 shrink-0 cursor-grab active:cursor-grabbing py-1.5 pl-1"
            title="드래그하여 순서 변경"
          >
            <GripVertical className="w-3 h-3 opacity-30 hover:opacity-70 transition-opacity" />
          </span>
          <NavLink
            to={tab.path}
            title={t(tab.descKey)}
            className={({ isActive }) =>
              `flex flex-1 items-center gap-2 px-1.5 py-1.5 rounded-[var(--radius-md)] text-sm transition-colors ${
                isActive
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-medium"
                  : "text-[var(--color-sidebar-foreground)] hover:bg-[var(--color-muted)]"
              }`
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="truncate text-[13px]">{t(tab.labelKey)}</span>
            {tab.path === "/ai-optimizer" && (
              <span className="ml-auto self-center shrink-0 rounded-full bg-purple-500/20 px-1 py-px text-[8px] font-bold leading-none text-purple-400 ring-1 ring-purple-500/30 -translate-y-px">
                Beta
              </span>
            )}
          </NavLink>
          <button
            onClick={(e) => { e.stopPropagation(); toggleFavorite(tab.path); }}
            title={isFav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
            className="flex items-center justify-center w-7 h-7 rounded-r-[var(--radius-md)] opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--color-muted)]"
          >
            <Star
              className={`w-3.5 h-3.5 transition-colors ${
                isFav ? "fill-yellow-400 text-yellow-400" : "text-[var(--color-muted-foreground)]"
              }`}
            />
          </button>
        </div>
      </li>
    );
  };

  return (
    <aside className="w-56 h-screen bg-[var(--color-sidebar-bg)] border-r border-[var(--color-border)] flex flex-col overflow-hidden shrink-0">
      <div className="h-14 flex items-center px-4 border-b border-[var(--color-border)] shrink-0">
        <span className="text-base font-bold text-[var(--color-foreground)]">{t("app.name")}</span>
      </div>

      {/* Dashboard */}
      <div className="px-3 pt-3 pb-1 shrink-0">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--radius-md)] text-sm transition-colors ${
              isActive
                ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-medium"
                : "text-[var(--color-sidebar-foreground)] hover:bg-[var(--color-muted)]"
            }`
          }
        >
          <LayoutDashboard className="w-4 h-4 shrink-0" />
          <span>{t("nav.dashboard")}</span>
        </NavLink>
      </div>

      {/* Scrollable tabs */}
      <nav ref={listRef} className="flex-1 overflow-y-auto px-3 pb-2">
        {favTabs.length > 0 && (
          <div className="mt-2">
            <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-yellow-500">★ 즐겨찾기</p>
            <ul className="space-y-0.5">{favTabs.map((tab) => renderTab(tab))}</ul>
          </div>
        )}
        <div className="mt-3">
          <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">전체 도구</p>
          <ul className="space-y-0.5">{otherTabs.map((tab) => renderTab(tab))}</ul>
        </div>
      </nav>

      {/* 설정 */}
      <div className="p-3 border-t border-[var(--color-border)] shrink-0">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--radius-md)] text-sm transition-colors ${
              isActive
                ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-medium"
                : "text-[var(--color-sidebar-foreground)] hover:bg-[var(--color-muted)]"
            }`
          }
        >
          <Settings className="w-4 h-4 shrink-0" />
          <span>{t("nav.settings")}</span>
        </NavLink>
      </div>
    </aside>
  );
}
