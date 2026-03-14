import { Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "./components/layout/MainLayout";

// Pages
import DashboardPage from "./pages/DashboardPage";
import ServiceManagerPage from "./pages/ServiceManagerPage";
import TaskSchedulerPage from "./pages/TaskSchedulerPage";
import ProgramUninstallPage from "./pages/ProgramUninstallPage";
import DeepUninstallerPage from "./pages/DeepUninstallerPage";
import PrivacyCleanerPage from "./pages/PrivacyCleanerPage";
import DnsCheckPage from "./pages/DnsCheckPage";
import ContextMenuPage from "./pages/ContextMenuPage";
import ForceDeletePage from "./pages/ForceDeletePage";
import DiskVisualizerPage from "./pages/DiskVisualizerPage";
import DuplicateFinderPage from "./pages/DuplicateFinderPage";
import DiskHealthPage from "./pages/DiskHealthPage";
import CpuGpuTempPage from "./pages/CpuGpuTempPage";
import BsodAnalyzerPage from "./pages/BsodAnalyzerPage";
import ShutdownTimerPage from "./pages/ShutdownTimerPage";
import SoftwareUpdaterPage from "./pages/SoftwareUpdaterPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/services" element={<ServiceManagerPage />} />
        <Route path="/task-scheduler" element={<TaskSchedulerPage />} />
        <Route path="/programs" element={<ProgramUninstallPage />} />
        <Route path="/deep-uninstaller" element={<DeepUninstallerPage />} />
        <Route path="/privacy" element={<PrivacyCleanerPage />} />
        <Route path="/dns-check" element={<DnsCheckPage />} />
        <Route path="/context-menu" element={<ContextMenuPage />} />
        <Route path="/force-delete" element={<ForceDeletePage />} />
        <Route path="/disk-visualizer" element={<DiskVisualizerPage />} />
        <Route path="/duplicate-finder" element={<DuplicateFinderPage />} />
        <Route path="/disk-health" element={<DiskHealthPage />} />
        <Route path="/cpu-gpu-temp" element={<CpuGpuTempPage />} />
        <Route path="/bsod-analyzer" element={<BsodAnalyzerPage />} />
        <Route path="/shutdown-timer" element={<ShutdownTimerPage />} />
        <Route path="/software-updater" element={<SoftwareUpdaterPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
