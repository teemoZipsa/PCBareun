import { Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "./components/layout/MainLayout";

// Pages
import DashboardPage from "./pages/DashboardPage";
import ServiceManagerPage from "./pages/ServiceManagerPage";
import TaskSchedulerPage from "./pages/TaskSchedulerPage";
import ProgramUninstallPage from "./pages/ProgramUninstallPage";
// DeepUninstaller merged into ProgramUninstallPage
// PrivacyCleanerPage → TempCleanerPage로 통합됨
// DnsCheckPage → NetworkPage로 병합됨
import NetworkPage from "./pages/NetworkPage";

import ForceDeletePage from "./pages/ForceDeletePage";
// DiskVisualizer + DiskHealth → DiskPage로 병합됨
import DiskPage from "./pages/DiskPage";
import DuplicateFinderPage from "./pages/DuplicateFinderPage";
// CpuGpuTempPage → 대시보드로 이동됨
import BsodAnalyzerPage from "./pages/BsodAnalyzerPage";
// ShutdownTimerPage → WinControlPage로 병합됨
import SoftwareUpdaterPage from "./pages/SoftwareUpdaterPage";
import SettingsPage from "./pages/SettingsPage";
import RegistryCleanerPage from "./pages/RegistryCleanerPage";
import DebloatPage from "./pages/DebloatPage";
import StartupManagerPage from "./pages/StartupManagerPage";
import TempCleanerPage from "./pages/TempCleanerPage";
// MemoryOptimizerPage → 대시보드 메모리 카드로 통합됨
import WinControlPage from "./pages/WinControlPage";
import AiOptimizerPage from "./pages/AiOptimizerPage";
import ProcessBoosterPage from "./pages/ProcessBoosterPage";

export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/services" element={<ServiceManagerPage />} />
        <Route path="/task-scheduler" element={<TaskSchedulerPage />} />
        <Route path="/startup-manager" element={<StartupManagerPage />} />
        <Route path="/programs" element={<ProgramUninstallPage />} />
        <Route path="/deep-uninstaller" element={<Navigate to="/programs" replace />} />
        <Route path="/privacy" element={<Navigate to="/temp-cleaner" replace />} />
        <Route path="/network" element={<NetworkPage />} />
        {/* 이전 경로 호환 */}
        <Route path="/dns-check" element={<NetworkPage />} />
        <Route path="/network-monitor" element={<NetworkPage />} />

        <Route path="/temp-cleaner" element={<TempCleanerPage />} />
        <Route path="/force-delete" element={<ForceDeletePage />} />
        <Route path="/disk" element={<DiskPage />} />
        {/* 이전 경로 호환 */}
        <Route path="/disk-visualizer" element={<DiskPage />} />
        <Route path="/disk-health" element={<DiskPage />} />
        <Route path="/duplicate-finder" element={<DuplicateFinderPage />} />
        <Route path="/bsod-analyzer" element={<BsodAnalyzerPage />} />
        <Route path="/software-updater" element={<SoftwareUpdaterPage />} />
        <Route path="/registry-cleaner" element={<RegistryCleanerPage />} />
        <Route path="/debloat" element={<DebloatPage />} />
        <Route path="/memory-optimizer" element={<Navigate to="/" replace />} />
        <Route path="/win-control" element={<WinControlPage />} />
        <Route path="/ai-optimizer" element={<AiOptimizerPage />} />
        <Route path="/process-booster" element={<ProcessBoosterPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
