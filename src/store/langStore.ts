import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Lang = "ko" | "en" | "ja";

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useLangStore = create<LangState>()(
  persist(
    (set) => ({
      lang: "ko",
      setLang: (lang: Lang) => set({ lang }),
    }),
    { name: "pcbareun-lang" },
  ),
);
