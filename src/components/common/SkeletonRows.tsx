interface SkeletonRowsProps {
  rows?: number;
  cols?: number;
}

export default function SkeletonRows({ rows = 8, cols = 4 }: SkeletonRowsProps) {
  return (
    <div className="space-y-3 p-4">
      {/* Header row */}
      <div className="flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div
            key={`h-${i}`}
            className="h-4 animate-pulse rounded bg-[var(--color-muted)]"
            style={{ width: `${100 / cols}%` }}
          />
        ))}
      </div>
      <div className="h-px bg-[var(--color-border)]" />
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={`${r}-${c}`}
              className="h-3.5 animate-pulse rounded bg-[var(--color-muted)]/60"
              style={{
                width: `${Math.max(40, 100 / cols - (c === 0 ? 0 : 10 + r * 3) % 20)}%`,
                animationDelay: `${(r * cols + c) * 50}ms`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
