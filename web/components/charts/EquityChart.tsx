'use client';

import { useState, useRef, useEffect } from 'react';

interface DataPoint { t: number; v: number; label?: string; }

interface EquityChartProps {
  points: DataPoint[];
  height?: number;
}

export function EquityChart({ points, height = 260 }: EquityChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setW(e.contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  if (!points || points.length < 2) return null;

  const pad = { l: 44, r: 16, t: 12, b: 24 };
  const innerW = w - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;

  const values = points.map(p => p.v);
  const vMin = Math.min(...values);
  const vMax = Math.max(...values);
  const vRange = vMax - vMin || 1;
  const yPad = vRange * 0.15;
  const yMin = vMin - yPad;
  const yMax = vMax + yPad;

  const xAt = (i: number) => pad.l + (i / (points.length - 1)) * innerW;
  const yAt = (v: number) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(2)},${yAt(p.v).toFixed(2)}`).join(' ');
  const area = `${line} L${xAt(points.length - 1)},${pad.t + innerH} L${pad.l},${pad.t + innerH} Z`;

  const isUp = points[points.length - 1].v >= points[0].v;
  const lineColor = isUp ? 'var(--pos)' : 'var(--neg)';
  const gradId = isUp ? '#14ae5c' : '#f24822';

  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i / 4));

  const fmt = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`;

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.max(0, Math.min(points.length - 1, Math.round((x - pad.l) / innerW * (points.length - 1))));
    setHoverIdx(idx);
  };

  const hoverPoint = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    <div ref={containerRef} style={{ position: 'relative', height }}>
      <svg
        width={w} height={height}
        style={{ display: 'block', cursor: 'crosshair' }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={gradId} stopOpacity="0.18" />
            <stop offset="100%" stopColor={gradId} stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={pad.l} x2={w - pad.r} y1={yAt(v)} y2={yAt(v)} stroke="var(--border-subtle)" strokeWidth="0.5" />
            <text x={pad.l - 6} y={yAt(v) + 4} fill="var(--text-tertiary)" fontSize="9" textAnchor="end" fontFamily="var(--font-mono)">{fmt(v)}</text>
          </g>
        ))}
        <path d={area} fill="url(#equity-fill)" />
        <path d={line} stroke={lineColor} strokeWidth="1.5" fill="none" />
        {hoverIdx !== null && (
          <>
            <line x1={xAt(hoverIdx)} x2={xAt(hoverIdx)} y1={pad.t} y2={pad.t + innerH} stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="4 2" />
            <circle cx={xAt(hoverIdx)} cy={yAt(points[hoverIdx].v)} r="4" fill={lineColor} stroke="var(--bg-card)" strokeWidth="2" />
          </>
        )}
      </svg>
      {hoverPoint && hoverIdx !== null && (
        <div
          className="chart-tip"
          style={{ left: Math.min(Math.max(xAt(hoverIdx), 70), w - 80), top: yAt(hoverPoint.v) }}
        >
          {hoverPoint.label && <div className="tip-label">{hoverPoint.label}</div>}
          <div className="tip-val">${hoverPoint.v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
      )}
    </div>
  );
}
