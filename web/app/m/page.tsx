'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/ui/Icon';
import { useAccount, usePositions } from '@/hooks/useAlpaca';
import { useGuards, useDecisions } from '@/hooks/useTrader';
import { StatHero } from './_components/StatHero';
import { KillSwitchCard } from './_components/KillSwitchCard';
import { PositionRow } from './_components/PositionRow';
import { DecisionRow } from './_components/DecisionRow';
import { Skeleton, ErrorState, EmptyState } from './_components/states';

export default function GlancePage() {
  const account = useAccount(60000);
  const positions = usePositions(60000);
  const guards = useGuards();
  const decisions = useDecisions(5);

  const refreshAll = () => { account.refresh(); positions.refresh(); guards.refresh(); decisions.refresh(); };

  useEffect(() => {
    const onFocus = () => refreshAll();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main>
      <div className="m-head">
        <span className="m-title"><BrandLogo size={22} /> Momentum-1</span>
        <div className="m-actions">
          <Link className="m-btn" href="/m/report">Rapport</Link>
          <button className="m-btn" onClick={refreshAll} aria-label="Vernieuwen">↻</button>
        </div>
      </div>

      {account.error
        ? <div className="m-card"><ErrorState /></div>
        : account.loading
          ? <div className="m-card"><Skeleton lines={2} /></div>
          : <StatHero equity={account.data?.equity} dayPnl={account.data?.dayPnl} dayPnlPct={account.data?.dayPnlPct} marketOpen={account.data?.marketOpen} />}

      <KillSwitchCard tradingEnabled={guards.tradingEnabled} saving={guards.saving} onToggle={(n) => guards.setTrading(n).catch(() => {})} />

      <div className="m-card">
        <div className="m-card-title">Open posities</div>
        {positions.error
          ? <ErrorState />
          : positions.loading
            ? <Skeleton lines={3} />
            : positions.data.length === 0
              ? <EmptyState msg="Geen open posities" />
              : positions.data.map((p) => (
                  <PositionRow key={p.symbol} symbol={p.symbol} qty={p.qty} avgEntryPrice={p.avgEntryPrice} currentPrice={p.currentPrice} unrealizedPnl={p.unrealizedPnl} unrealizedPnlPct={p.unrealizedPnlPct} />
                ))}
      </div>

      <div className="m-card">
        <div className="m-card-title">Laatste beslissingen</div>
        {decisions.error
          ? <ErrorState />
          : decisions.loading
            ? <Skeleton lines={3} />
            : decisions.data.length === 0
              ? <EmptyState msg="Nog geen beslissingen" />
              : decisions.data.map((d) => <DecisionRow key={d.id} d={d} />)}
      </div>

      <div className="m-foot">
        <a href="/?desktop=1">Open desktopversie</a>
      </div>
    </main>
  );
}
