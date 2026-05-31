import { fmt } from '@/lib/format';
import type { ReportData } from '@/hooks/useTrader';

export function ReportCard({ r }: { r: ReportData }) {
  const start = r.kpis?.equityStart;
  const end = r.kpis?.equityEnd;
  return (
    <div className="m-card">
      <div className="m-row">
        <span className="m-card-title">EOD-rapport</span>
        <span className="text-tertiary" style={{ fontSize: 12 }}>{fmt.date(r.date)}</span>
      </div>
      {start != null && end != null && (
        <div className="m-row" style={{ marginBottom: 12 }}>
          <span className="mono">{fmt.usd(start)} → {fmt.usd(end)}</span>
          <span className={`mono ${end - start >= 0 ? 'text-pos' : 'text-neg'}`}>{fmt.signedUsd(end - start)}</span>
        </div>
      )}
      {r.narrative
        ? <div className="m-narrative">{r.narrative}</div>
        : <div className="text-tertiary" style={{ fontSize: 13 }}>Geen tekst in dit rapport</div>}
    </div>
  );
}
