import { fmt } from '@/lib/format';

interface Props {
  equity: number | null | undefined;
  dayPnl: number | null | undefined;
  dayPnlPct: number | null | undefined; // fractie, bv 0.012 = +1,2%
  marketOpen: boolean | undefined;
}

export function StatHero({ equity, dayPnl, dayPnlPct, marketOpen }: Props) {
  const pos = (dayPnl ?? 0) >= 0;
  const pctVal = dayPnlPct == null ? null : dayPnlPct * 100;
  return (
    <div className="m-card">
      <div className="m-row">
        <span className="m-card-title">Equity</span>
        <span className="m-mkt-pill">
          <span className={`m-mkt-dot ${marketOpen ? 'open' : ''}`} />
          Markt {marketOpen ? 'open' : 'dicht'}
        </span>
      </div>
      <div className="m-hero-equity mono">{fmt.usd(equity, 2)}</div>
      <div className={`m-hero-pnl mono ${pos ? 'text-pos' : 'text-neg'}`}>
        {fmt.signedUsd(dayPnl)} ({fmt.pct(pctVal)}) vandaag
      </div>
    </div>
  );
}
