import { useState } from "react";
import {
  Sun,
  Moon,
  Monitor,
  Info,
  Github,
  Heart,
  Shield,
  Palette,
  ExternalLink,
} from "lucide-react";
import Card from "@/components/common/Card";
import { useThemeStore } from "@/store/themeStore";

const APP_VERSION = "0.1.0";

type ThemeOption = "light" | "dark" | "system";

export default function SettingsPage() {
  const { isDark, toggle } = useThemeStore();
  const [selectedTheme, setSelectedTheme] = useState<ThemeOption>(
    isDark ? "dark" : "light",
  );

  const handleThemeChange = (theme: ThemeOption) => {
    setSelectedTheme(theme);
    if (theme === "system") {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      if (prefersDark !== isDark) toggle();
    } else if (theme === "dark" && !isDark) {
      toggle();
    } else if (theme === "light" && isDark) {
      toggle();
    }
  };

  const themeOptions: { value: ThemeOption; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: "라이트", icon: <Sun className="h-5 w-5" /> },
    { value: "dark", label: "다크", icon: <Moon className="h-5 w-5" /> },
    { value: "system", label: "시스템", icon: <Monitor className="h-5 w-5" /> },
  ];

  return (
    <div className="space-y-6">
      {/* 테마 설정 */}
      <Card title="테마" icon={<Palette className="h-4 w-4" />}>
        <div className="grid grid-cols-3 gap-3">
          {themeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleThemeChange(opt.value)}
              className={`flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border-2 p-4 transition-all ${
                selectedTheme === opt.value
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                  : "border-[var(--color-border)] hover:border-[var(--color-muted-foreground)]"
              }`}
            >
              <span
                className={
                  selectedTheme === opt.value
                    ? "text-[var(--color-primary)]"
                    : "text-[var(--color-muted-foreground)]"
                }
              >
                {opt.icon}
              </span>
              <span
                className={`text-sm font-medium ${
                  selectedTheme === opt.value
                    ? "text-[var(--color-primary)]"
                    : "text-[var(--color-card-foreground)]"
                }`}
              >
                {opt.label}
              </span>
            </button>
          ))}
        </div>
      </Card>

      {/* 앱 정보 */}
      <Card title="앱 정보" icon={<Info className="h-4 w-4" />}>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-primary)]/10">
              <Shield className="h-8 w-8 text-[var(--color-primary)]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[var(--color-card-foreground)]">
                피씨바른 (PC Bareun)
              </h3>
              <p className="text-sm text-[var(--color-muted-foreground)]">
                버전 {APP_VERSION}
              </p>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-[var(--color-muted-foreground)]">
            고클린(GoClean)에서 영감을 받아 만든 현대적 PC 관리 유틸리티입니다.
            Tauri v2 + React 19로 제작되었습니다.
          </p>

          <div className="space-y-2 rounded-[var(--radius-md)] bg-[var(--color-muted)]/50 p-4 text-sm">
            <InfoRow label="프레임워크" value="Tauri v2 (Rust + React 19)" />
            <InfoRow label="UI 라이브러리" value="Tailwind CSS v4" />
            <InfoRow label="아이콘" value="Lucide React" />
            <InfoRow label="차트" value="Recharts" />
            <InfoRow label="상태 관리" value="Zustand" />
            <InfoRow label="라이선스" value="MIT" />
          </div>
        </div>
      </Card>

      {/* 링크 */}
      <Card title="링크" icon={<ExternalLink className="h-4 w-4" />}>
        <div className="space-y-2">
          <LinkButton
            icon={<Github className="h-4 w-4" />}
            label="GitHub 저장소"
            sublabel="소스 코드 및 이슈 트래커"
          />
          <LinkButton
            icon={<Heart className="h-4 w-4" />}
            label="고클린 (GoClean)"
            sublabel="원본 프로젝트에 대한 경의"
          />
        </div>
      </Card>

      {/* 빌드 정보 */}
      <div className="text-center text-xs text-[var(--color-muted-foreground)]">
        <p>Made with Tauri v2 + React 19 + Rust</p>
        <p className="mt-1">© 2026 PC Bareun. All rights reserved.</p>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-muted-foreground)]">{label}</span>
      <span className="font-medium text-[var(--color-card-foreground)]">
        {value}
      </span>
    </div>
  );
}

function LinkButton({
  icon,
  label,
  sublabel,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 transition-colors hover:bg-[var(--color-muted)]/50">
      <span className="text-[var(--color-muted-foreground)]">{icon}</span>
      <div>
        <p className="text-sm font-medium text-[var(--color-card-foreground)]">
          {label}
        </p>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          {sublabel}
        </p>
      </div>
      <ExternalLink className="ml-auto h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
    </div>
  );
}
