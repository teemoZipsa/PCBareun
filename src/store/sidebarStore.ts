import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface NavItem {
  labelKey: string;
  path: string;
  iconName: string;
  descKey: string;
}

/** 대시보드/설정 제외 전체 탭 목록 */
export const ALL_TABS: NavItem[] = [
  { labelKey: "nav.tempCleaner", path: "/temp-cleaner", iconName: "FileX", descKey: "desc.tempCleaner" },
  { labelKey: "nav.registryCleaner", path: "/registry-cleaner", iconName: "Database", descKey: "desc.registryCleaner" },
  { labelKey: "nav.startupManager", path: "/startup-manager", iconName: "Rocket", descKey: "desc.startupManager" },
  { labelKey: "nav.programs", path: "/programs", iconName: "PackageX", descKey: "desc.programs" },
  { labelKey: "nav.duplicateFinder", path: "/duplicate-finder", iconName: "Copy", descKey: "desc.duplicateFinder" },
  { labelKey: "nav.debloat", path: "/debloat", iconName: "Zap", descKey: "desc.debloat" },
  { labelKey: "nav.network", path: "/network", iconName: "Wifi", descKey: "desc.network" },
  { labelKey: "nav.winControl", path: "/win-control", iconName: "ShieldCheck", descKey: "desc.winControl" },
  { labelKey: "nav.disk", path: "/disk", iconName: "HardDrive", descKey: "desc.disk" },
  { labelKey: "nav.bsodAnalyzer", path: "/bsod-analyzer", iconName: "AlertTriangle", descKey: "desc.bsodAnalyzer" },
  { labelKey: "nav.forceDelete", path: "/force-delete", iconName: "FileX2", descKey: "desc.forceDelete" },
  { labelKey: "nav.softwareUpdater", path: "/software-updater", iconName: "RefreshCw", descKey: "desc.softwareUpdater" },
  { labelKey: "nav.services", path: "/services", iconName: "Server", descKey: "desc.services" },
  { labelKey: "nav.taskScheduler", path: "/task-scheduler", iconName: "CalendarClock", descKey: "desc.taskScheduler" },
  { labelKey: "nav.aiOptimizer", path: "/ai-optimizer", iconName: "BrainCircuit", descKey: "desc.aiOptimizer" },
  { labelKey: "nav.processBooster", path: "/process-booster", iconName: "Activity", descKey: "desc.processBooster" },
];

interface SidebarState {
  /** 즐겨찾기 경로들 */
  favorites: string[];
  /** 별표 토글 */
  toggleFavorite: (path: string) => void;
  /** 전체 탭 순서 (드래그로 변경 가능) */
  tabOrder: string[];
  reorder: (fromIndex: number, toIndex: number) => void;
  reset: () => void;
}

const defaultOrder = ALL_TABS.map((t) => t.path);

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      favorites: ["/temp-cleaner", "/registry-cleaner", "/startup-manager"],
      tabOrder: defaultOrder,
      toggleFavorite: (path) =>
        set((state) => ({
          favorites: state.favorites.includes(path)
            ? state.favorites.filter((f) => f !== path)
            : [...state.favorites, path],
        })),
      reorder: (fromIndex, toIndex) =>
        set((state) => {
          const items = [...state.tabOrder];
          const [moved] = items.splice(fromIndex, 1);
          items.splice(toIndex, 0, moved);
          return { tabOrder: items };
        }),
      reset: () => set({ favorites: ["/temp-cleaner", "/registry-cleaner", "/startup-manager"], tabOrder: defaultOrder }),
    }),
    { name: "pc-bareun-sidebar-v10" },
  ),
);
