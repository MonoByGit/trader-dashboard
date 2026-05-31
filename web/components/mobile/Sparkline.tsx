'use client';

// Lichtgewicht responsive SVG-lijn. viewBox + preserveAspectRatio none laat hem
// op elke breedte meeschalen. Kleur volgt de richting (pos/neg) net als desktop.
export function Sparkline({ values, height = 56, positive }: { values: number[]; height?: number; positive?: boolean }) {
  if (!values || values.length < 2) return null;
  const W = 300;
  const H = height;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const stepX = W / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = i * stepX;
    const y = pad + (1 - (v - min) / span) * (H - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  const stroke = positive ? 'var(--pos)' : 'var(--neg)';
  const id = `mspark-${positive ? 'p' : 'n'}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
