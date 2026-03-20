import { useState } from "react";
import { Activity, PieChart, ShieldOff } from "lucide-react";

// 기존 페이지를 import
import DiskHealthPage from "./DiskHealthPage";
import DiskVisualizerPage from "./DiskVisualizerPage";
import SecureErasePage from "./SecureErasePage";

const tabs = [
  { id: "health", label: "상태 점검", icon: Activity, desc: "S.M.A.R.T. 기반 디스크 건강 진단" },
  { id: "visualizer", label: "공간 시각화", icon: PieChart, desc: "폴더별 디스크 사용량 분석" },
  { id: "secure-erase", label: "완전 삭제", icon: ShieldOff, desc: "보조 드라이브 데이터 영구 삭제 (Secure Erase / Zero-Fill)" },
] as const;

type TabId = (typeof tabs)[number]["id"];

export default function DiskPage() {
  const [activeTab, setActiveTab] = useState<TabId>("health");

  return (
    <div className="space-y-4">
      {/* 탭 전환 */}
      <div className="flex gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-[var(--radius-md)] border px-4 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                  : "border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]/50"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 현재 탭 설명 */}
      <p className="text-sm text-[var(--color-muted-foreground)]">
        {tabs.find((t) => t.id === activeTab)?.desc}
      </p>

      {/* 탭 콘텐츠 */}
      {activeTab === "health" && <DiskHealthPage />}
      {activeTab === "visualizer" && <DiskVisualizerPage />}
      {activeTab === "secure-erase" && <SecureErasePage />}
    </div>
  );
}
