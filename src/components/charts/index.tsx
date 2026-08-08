import * as React from "react";
import { cn } from "@/lib/utils";

/* Small, quiet inline SVG replacements for the CLI's Unicode charts. */

export function Sparkline({
  values,
  width = 120,
  height = 26,
  stroke = "var(--color-primary)",
  showDot = true,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  showDot?: boolean;
  className?: string;
}) {
  if (values.length < 2) {
    return (
      <svg width={width} height={height} className={className} aria-hidden>
        <line
          x1="2"
          y1={height / 2}
          x2={width - 2}
          y2={height / 2}
          stroke="var(--color-border-hi)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const points = values.map((v, i) => {
    const x = pad + (i * (width - pad * 2)) / (values.length - 1);
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const last = points[points.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className}>
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.map(([x, y]) => `${x},${y}`).join(" ")}
      />
      {showDot ? <circle cx={last[0]} cy={last[1]} r="2.5" fill={stroke} /> : null}
    </svg>
  );
}

export function RingGauge({
  value,
  max = 2,
  label,
  tone = "var(--color-primary)",
  size = 64,
}: {
  value: number;
  max?: number;
  label: string;
  tone?: string;
  size?: number;
}) {
  const r = size / 2 - 5;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth="6"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${circumference * pct} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-mono text-[17px] font-bold">
        {label}
      </span>
    </div>
  );
}

/** Horizontal distribution bars — replaces the CLI's distributionChart. */
export function DistributionBars({
  rows,
  tone = "var(--color-primary)",
  unit = "%",
}: {
  rows: { label: string; value: number }[];
  tone?: string;
  unit?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-xs text-muted-fg">{r.label}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full transition-[width]"
              style={{ width: `${(r.value / max) * 100}%`, background: tone }}
            />
          </span>
          <span className="w-14 shrink-0 text-right font-mono text-[12px] text-muted-fg">
            {r.value}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Column chart for weekly volume / counts. */
export function BarChart({
  data,
  height = 120,
  tone = "var(--color-primary)",
  formatValue = (v: number) => String(v),
}: {
  data: { label: string; value: number }[];
  height?: number;
  tone?: string;
  formatValue?: (value: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {data.map((d) => (
        <div key={d.label} className="group flex flex-1 flex-col items-center justify-end gap-1.5">
          <span className="font-mono text-[10px] text-subtle opacity-0 transition group-hover:opacity-100">
            {formatValue(d.value)}
          </span>
          <span
            className="w-full rounded-t-[4px] transition-opacity hover:opacity-80"
            style={{
              height: `${Math.max(2, (d.value / max) * (height - 34))}px`,
              background: d.value === 0 ? "var(--color-muted)" : tone,
            }}
          />
          <span className="truncate text-[10px] text-subtle">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Progression line with dots — movement loads, RPE trend, PR history. */
export function LineChart({
  points,
  height = 160,
  tone = "var(--color-primary)",
  yLabel,
  formatValue = (v: number) => String(v),
  className,
}: {
  points: { label: string; value: number }[];
  height?: number;
  tone?: string;
  yLabel?: string;
  formatValue?: (value: number) => string;
  className?: string;
}) {
  const width = 640;
  const padX = 8;
  const padY = 16;

  if (points.length === 0) {
    return (
      <p className="px-1 py-8 text-center text-xs text-subtle">Not enough data yet</p>
    );
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coords = points.map((p, i) => {
    const x =
      points.length === 1
        ? width / 2
        : padX + (i * (width - padX * 2)) / (points.length - 1);
    const y = height - padY - ((p.value - min) / span) * (height - padY * 2);
    return { ...p, x, y };
  });

  return (
    <div className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        preserveAspectRatio="none"
      >
        <line
          x1={padX}
          y1={height - padY}
          x2={width - padX}
          y2={height - padY}
          stroke="var(--color-border)"
          strokeWidth="1"
        />
        <polyline
          fill="none"
          stroke={tone}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={coords.map((c) => `${c.x},${c.y}`).join(" ")}
          vectorEffect="non-scaling-stroke"
        />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r="3" fill={tone}>
            <title>{`${c.label}: ${formatValue(c.value)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-subtle">
        <span>
          {formatValue(min)}
          {yLabel ? ` ${yLabel}` : ""}
        </span>
        <span>
          {formatValue(max)}
          {yLabel ? ` ${yLabel}` : ""}
        </span>
      </div>
    </div>
  );
}

/** M T W T F S S dot week from the mockup. */
export function DotWeek({ counts }: { counts: number[] }) {
  const labels = ["M", "T", "W", "T", "F", "S", "S"];
  // counts arrive Sunday-first (JS getUTCDay); rotate to Monday-first.
  const ordered = [1, 2, 3, 4, 5, 6, 0].map((d) => counts[d] ?? 0);
  return (
    <div className="font-mono text-[11px] leading-6 text-subtle">
      <div className="flex gap-2">
        {labels.map((l, i) => (
          <span key={i} className="w-3 text-center">
            {l}
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        {ordered.map((c, i) => (
          <span key={i} className={cn("w-3 text-center", c > 0 && "text-primary")}>
            {c > 0 ? "●" : "—"}
          </span>
        ))}
      </div>
    </div>
  );
}
