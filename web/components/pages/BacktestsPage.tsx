'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EquityChart } from '@/components/charts/EquityChart';
import { fmt } from '@/lib/format';

type RunRow = {
  id: string;
  strategy_version: string;
  period_start: string;
  period_end: string;
  status: string;
  metrics: Record<string, number | null> | null;
  error_message: string | null;
  created_at: string;
};

type EquityPoint = {
  point_date: string;
  equity: number;
  spy_equity: number;
};

export function BacktestsPage() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [equity, setEquity] = useState<EquityPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [start, setStart] = useState('2025-01-02');
  const [end, setEnd] = useState('2025-06-30');
  const [toast, setToast] = useState<string | null>(null);
  const [assetClass, setAssetClass] = useState<'etf' | 'crypto'>('etf');

  const loadRuns = useCallback(async () => {
    const res = await fetch('/api/backtests');
    if (res.ok) setRuns(await res.json());
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/backtests/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setEquity(data.equity ?? []);
      setSelectedId(id);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRuns();
    const t = setInterval(() => void loadRuns(), 8000);
    return () => clearInterval(t);
  }, [loadRuns]);

  useEffect(() => {
    if (runs.length && !selectedId) {
      const first = runs.find((r) => r.status === 'completed') ?? runs[0];
      if (first) void loadDetail(first.id);
    }
  }, [runs, selectedId, loadDetail]);

  const selected = runs.find((r) => r.id === selectedId);

  const chartPoints = useMemo(
    () =>
      equity.map((p, i) => ({
        t: i,
        v: Number(p.equity),
        label: p.point_date,
      })),
    [equity],
  );

  const spyPoints = useMemo(
    () =>
      equity.map((p, i) => ({
        t: i,
        v: Number(p.spy_equity),
      })),
    [equity],
  );

  async function startRun() {
    setToast(null);
    const res = await fetch('/api/backtests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ periodStart: start, periodEnd: end, assetClass }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setToast(err.error ?? 'Start mislukt');
      return;
    }
    const run = await res.json();
    setToast(`Backtest ${run.id} gestart`);
    await loadRuns();
    setSelectedId(run.id);
  }

  const m = selected?.metrics;

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>Backtests</h1>
          <p className="muted">
            ETF vs SPY, crypto vs BTC buy-and-hold (Alpaca paper data).
          </p>
        </div>
      </header>

      <section className="card" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label>
          <span className="label">Asset class</span>
          <select value={assetClass} onChange={(e) => setAssetClass(e.target.value as 'etf' | 'crypto')}>
            <option value="etf">ETF (SPY benchmark)</option>
            <option value="crypto">Crypto (BTC benchmark)</option>
          </select>
        </label>
        <label>
          <span className="label">Van</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          <span className="label">Tot</span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <button type="button" className="btn primary" onClick={() => void startRun()}>
          Start backtest
        </button>
        {toast && <span className="muted">{toast}</span>}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 16 }}>
        <section className="card" style={{ maxHeight: 480, overflow: 'auto' }}>
          <h2 className="h3">Runs</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {runs.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className={`link-block ${selectedId === r.id ? 'active' : ''}`}
                  onClick={() => void loadDetail(r.id)}
                  style={{ width: '100%', textAlign: 'left', padding: '8px 0', borderBottom: '1px solid var(--border)' }}
                >
                  <div style={{ fontWeight: 600 }}>{r.period_start} → {r.period_end}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    v{r.strategy_version} · {r.status}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          {loading && <p className="muted">Laden…</p>}
          {selected && (
            <>
              <h2 className="h3">Equity vs SPY</h2>
              {chartPoints.length >= 2 ? (
                <EquityChart points={chartPoints} comparePoints={spyPoints} valueFormat="usd" />
              ) : (
                <p className="muted">
                  {selected.status === 'running' || selected.status === 'queued'
                    ? 'Backtest loopt nog…'
                    : 'Nog geen equity-punten.'}
                </p>
              )}

              {m && (
                <table className="data-table" style={{ marginTop: 16, width: '100%' }}>
                  <thead>
                    <tr>
                      <th />
                      <th>Strategie</th>
                      <th>SPY B&H</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Totaal rendement</td>
                      <td>{fmt.pct(m.totalReturnPct as number)}</td>
                      <td>{fmt.pct(m.spyTotalReturnPct as number)}</td>
                    </tr>
                    <tr>
                      <td>Geannualiseerd</td>
                      <td>{fmt.pct(m.annualizedReturnPct as number)}</td>
                      <td>{fmt.pct(m.spyAnnualizedReturnPct as number)}</td>
                    </tr>
                    <tr>
                      <td>Max drawdown</td>
                      <td>{fmt.pct(m.maxDrawdownPct as number)}</td>
                      <td>{fmt.pct(m.spyMaxDrawdownPct as number)}</td>
                    </tr>
                    <tr>
                      <td>Sharpe</td>
                      <td>{m.sharpeRatio ?? '—'}</td>
                      <td>{m.spySharpeRatio ?? '—'}</td>
                    </tr>
                    <tr>
                      <td>Win rate</td>
                      <td colSpan={2}>{m.winRatePct != null ? fmt.pct(m.winRatePct) : '—'}</td>
                    </tr>
                    <tr>
                      <td>Trades / gem. exposure</td>
                      <td colSpan={2}>
                        {m.tradeCount} trades · {fmt.pct(m.avgExposurePct as number)} exposure
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}

              {selected.error_message && (
                <p className="neg" style={{ marginTop: 12 }}>{selected.error_message}</p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
