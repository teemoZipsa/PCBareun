import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Sun,
  Moon,
  Monitor,
  Info,
  Github,
  Shield,
  ShieldAlert,
  Palette,
  ExternalLink,
  Languages,
  Loader2,
  Instagram,
  Cat,
  Power,
  Heart,
  Coffee,
} from "lucide-react";
import Card from "@/components/common/Card";
import { useThemeStore } from "@/store/themeStore";
import { useLangStore, type Lang } from "@/store/langStore";
import { useT } from "@/i18n/useT";

const APP_VERSION = "0.1.0";

type ThemeOption = "light" | "dark" | "system";

const langOptions: { value: Lang; label: string; flag: string }[] = [
  { value: "ko", label: "한국어", flag: "🇰🇷" },
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "ja", label: "日本語", flag: "🇯🇵" },
];

export default function SettingsPage() {
  const { mode, setMode } = useThemeStore();
  const { lang, setLang } = useLangStore();
  const t = useT();
  const [restarting, setRestarting] = useState(false);
  const [autostart, setAutostart] = useState(false);
  const [autostartLoading, setAutostartLoading] = useState(true);

  useEffect(() => {
    invoke<{ enabled: boolean }>("get_autostart_status").then((r) => {
      setAutostart(r.enabled);
      setAutostartLoading(false);
    }).catch(() => setAutostartLoading(false));
  }, []);

  const handleThemeChange = (theme: ThemeOption) => {
    setMode(theme);
  };

  const themeOptions: { value: ThemeOption; labelKey: string; icon: React.ReactNode }[] = [
    { value: "light", labelKey: "settings.themeLight", icon: <Sun className="h-4 w-4" /> },
    { value: "dark", labelKey: "settings.themeDark", icon: <Moon className="h-4 w-4" /> },
    { value: "system", labelKey: "settings.themeSystem", icon: <Monitor className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-4">
      {/* 테마 설정 */}
      <Card title={t("settings.theme")} icon={<Palette className="h-4 w-4" />}>
        <div className="grid grid-cols-3 gap-2">
          {themeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleThemeChange(opt.value)}
              className={`flex flex-col items-center gap-1.5 rounded-[var(--radius-lg)] border-2 p-3 transition-all ${
                mode === opt.value
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                  : "border-[var(--color-border)] hover:border-[var(--color-muted-foreground)]"
              }`}
            >
              <span
                className={
                  mode === opt.value
                    ? "text-[var(--color-primary)]"
                    : "text-[var(--color-muted-foreground)]"
                }
              >
                {opt.icon}
              </span>
              <span
                className={`text-sm font-medium ${
                  mode === opt.value
                    ? "text-[var(--color-primary)]"
                    : "text-[var(--color-card-foreground)]"
                }`}
              >
                {t(opt.labelKey)}
              </span>
            </button>
          ))}
        </div>
      </Card>

      {/* 언어 설정 */}
      <Card title={t("settings.language")} icon={<Languages className="h-4 w-4" />}>
        <div className="grid grid-cols-3 gap-2">
          {langOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setLang(opt.value)}
              className={`flex flex-col items-center gap-1.5 rounded-[var(--radius-lg)] border-2 p-3 transition-all ${
                lang === opt.value
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                  : "border-[var(--color-border)] hover:border-[var(--color-muted-foreground)]"
              }`}
            >
              <span className="text-2xl">{opt.flag}</span>
              <span
                className={`text-sm font-medium ${
                  lang === opt.value
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

      {/* 관리자 권한 */}
      <Card title={t("settings.adminTitle")} icon={<ShieldAlert className="h-4 w-4" />}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--color-card-foreground)]">
              {t("settings.adminRestart")}
            </p>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              {t("settings.adminDesc")}
            </p>
          </div>
          <button
            onClick={async () => {
              setRestarting(true);
              try {
                await invoke("restart_as_admin");
              } catch {
                setRestarting(false);
              }
            }}
            disabled={restarting}
            className="flex items-center gap-2 rounded-[var(--radius-md)] bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {restarting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldAlert className="h-4 w-4" />
            )}
            {t("settings.restartBtn")}
          </button>
        </div>
      </Card>

      {/* 윈도우 시작 시 자동 실행 */}
      <Card title={t("settings.autostart")} icon={<Power className="h-4 w-4" />}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--color-card-foreground)]">
              {t("settings.autostartTitle")}
            </p>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              {t("settings.autostartDesc")}
            </p>
          </div>
          <button
            onClick={async () => {
              const next = !autostart;
              setAutostartLoading(true);
              try {
                await invoke("set_autostart", { enable: next });
                setAutostart(next);
              } catch (_e) { /* ignore */ }
              setAutostartLoading(false);
            }}
            disabled={autostartLoading}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              autostart ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-muted)]'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              autostart ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
      </Card>

      {/* 앱 정보 */}
      <Card title={t("settings.appInfo")} icon={<Info className="h-4 w-4" />}>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-primary)]/10">
              <Shield className="h-8 w-8 text-[var(--color-primary)]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[var(--color-card-foreground)]">
                {t("app.name")}
              </h3>
              <p className="text-sm text-[var(--color-muted-foreground)]">
                {t("settings.version")} {APP_VERSION}
              </p>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-[var(--color-muted-foreground)]">
            {t("settings.appDesc")}
          </p>

          <div className="space-y-2 rounded-[var(--radius-md)] bg-[var(--color-muted)]/50 p-4 text-sm text-[var(--color-muted-foreground)]">
            <p>🧹 <strong>정리</strong> — 임시 파일, 개인정보, 레지스트리, 중복 파일 정리</p>
            <p>🚀 <strong>최적화</strong> — 시작 프로그램 관리, 메모리 최적화, 블로트웨어 제거</p>
            <p>🛡️ <strong>보안</strong> — DNS 변조 검사, 악성코드 도구 연결</p>
            <p>📊 <strong>모니터링</strong> — CPU/GPU 온도, 네트워크 속도, 디스크 건강 확인</p>
            <p>⚙️ <strong>제어</strong> — Windows 업데이트 관리, 전원 옵션, 종료 타이머</p>
          </div>
        </div>
      </Card>

      {/* 후원하기 */}
      <div className="rounded-[var(--radius-lg)] border border-pink-500/20 bg-gradient-to-r from-pink-500/5 via-rose-500/5 to-orange-500/5 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pink-500/10">
            <Heart className="h-5 w-5 text-pink-500" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[var(--color-card-foreground)]">
              {t("settings.support")}
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
              {t("settings.supportDesc")}
            </p>
          </div>
          <button
            onClick={() => invoke("open_url", { url: lang === "ko" ? "https://ctee.kr/place/teemozipsa/post/2" : "https://ko-fi.com/teemozipsa" }).catch(() => {})}
            className="flex shrink-0 items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-pink-500/20 transition-all hover:shadow-pink-500/40 hover:scale-105 active:scale-95"
          >
            <><Coffee className="h-4 w-4" /> {t("settings.supportBtn")}</>
          </button>
        </div>
      </div>

      {/* 링크 */}
      <Card title={t("settings.links")} icon={<ExternalLink className="h-4 w-4" />}>
        <div className="space-y-2">
          <LinkButton
            icon={<Instagram className="h-4 w-4" />}
            label="@seon_7yu"
            sublabel="개발자 인스타그램"
            href="https://www.instagram.com/seon_7yu/"
          />
          <LinkButton
            icon={<Cat className="h-4 w-4" />}
            label="티모집사의 유용한 웹 도구 모음😺"
            sublabel="teemozipsa.github.io"
            href="https://teemozipsa.github.io/"
          />
          <LinkButton
            icon={<Github className="h-4 w-4" />}
            label={t("settings.github")}
            sublabel={t("settings.githubDesc")}
            href="https://github.com/teemoZipsa/PCBareun"
          />
          <LinkButton
            icon={<Shield className="h-4 w-4" />}
            label="Malware Zero (MZK)"
            sublabel="무료 악성코드 제거 도구"
            href="https://malzero.xyz/"
          />
        </div>
      </Card>

      {/* 하단 */}
      <div className="text-center text-xs text-[var(--color-muted-foreground)] space-y-1">
        <p>{t("settings.infoSummary")}</p>
        <p>&copy; 2026 PC Bareun. All rights reserved.</p>
      </div>
    </div>
  );
}




function LinkButton({
  icon,
  label,
  sublabel,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  href?: string;
}) {
  const handleClick = () => {
    if (href) invoke("open_url", { url: href }).catch(() => {});
  };
  return (
    <div
      onClick={handleClick}
      className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 transition-colors hover:bg-[var(--color-muted)]/50 cursor-pointer"
    >
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
