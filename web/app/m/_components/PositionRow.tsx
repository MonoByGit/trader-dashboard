import { fmt } from '@/lib/format';

interface Props {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number; // al in procenten (route * 100)
}

export function PositionRow({ symbol, qty, avgEntryPrice, currentPrice, unrealizedPnl, unrealizedPnlPct }: Props) {
  const pos = unrealizedPnl >= 0;
  const stop = avgEntryPrice * 0.98;
  const target = avgEntryPrice * 1.05;
  return (
    <div className="m-pos">
      <div>
        <div className="m-pos-sym">{symbol} <span className="text-tertiary" style={{ fontWeight: 400 }}>{qty}x</span></div>
        <div className="m-pos-meta mono">
          @ {fmt.usd(currentPrice)} · stop {fmt.usd(stop)} · target {fmt.usd(target)}
        </div>
      </div>
      <div className="m-pos-val">
        <div className={`mono ${pos ? 'text-pos' : 'text-neg'}`}>{fmt.signedUsd(unrealizedPnl)}</div>
        <div className={`m-pos-meta mono ${pos ? 'text-pos' : 'text-neg'}`}>{fmt.pct(unrealizedPnlPct)}</div>
      </div>
    </div>
  );
}
