'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pill } from '@/components/ui/Pill';
import { Toggle } from '@/components/ui/Toggle';
import { fmt } from '@/lib/format';

type CryptoApi = {
  enabled: boolean;
  sleeves: {
    equityUsd: number;
    exposureUsd: number;
    allocatedCashUsd: number;
    unrealizedPlUsd: number;
  };
  combinedEquity: number;
  positions: Array<{
    symbol: string;
    qty: number;
    marketValue: number;
    unrealizedPl: number;
    unrealizedPlPct: number;
  }>;
  guards: {
    globalEmergencyStop: boolean;
    globalCircuitBreaker: boolean;
    tradingEnabled: boolean;
    maxBudgetPct: number;
    maxPositionPct: number;
    maxDailyLossPct: number;
    maxNewPositionsPerDay: number;
    hardStopPct: number;
    tickIntervalHours: number;
  };
  benchmark: string;
};

type Snap = {
  trading_date: string;
  sleeves?: {
    crypto?: { cumulativeReturnPct: number | null; benchmarkCumulativeReturnPct: number | null };
    combined?: { cumulativeReturnPct: number | null };
  } | null;
};

export function CryptoPage() {
  const [data, setData] = useState<CryptoApi | null>(null);
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([
        fetch('/api/crypto').then((r) => r.json()),
        fetch('/api/snapshots?limit=90').then((r) => r.json()),
      ]);
      setData(c);
      setSnaps(Array.isArray(s) ? s : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const toggle = async () => {
    if (!data) return;
    await fetch('/api/crypto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !data.enabled }),
    });
    await load();
  };

  const lastSnap = snaps[snaps.length - 1];
  const cryptoCum = lastSnap?.sleeves?.crypto?.cumulativeReturnPct;
  const btcCum = lastSnap?.sleeves?.crypto?.benchmarkCumulativeReturnPct;

  if (loading && !data) {
    return <div className="page-pad muted">Crypto sleeve laden…</div>;
  }
  if (!data || 'error' in (data as Record<string, unknown>)) {
    return <div className="page-pad neg">Crypto data niet beschikbaar.</div>;
  }

  const budgetUsed =
    data.combinedEquity > 0 ? (data.sleeves.exposureUsd / data.combinedEquity) * 100 : 0;

  return (
    <div className="page-pad crypto-page">
      <header className="sleeve-header crypto">
        <div>
          <h1 className="sleeve-title">
            <span className="sleeve-badge crypto">Crypto</span> paper sleeve
          </h1>
          <p className="muted text-sm">24/7 · eigen budget · benchmark {data.benchmark}</p>
        </div>
        <div className="sleeve-toggle">
          <span className="text-sm">Module</span>
          <Toggle on={data.enabled} onChange={() => toggle()} aria-label="Crypto module" />
          <Pill kind={data.enabled ? 'pos' : 'muted'}>{data.enabled ? 'AAN' : 'UIT'}</Pill>
        </div>
      </header>

      <div className="grid-2 sleeve-cards">
        <div className="card sleeve-card crypto">
          <div className="card-label">Sleeve equity</div>
          <div className="card-value">{fmt.usd(data.sleeves.equityUsd)}</div>
          <div className="text-sm muted">
            Exposure {fmt.usd(data.sleeves.exposureUsd)} · cash toegewezen{' '}
            {fmt.usd(data.sleeves.allocatedCashUsd)}
          </div>
        </div>
        <div className="card sleeve-card">
          <div className="card-label">vs {data.benchmark} (cumulatief)</div>
          <div className="card-value">
            {cryptoCum != null ? `${cryptoCum >= 0 ? '+' : ''}${cryptoCum.toFixed(2)}%` : '—'}
            <span className="text-sm muted"> · BTC {btcCum != null ? `${btcCum.toFixed(2)}%` : '—'}</span>
          </div>
          <div className="text-sm muted">Onrealized {fmt.usd(data.sleeves.unrealizedPlUsd)}</div>
        </div>
      </div>

      <section className="card">
        <h2 className="section-title">Guards (crypto + global)</h2>
        <div className="prop-grid">
          <div className="prop-row">
            <span className="k">Budget gebruikt</span>
            <span className="v">
              {budgetUsed.toFixed(1)}% / {data.guards.maxBudgetPct}%
            </span>
          </div>
          <div className="prop-row">
            <span className="k">Max positie</span>
            <span className="v">{data.guards.maxPositionPct}% equity</span>
          </div>
          <div className="prop-row">
            <span className="k">Dagverlies limiet</span>
            <span className="v">{data.guards.maxDailyLossPct}% account</span>
          </div>
          <div className="prop-row">
            <span className="k">Soft-start</span>
            <span className="v">{data.guards.maxNewPositionsPerDay} nieuwe posities/dag</span>
          </div>
          <div className="prop-row">
            <span className="k">Hard stop</span>
            <span className="v">{data.guards.hardStopPct}% · stop-limit + tick backup</span>
          </div>
          <div className="prop-row">
            <span className="k">Global noodstop</span>
            <span className="v">
              {data.guards.globalEmergencyStop ? (
                <Pill kind="neg">ACTIEF</Pill>
              ) : (
                <Pill kind="muted">Uit</Pill>
              )}
            </span>
          </div>
          <div className="prop-row">
            <span className="k">Global breaker / kill</span>
            <span className="v">
              {data.guards.globalCircuitBreaker ? 'Breaker' : data.guards.tradingEnabled ? 'OK' : 'Kill switch'}
            </span>
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">Posities</h2>
        {data.positions.length === 0 ? (
          <p className="muted">Geen crypto posities.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Qty</th>
                <th>Value</th>
                <th>P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {data.positions.map((p) => (
                <tr key={p.symbol}>
                  <td className="mono">{p.symbol}</td>
                  <td>{p.qty}</td>
                  <td>{fmt.usd(p.marketValue)}</td>
                  <td className={p.unrealizedPl >= 0 ? 'text-pos' : 'text-neg'}>
                    {fmt.usd(p.unrealizedPl)} ({p.unrealizedPlPct.toFixed(2)}%)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-xs muted">
        Stops: geen Alpaca-brackets voor crypto — zie docs/crypto-stops.md. Alleen paper.
      </p>
    </div>
  );
}
