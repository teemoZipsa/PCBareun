import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Cog,
  CalendarClock,
  PackageX,
  Trash2,
  ShieldCheck,
  Globe,
  MousePointerClick,
  FileX2,
  PieChart,
  Copy,
  HardDrive,
  Thermometer,
  AlertTriangle,
  Timer,
  RefreshCw,
  Settings,
} from "lucide-react";

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  isNew?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "",
    items: [
      { label: "대시보드", path: "/", icon: LayoutDashboard },
    ],
  },
  {
    title: "시스템 관리",
    items: [
      { label: "서비스 관리", path: "/services", icon: Cog },
      { label: "작업 스케줄러 관리", path: "/task-scheduler", icon: CalendarClock },
      { label: "프로그램 삭제", path: "/programs", icon: PackageX },
      { label: "찌꺼기 완전삭제", path: "/deep-uninstaller", icon: Trash2, isNew: true },
    ],
  },
  {
    title: "보안 / 개인정보",
    items: [
      { label: "개인정보 삭제", path: "/privacy", icon: ShieldCheck },
      { label: "DNS 변조 체크", path: "/dns-check", icon: Globe },
      { label: "우클릭 메뉴 관리자", path: "/context-menu", icon: MousePointerClick, isNew: true },
    ],
  },
  {
    title: "디스크 / 파일",
    items: [
      { label: "파일 강제삭제", path: "/force-delete", icon: FileX2 },
      { label: "디스크 공간 시각화", path: "/disk-visualizer", icon: PieChart, isNew: true },
      { label: "중복 파일 헌터", path: "/duplicate-finder", icon: Copy, isNew: true },
    ],
  },
  {
    title: "하드웨어 모니터링",
    items: [
      { label: "하드디스크 상태점검", path: "/disk-health", icon: HardDrive },
      { label: "CPU/GPU 온도", path: "/cpu-gpu-temp", icon: Thermometer },
      { label: "블루스크린 분석", path: "/bsod-analyzer", icon: AlertTriangle },
    ],
  },
  {
    title: "유틸리티",
    items: [
      { label: "종료 타이머", path: "/shutdown-timer", icon: Timer },
      { label: "소프트웨어 업데이트", path: "/software-updater", icon: RefreshCw, isNew: true },
    ],
  },
];

export default function Sidebar() {
  return (
    <aside className="w-60 h-screen bg-[var(--color-sidebar-bg)] border-r border-[var(--color-border)] flex flex-col overflow-y-auto shrink-0">
      {/* Logo */}
      <div className="h-14 flex items-center px-5 border-b border-[var(--color-border)]">
        <span className="text-lg font-bold text-[var(--color-foreground)]">
          피씨바른
        </span>
        <span className="ml-2 text-xs text-[var(--color-muted-foreground)]">
          PC Bareun
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-3 space-y-4">
        {navSections.map((section) => (
          <div key={section.title || "home"}>
            {section.title && (
              <p className="px-2 mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                {section.title}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    end={item.path === "/"}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--radius-md)] text-sm transition-colors ${
                        isActive
                          ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-medium"
                          : "text-[var(--color-sidebar-foreground)] hover:bg-[var(--color-muted)]"
                      }`
                    }
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {item.isNew && (
                      <span className="ml-auto text-[10px] font-bold bg-[var(--color-success)] text-white px-1.5 py-0.5 rounded-full leading-none">
                        NEW
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Settings at bottom */}
      <div className="p-3 border-t border-[var(--color-border)]">
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
          <span>설정</span>
        </NavLink>
      </div>
    </aside>
  );
}
