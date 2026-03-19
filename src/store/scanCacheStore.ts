import { create } from "zustand";

/* ─────────────────────────────────────────────────
   앱이 열려있는 동안 스캔 결과를 메모리에 보관합니다.
   persist 없음 → 앱 종료 시 초기화
───────────────────────────────────────────────── */

/* ── Temp Cleaner ── */
export interface CachedUnifiedItem {
  id: string;
  name: string;
  group: string;
  size_bytes: number;
  file_count: number;
  source: "temp" | "privacy";
}

interface TempCache {
  items: CachedUnifiedItem[];
  selected: string[];
}

/* ── Registry Cleaner ── */
export interface CachedRegistryIssue {
  id: string;
  category: string;
  path: string;
  name: string;
  description: string;
  severity: string;
}

interface RegistryCache {
  issues: CachedRegistryIssue[];
  selected: string[];
}

/* ── Software Updater ── */
export interface CachedSoftwareInfo {
  name: string;
  current_version: string;
  publisher: string;
  install_date: string;
  uninstall_string: string;
}

export interface CachedWingetUpgrade {
  name: string;
  id: string;
  current_version: string;
  available_version: string;
  source: string;
}

interface SoftwareCache {
  software: CachedSoftwareInfo[];
  wingetAvailable: boolean;
  wingetUpgrades: CachedWingetUpgrade[];
}

/* ── Store ── */
interface ScanCacheState {
  tempCache: TempCache | null;
  registryCache: RegistryCache | null;
  softwareCache: SoftwareCache | null;

  setTempCache: (items: CachedUnifiedItem[], selected: string[]) => void;
  clearTempCache: () => void;

  setRegistryCache: (issues: CachedRegistryIssue[], selected: string[]) => void;
  clearRegistryCache: () => void;

  setSoftwareCache: (software: CachedSoftwareInfo[], wingetAvailable: boolean, wingetUpgrades: CachedWingetUpgrade[]) => void;
  clearSoftwareCache: () => void;
}

export const useScanCacheStore = create<ScanCacheState>((set) => ({
  tempCache: null,
  registryCache: null,
  softwareCache: null,

  setTempCache: (items, selected) => set({ tempCache: { items, selected } }),
  clearTempCache: () => set({ tempCache: null }),

  setRegistryCache: (issues, selected) => set({ registryCache: { issues, selected } }),
  clearRegistryCache: () => set({ registryCache: null }),

  setSoftwareCache: (software, wingetAvailable, wingetUpgrades) =>
    set({ softwareCache: { software, wingetAvailable, wingetUpgrades } }),
  clearSoftwareCache: () => set({ softwareCache: null }),
}));
