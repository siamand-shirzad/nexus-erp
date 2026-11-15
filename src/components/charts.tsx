"use client";

import { useId } from "react";
import { formatCurrency, formatNumber } from "@/lib/utils";

// ------------------------------------------------------------------
// Area chart (monthly revenue)
// ------------------------------------------------------------------

export function AreaChart({
  data,
  height = 240,
}: {
  data: Array<{ label: string; revenue: number; orders: number }>;
  height?: number;
}) {
  const gradientId = useId();
  const W = 640;
  const H = height;
  const padL = 52;
  const padR = 16;
  const padT = 18;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const max = Math.max(...data.map((d) => d.revenue), 1);
  const niceMax = max * 1.15;
  const x = (i: number) =>
    padL + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / niceMax) * innerH;

  const pts = data.map((d, i) => ({ x: x(i), y: y(d.revenue), d }));
  // Smooth curve using quadratic midpoints
  let line = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const mx = (p0.x + p1.x) / 2;
    line += ` C ${mx} ${p0.y}, ${mx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  const area = `${line} L ${pts[pts.length - 1].x} ${padT + innerH} L ${pts[0].x} ${
    padT + innerH
  } Z`;

  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((f) => niceMax * f);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Monthly revenue chart"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {gridVals.map((v, i) => (
        <g key={i}>
          <line
            x1={padL}
            x2={W - padR}
            y1={y(v)}
            y2={y(v)}
            stroke="#eef2f7"
            strokeWidth={1}
          />
          <text
            x={padL - 8}
            y={y(v) + 3.5}
            textAnchor="end"
            className="fill-slate-400"
            fontSize="10"
          >
            {formatCurrency(v, { compact: true })}
          </text>
        </g>
      ))}

      <path d={area} fill={`url(#${gradientId})`} className="animate-fade-in" />
      <path
        d={line}
        fill="none"
        stroke="#4f46e5"
        strokeWidth={2.5}
        strokeLinecap="round"
        className="chart-line-draw"
      />

      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3.6} fill="#fff" stroke="#4f46e5" strokeWidth={2}>
            <title>{`${p.d.label}: ${formatCurrency(p.d.revenue)} · ${p.d.orders} orders`}</title>
          </circle>
          <text
            x={p.x}
            y={H - 9}
            textAnchor="middle"
            className="fill-slate-500"
            fontSize="10.5"
            fontWeight={500}
          >
            {p.d.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ------------------------------------------------------------------
// Donut chart (status distribution)
// ------------------------------------------------------------------

export function DonutChart({
  data,
  size = 190,
  thickness = 22,
  centerLabel,
  centerValue,
}: {
  data: Array<{ label: string; value: number; color: string }>;
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#f1f5f9"
          strokeWidth={thickness}
        />
        {data.map((d, i) => {
          if (!d.value) return null;
          const len = (d.value / total) * c;
          // start where the previous segments end
          const offset = data.slice(0, i).reduce((s, x) => s + (x.value / total) * c, 0);
          const seg = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            >
              <title>{`${d.label}: ${d.value}`}</title>
            </circle>
          );
          return seg;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-bold text-slate-900 tnum">
          {centerValue ?? formatNumber(total)}
        </span>
        <span className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
          {centerLabel ?? "total"}
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Horizontal progress bars (sales by seller / stock)
// ------------------------------------------------------------------

export function Meter({
  value,
  max,
  color = "#4f46e5",
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}
