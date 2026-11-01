'use client';

import { useCallback, useEffect, useState } from 'react';
import { Toggle } from '@/components/ui/Toggle';
import { Pill } from '@/components/ui/Pill';
import { fmt } from '@/lib/format';
import { usePositions } from '@/hooks/useAlpaca';

type CryptoGuards = {
  moduleEnabled: boolean;
  softStart: { enabled: boolean; maxNewPerDay: number; newEntriesTodayUtc: number };
  limits: {
    maxBudgetPct: number;
    budgetCapUsd: number;
    cryptoExposureUsd: number;
    maxPositionPct: number;
    maxPositions: number;
    openCryptoPositions: number;
    cryptoDailyDrawdownPct: number;
    cryptoDailyDrawdownLimitPct: number;
    tickIntervalHours: number;
  };
  global: {
    emergencyStop: boolean;
    tradingEnabled: boolean;
    circuitBreakerTripped: boolean;
  };
};

type ModuleInfo = {
  enabled: boolean;
  strategyVersion: string;
  strategyName?: string;
  symbols: string[];
};

export function CryptoPage() {
  const [moduleInfo, setModuleInfo] = useState<ModuleInfo | null>(null);
  const [guards, setGuards] = useState<CryptoGuards | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const positions = usePositions(15000);

  const load = useCallback(async () => {
    const [m, g] = await Promise.all([
      fetch('/api/crypto/module').then((r) => r.json()),
      fetch('/api/crypto/guards').then((r) => r.json()),
    ]);
    setModuleInfo(m);
    setGuards(g);
  }, []);

  useEffect(() => {
    load().catch((e) => setErr(String(e)));
  }, [load]);

  const cryptoPositions =
    positions.data?.filter((p) => p.symbol.includes('/')) ?? [];

  async function toggleEnabled(next: boolean) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/crypto/module', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  const btcBenchmarkNote =
    'Benchmark: BTC buy-and-hold (zelfde als in daily_snapshots en crypto-backtest).';

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text)]">Crypto (paper)</h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
            Aparte module, 24/7 ticks. Standaard uit tot je hem hier aanzet (login vereist als auth aan
            staat). {btcBenchmarkNote}
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <span className="text-sm text-[var(--muted)]">Module</span>
          <Toggle
            on={!!moduleInfo?.enabled}
            onChange={toggleEnabled}
            aria-label={moduleInfo?.enabled ? 'Crypto module aan' : 'Crypto module uit'}
          />
          {busy && <span className="text-xs text-[var(--muted)]">…</span>}
        </div>
      </header>

      {err && (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {err}
        </p>
      )}

      {moduleInfo && (
        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="text-sm font-medium text-[var(--text)]">Strategie</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {moduleInfo.strategyName ?? 'Momentum Crypto'} · v{moduleInfo.strategyVersion}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {moduleInfo.symbols.map((s) => (
                <Pill key={s}>{s}</Pill>
              ))}
            </div>
          </div>

          {guards && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              <h2 className="text-sm font-medium text-[var(--text)]">Guards</h2>
              <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
                <li>
                  Budget: {fmt.usd(guards.limits.cryptoExposureUsd)} /{' '}
                  {fmt.usd(guards.limits.budgetCapUsd)} ({guards.limits.maxBudgetPct}% equity)
                </li>
                <li>
                  Posities: {guards.limits.openCryptoPositions} / {guards.limits.maxPositions} (max{' '}
                  {guards.limits.maxPositionPct}% per positie)
                </li>
                <li>
                  Crypto dagverlies: {guards.limits.cryptoDailyDrawdownPct.toFixed(2)}% (limiet{' '}
                  {guards.limits.cryptoDailyDrawdownLimitPct}%)
                </li>
                <li>
                  Soft-start:{' '}
                  {guards.softStart.enabled
                    ? `${guards.softStart.newEntriesTodayUtc}/${guards.softStart.maxNewPerDay} nieuwe vandaag (UTC)`
                    : 'uit'}
                </li>
                <li>Tick elke {guards.limits.tickIntervalHours}u (24/7)</li>
                <li>
                  Global:{' '}
                  {guards.global.emergencyStop
                    ? 'noodstop'
                    : guards.global.circuitBreakerTripped
                      ? 'circuit breaker'
                      : guards.global.tradingEnabled
                        ? 'OK'
                        : 'kill switch'}
                </li>
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-sm font-medium text-[var(--text)]">Crypto posities</h2>
        {cryptoPositions.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted)]">Geen open crypto posities.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--border)]">
            {cryptoPositions.map((p) => (
              <li key={p.symbol} className="flex justify-between py-2 text-sm">
                <span>{p.symbol}</span>
                <span className="text-[var(--muted)]">
                  {p.qty} · {fmt.usd(p.marketValue)} · P&L {fmt.signedUsd(p.unrealizedPnl)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-[var(--muted)]">
        Stops: software per tick + optionele stop-limit (geen Alpaca bracket). Zie docs/crypto-stops.md in
        de repo.
      </p>
    </div>
  );
}
