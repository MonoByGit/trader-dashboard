'use client';

import { fmt } from '@/lib/format';
import type { Position } from '@/lib/mock';

export function MobilePositions({ positions, onOpenPosition }: {
  positions: Position[];
  onOpenPosition: (p: Position) => void;
}) {
  if (positions.length === 0) {
    return <div className="m-empty">Geen open posities.<br />De agent koopt pas bij een volledige setup (6 criteria).</div>;
  }
  return (
    <>
      {positions.map(p => {
        const pos = p.unrealizedPnl >= 0;
        return (
          <button key={p.symbol} className="m-row" style={{ flexDirection: 'column', alignItems: 'stretch' }} onClick={() => onOpenPosition(p)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="m-row-main">
                <div className="m-row-sym">{p.symbol}</div>
                <div className="m-row-sub">{p.name} · {p.qty} st</div>
              </div>
              <div className="m-row-end">
                <span className={`big ${pos ? 'pos' : 'neg'}`}>{fmt.signedUsd(p.unrealizedPnl)}</span>
                <span className={`small ${pos ? 'pos' : 'neg'}`}>{fmt.pct(p.unrealizedPnlPct)}</span>
              </div>
            </div>
            <div className="m-statline">
              <div><div className="k">Entry</div><div className="v">{fmt.usd(p.avgEntryPrice)}</div></div>
              <div><div className="k">Mark</div><div className="v">{fmt.usd(p.currentPrice)}</div></div>
              <div><div className="k">Stop</div><div className="v">{fmt.usd(p.trailingStop)}</div></div>
              <div><div className="k">Target</div><div className="v">{fmt.usd(p.takeProfit)}</div></div>
            </div>
          </button>
        );
      })}
    </>
  );
}
