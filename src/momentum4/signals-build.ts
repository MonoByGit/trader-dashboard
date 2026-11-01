import { basketSignalsByFiledDate, filterNewPositionsOnly, type BasketWeightMode } from './basket';
import { mergeFundSignals, signalsByFiledDate, type HoldingsSnapshot } from './holdings';
import type { M4Variant } from './config';
import { alignSignalsToTradingDays } from './trading-days';

export function buildM4Signals(input: {
  chains: HoldingsSnapshot[][];
  variant: M4Variant;
  maxNames: number;
  basketWeight: BasketWeightMode;
  tradingDates?: string[];
}): Record<string, import('./holdings').CopySignal[]> {
  const { chains, variant, maxNames, basketWeight, tradingDates } = input;
  let raw: Record<string, import('./holdings').CopySignal[]>;
  if (variant === 'basket') {
    raw = basketSignalsByFiledDate(chains, maxNames, basketWeight);
  } else if (chains.length === 1 && variant === 'diff') {
    raw = signalsByFiledDate(chains[0]!);
  } else {
    const merged = mergeFundSignals(chains);
    raw = variant === 'new-only' ? filterNewPositionsOnly(merged) : merged;
  }
  return tradingDates?.length ? alignSignalsToTradingDays(raw, tradingDates) : raw;
}
