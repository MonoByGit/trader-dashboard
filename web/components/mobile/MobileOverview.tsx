'use client';

import { fmt } from '@/lib/format';
import type { Position } from '@/lib/mock';
import { Sparkline } from './Sparkline';
import { Icon } from '@/components/ui/Icon';

export function MobileOverview({
  cash, buyingPower, deployedPct, openCount, dayPnl, dayPnlPct,
  intraday, positions, agentNote, marketOpen, onOpenPosition, onGoPositions,
}: {
  cash: number; buyingPower: number; deployedPct: number; openCount: number;
  dayPnl: number; dayPnlPct: number; intraday: number[]; positions: Position[];
  agentNote: string; marketOpen: boolean | null;
  onOpenPosition: (p: Position) => void; onGoPositions: () => void;
}) {
  const dayPos = dayPnl >= 0;
  return (
    <>
      <div className="m-kpi-grid">
        <div className="m-kpi"><div className="k">Cash</div><div className="v">{fmt.usd(cash, 0)}</div></div>
        <div className="m-kpi"><div className="k">Koopkracht</div><div className="v">{fmt.usd(buyingPower, 0)}</div></div>
        <div className="m-kpi"><div className="k">Ingezet</div><div className="v">{deployedPct.toFixed(1)}%</div></div>
        <div className="m-kpi"><div className="k">Posities</div><div className="v">{openCount} / 3</div></div>
      </div>

      <div className="m-card">
        <div className="m-card-title">
          <span>Equity · vandaag</span>
          <span className={dayPos ? 'pos' : 'neg'} style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {fmt.signedUsd(dayPnl)} · {fmt.pct(dayPnlPct)}
          </span>
        </div>
        <Sparkline values={intraday} positive={dayPos} height={64} />
      </div>

      <div className="m-section-title">
        <span>Open posities</span>
        <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>{positions.length} / 3</span>
      </div>
      {positions.length === 0 ? (
        <div className="m-empty">Geen open posities.<br />De agent wacht op een geldige setup.</div>
      ) : (
        positions.map(p => {
          const pos = p.unrealizedPnl >= 0;
          return (
            <button key={p.symbol} className="m-row" onClick={() => onOpenPosition(p)}>
              <div className="m-row-main">
                <div className="m-row-sym">{p.symbol}</div>
                <div className="m-row-sub">{p.name}</div>
              </div>
              <div className="m-row-end">
                <span className={`big ${pos ? 'pos' : 'neg'}`}>{fmt.signedUsd(p.unrealizedPnl)}</span>
                <span className={`small ${pos ? 'pos' : 'neg'}`}>{fmt.pct(p.unrealizedPnlPct)}</span>
              </div>
              <Icon name="chevR" size={14} />
            </button>
          );
        })
      )}
      {positions.length > 0 && (
        <button className="m-btn ghost" onClick={onGoPositions} style={{ height: 40, fontSize: 13 }}>
          Alle posities bekijken
        </button>
      )}

      <div className="m-card">
        <div className="m-card-title">
          <span>Agent</span>
          <span className="m-badge hold" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Icon name="bolt" size={9} /> {marketOpen === false ? 'WACHT' : 'ACTIEF'}
          </span>
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-secondary)' }}>{agentNote}</div>
      </div>
    </>
  );
}
