export const fmt = {
  usd: (v: number | null | undefined, digits = 2): string => {
    if (v == null) return '—';
    return `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  },
  usdCompact: (v: number | null | undefined): string => {
    if (v == null) return '—';
    return Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`;
  },
  num: (v: number | null | undefined, digits = 2): string => {
    if (v == null) return '—';
    return Number(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  },
  pct: (v: number | null | undefined, digits = 2, plus = true): string => {
    if (v == null) return '—';
    return `${plus && v > 0 ? '+' : ''}${Number(v).toFixed(digits)}%`;
  },
  signedUsd: (v: number | null | undefined, digits = 2): string => {
    if (v == null) return '—';
    const sign = v > 0 ? '+' : v < 0 ? '−' : '';
    return `${sign}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  },
  time: (iso: string): string => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' });
    } catch { return '—'; }
  },
  timeLocal: (iso: string): string => {
    try {
      return new Date(iso).toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit' });
    } catch { return '—'; }
  },
  timeS: (iso: string): string => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/New_York' });
    } catch { return '—'; }
  },
  relTime: (iso: string, now?: Date): string => {
    try {
      const d = new Date(iso);
      const n = now || new Date();
      const diff = Math.round((n.getTime() - d.getTime()) / 1000);
      if (diff < 60) return `${diff}s ago`;
      if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
      return `${Math.round(diff / 86400)}d ago`;
    } catch { return '—'; }
  },
  date: (iso: string): string => {
    try {
      return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return '—'; }
  },
};
