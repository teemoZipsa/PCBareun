import { RadialBarChart, RadialBar, PolarAngleAxis } from "recharts";

interface GaugeChartProps {
  value: number;
  label: string;
  sublabel?: string;
  color?: string;
  size?: number;
}

export default function GaugeChart({
  value,
  label,
  sublabel,
  color = "var(--color-primary)",
  size = 140,
}: GaugeChartProps) {
  const data = [{ value: Math.min(value, 100), fill: color }];

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <RadialBarChart
          width={size}
          height={size}
          cx={size / 2}
          cy={size / 2}
          innerRadius={size * 0.35}
          outerRadius={size * 0.48}
          barSize={size * 0.1}
          data={data}
          startAngle={225}
          endAngle={-45}
        >
          <PolarAngleAxis
            type="number"
            domain={[0, 100]}
            angleAxisId={0}
            tick={false}
          />
          <RadialBar
            dataKey="value"
            cornerRadius={size * 0.05}
            background={{ fill: "var(--color-muted)" }}
          />
        </RadialBarChart>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-[var(--color-foreground)]">
            {value.toFixed(0)}%
          </span>
        </div>
      </div>
      <span className="mt-1 text-sm font-medium text-[var(--color-foreground)]">
        {label}
      </span>
      {sublabel && (
        <span className="text-xs text-[var(--color-muted-foreground)]">
          {sublabel}
        </span>
      )}
    </div>
  );
}
