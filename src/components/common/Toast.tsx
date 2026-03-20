import { useToastStore } from "@/store/toastStore";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";

const iconMap = {
  success: <CheckCircle2 className="h-4 w-4 text-emerald-400" />, 
  error: <AlertCircle className="h-4 w-4 text-red-400" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-400" />,
  info: <Info className="h-4 w-4 text-blue-400" />,
};

const borderMap = {
  success: "border-emerald-500/30",
  error: "border-red-500/30",
  warning: "border-amber-500/30",
  info: "border-blue-500/30",
};

const bgMap = {
  success: "bg-emerald-500/5",
  error: "bg-red-500/5",
  warning: "bg-amber-500/5",
  info: "bg-blue-500/5",
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-start gap-3 rounded-[var(--radius-lg)] border ${borderMap[toast.type]} ${bgMap[toast.type]} bg-[var(--color-card)] px-4 py-3 shadow-lg backdrop-blur-sm animate-slide-in-right min-w-[280px] max-w-[380px]`}
        >
          <span className="mt-0.5 shrink-0">{iconMap[toast.type]}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--color-card-foreground)]">
              {toast.title}
            </p>
            {toast.description && (
              <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                {toast.description}
              </p>
            )}
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="shrink-0 rounded p-0.5 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
