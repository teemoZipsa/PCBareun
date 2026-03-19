import { create } from "zustand";
import { persist } from "zustand/middleware";

type ThemeMode = "light" | "dark" | "system";

interface ThemeState {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return mode === "dark";
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: "system" as ThemeMode,
      isDark: resolveIsDark("system"),
      setMode: (mode: ThemeMode) =>
        set({ mode, isDark: resolveIsDark(mode) }),
      toggle: () => {
        const current = get();
        const newMode: ThemeMode = current.isDark ? "light" : "dark";
        set({ mode: newMode, isDark: resolveIsDark(newMode) });
      },
    }),
    {
      name: "pcbareun-theme",
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isDark = resolveIsDark(state.mode);
        }
      },
    },
  ),
);

// Listen for system theme changes when mode is "system"
if (typeof window !== "undefined") {
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (e) => {
      const store = useThemeStore.getState();
      if (store.mode === "system") {
        useThemeStore.setState({ isDark: e.matches });
      }
    });
}
