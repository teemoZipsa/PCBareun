import { useMemo } from "react";
import { useLangStore } from "@/store/langStore";
import ko from "./ko.json";
import en from "./en.json";
import ja from "./ja.json";

const dictionaries: Record<string, Record<string, string>> = { ko, en, ja };

export function useT() {
  const lang = useLangStore((s) => s.lang);
  return useMemo(() => {
    const dict = dictionaries[lang] ?? dictionaries.ko;
    return (key: string): string => dict[key] ?? dictionaries.ko[key] ?? key;
  }, [lang]);
}
