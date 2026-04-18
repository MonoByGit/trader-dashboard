'use client';

interface SparklineProps {
  points: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
}

export function Sparkline({ points, width = 64, height = 20, color, fill = true }: SparklineProps) {
  if (!points || points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  const d = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(2)},${(height - ((p - min) / range) * (height - 2) - 1).toFixed(2)}`
  ).join(' ');
  const last = points[points.length - 1];
  const first = points[0];
  const trendColor = color || (last >= first ? 'var(--pos)' : 'var(--neg)');
  const areaPath = `${d} L${width},${height} L0,${height} Z`;
  const lastX = (points.length - 1) * stepX;
  const lastY = height - ((last - min) / range) * (height - 2) - 1;
  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      {fill && <path d={areaPath} fill={trendColor} opacity={0.12} />}
      <path d={d} stroke={trendColor} strokeWidth="1.25" fill="none" />
      <circle cx={lastX} cy={lastY} r="1.6" fill={trendColor} />
    </svg>
  );
}
