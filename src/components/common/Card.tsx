import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  icon?: ReactNode;
  headerRight?: ReactNode;
  noPadding?: boolean;
  children: ReactNode;
  className?: string;
}

export default function Card({ title, icon, headerRight, noPadding, children, className = "" }: CardProps) {
  return (
    <div
      className={`rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] ${noPadding ? "" : "p-5"} ${className}`}
    >
      {title && (
        <div className={`flex items-center gap-2 ${noPadding ? "px-5 pt-5 pb-4" : "mb-4"}`}>
          {icon && (
            <span className="text-[var(--color-primary)]">{icon}</span>
          )}
          <h3 className="text-sm font-semibold text-[var(--color-card-foreground)]">
            {title}
          </h3>
          {headerRight && <div className="ml-auto">{headerRight}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
