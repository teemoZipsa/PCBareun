import { ShieldCheck } from "lucide-react";

interface SafetyBannerProps {
  message: string;
  size?: "sm" | "md" | "lg";
}

const ICON_SIZES = { sm: 15, md: 20, lg: 24 };

export default function SafetyBanner({ message, size = "md" }: SafetyBannerProps) {
  return (
    <div className="flex items-start gap-2.5 rounded-[var(--radius-md)] border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 px-3 py-2.5">
      <ShieldCheck size={ICON_SIZES[size]} className="mt-0.5 shrink-0 text-[var(--color-primary)]" />
      <p className="text-xs leading-relaxed text-[var(--color-muted-foreground)]">
        {message}
      </p>
    </div>
  );
}
