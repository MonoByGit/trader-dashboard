export type EodExit = {
  symbol: string;
  how: 'eod' | 'stop' | 'take_profit';
  price?: number;
};

export type SellOrderLike = {
  symbol: string;
  side: string;
  status: string;
  filled_at?: string | null;
  filled_avg_price?: string | null;
};

/**
 * Alle sluitingen van vandaag (ET-handelsdag): stop- en take-profit-fills bij
 * Alpaca plus de posities die EOD zelf platzette. Eerder noemde de
 * EOD-samenvatting alleen de EOD-flatten, zodat een eerder geraakte stop
 * (XLI op 4-11) ontbrak en "Gesloten: XLV" de stop leek te zijn.
 */
export function eodExitsToday<O extends SellOrderLike>(
  orders: O[],
  flattened: { symbol: string; price?: number }[],
  tradingDate: string,
  tradingDateOf: (ms: number) => string,
  classify: (o: O) => 'stop' | 'take_profit' | null,
): EodExit[] {
  const exits: EodExit[] = [];
  for (const o of orders) {
    if (o.side !== 'sell' || o.status !== 'filled' || !o.filled_at) continue;
    if (tradingDateOf(Date.parse(o.filled_at)) !== tradingDate) continue;
    const how = classify(o);
    if (!how) continue;
    const price = o.filled_avg_price != null ? parseFloat(o.filled_avg_price) : NaN;
    exits.push({ symbol: o.symbol, how, price: Number.isFinite(price) ? price : undefined });
  }
  for (const f of flattened) exits.push({ symbol: f.symbol, how: 'eod', price: f.price });
  return exits;
}

const HOW_LABEL: Record<EodExit['how'], string> = {
  eod: 'EOD-sluiting',
  stop: 'stop geraakt',
  take_profit: 'take-profit geraakt',
};

/** "XLI (stop geraakt, $167.47), XLV (EOD-sluiting, $188.10)" of "niets". */
export function eodExitsLabel(exits: EodExit[]): string {
  if (!exits.length) return 'niets';
  return exits
    .map((e) => `${e.symbol} (${HOW_LABEL[e.how]}${e.price != null ? `, $${e.price.toFixed(2)}` : ''})`)
    .join(', ');
}
