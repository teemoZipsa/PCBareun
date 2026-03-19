import { create } from "zustand";

interface ProcessMemInfo {
  name: string;
  pid: number;
  memory_mb: number;
}

interface MemoryStatus {
  total_gb: number;
  used_gb: number;
  available_gb: number;
  usage_percent: number;
  top_processes: ProcessMemInfo[];
}

interface MemoryStore {
  status: MemoryStatus | null;
  result: string | null;
  setStatus: (s: MemoryStatus) => void;
  setResult: (r: string | null) => void;
}

export const useMemoryStore = create<MemoryStore>((set) => ({
  status: null,
  result: null,
  setStatus: (status) => set({ status }),
  setResult: (result) => set({ result }),
}));
