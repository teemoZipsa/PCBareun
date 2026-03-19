import { useLocation } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";
import { useT } from "@/i18n/useT";

const pageTitleKeys: Record<string, string> = {
  "/": "nav.dashboard",
  "/services": "nav.services",
  "/task-scheduler": "nav.taskScheduler",
  "/programs": "nav.programs",
  "/startup-manager": "nav.startupManager",
  "/temp-cleaner": "nav.tempCleaner",
  "/force-delete": "nav.forceDelete",
  "/duplicate-finder": "nav.duplicateFinder",
  "/bsod-analyzer": "nav.bsodAnalyzer",
  "/software-updater": "header.softwareUpdater",
  "/registry-cleaner": "nav.registryCleaner",
  "/debloat": "header.debloat",
  "/network": "nav.network",
  "/disk": "nav.disk",
  "/win-control": "nav.winControl",
  "/ai-optimizer": "nav.aiOptimizer",
  "/process-booster": "nav.processBooster",
  "/settings": "nav.settings",
};

export default function Header() {
  const location = useLocation();
  const { isDark, toggle } = useThemeStore();
  const t = useT();
  const titleKey = pageTitleKeys[location.pathname];
  const title = titleKey ? t(titleKey) : t("app.name");

  return (
    <header className="h-14 border-b border-[var(--color-border)] bg-[var(--color-background)] flex items-center justify-between px-6 shrink-0">
      <h1 className="truncate text-lg font-semibold text-[var(--color-foreground)]">
        {title}
      </h1>
      <button
        onClick={toggle}
        className="p-2 rounded-[var(--radius-md)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] transition-colors"
        aria-label="테마 전환"
      >
        {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>
    </header>
  );
}
