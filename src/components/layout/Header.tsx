import { useLocation } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";

const pageTitles: Record<string, string> = {
  "/": "대시보드",
  "/services": "서비스 관리",
  "/task-scheduler": "작업 스케줄러 관리",
  "/programs": "프로그램 삭제",
  "/deep-uninstaller": "찌꺼기 완전삭제 언인스톨러",
  "/privacy": "개인정보 삭제",
  "/dns-check": "DNS 변조 체크",
  "/context-menu": "우클릭 메뉴 관리자",
  "/force-delete": "파일 강제삭제",
  "/disk-visualizer": "디스크 공간 시각화",
  "/duplicate-finder": "중복 파일 헌터",
  "/disk-health": "하드디스크 상태점검",
  "/cpu-gpu-temp": "CPU/GPU 온도",
  "/bsod-analyzer": "블루스크린 분석",
  "/shutdown-timer": "종료 타이머",
  "/software-updater": "소프트웨어 일괄 업데이트",
  "/settings": "설정",
};

export default function Header() {
  const location = useLocation();
  const { isDark, toggle } = useThemeStore();
  const title = pageTitles[location.pathname] || "피씨바른";

  return (
    <header className="h-14 border-b border-[var(--color-border)] bg-[var(--color-background)] flex items-center justify-between px-6 shrink-0">
      <h1 className="text-lg font-semibold text-[var(--color-foreground)]">
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
