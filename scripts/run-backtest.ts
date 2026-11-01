#!/usr/bin/env npx tsx
/**
 * Local backtest CLI (paper Alpaca market data).
 * Usage: npm run backtest -- --start=2025-01-02 --end=2025-06-01
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runBacktest } from '../src/backtest/engine.js';
import type { DailyBar, StrategyRulesLike } from '../src/backtest/types.js';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=').slice(1).join('=');
}

async function fetchBars(symbols: string[], start: string, end: string): Promise<Record<string, DailyBar[]>> {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!key || !secret) throw new Error('Zet ALPACA_API_KEY en ALPACA_SECRET_KEY in de omgeving');

  const url = new URL('https://data.alpaca.markets/v2/stocks/bars');
  url.searchParams.set('symbols', symbols.join(','));
  url.searchParams.set('timeframe', '1Day');
  url.searchParams.set('start', start);
  url.searchParams.set('end', end);
  url.searchParams.set('limit', '10000');
  url.searchParams.set('feed', 'iex');

  const res = await fetch(url.toString(), {
    headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
  });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as { bars?: Record<string, DailyBar[]> };
  return data.bars ?? {};
}

async function fetchCalendar(start: string, end: string): Promise<string[]> {
  const base = process.env.ALPACA_BASE_URL ?? 'https://paper-api.alpaca.markets';
  const key = process.env.ALPACA_API_KEY!;
  const secret = process.env.ALPACA_SECRET_KEY!;
  const res = await fetch(`${base}/v2/calendar?start=${start}&end=${end}`, {
    headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
  });
  if (!res.ok) throw new Error(await res.text());
  const days = (await res.json()) as { date: string }[];
  return days.map((d) => d.date).sort();
}

async function main() {
  const start = arg('start') ?? '2025-01-02';
  const end = arg('end') ?? '2025-06-01';
  const strategyPath = resolve(process.cwd(), 'web/strategy.json');
  const strategy = JSON.parse(readFileSync(strategyPath, 'utf8')) as {
    symbols: string[];
    rules: StrategyRulesLike;
    version: string;
  };

  const tradingDates = await fetchCalendar(start, end);
  const symbols = strategy.symbols;
  const barsBySymbol = await fetchBars([...symbols, 'SPY'], start, end);
  const spyBars = barsBySymbol.SPY ?? [];
  delete barsBySymbol.SPY;

  const result = runBacktest({
    tradingDates,
    barsBySymbol,
    spyBars,
    symbols,
    rules: strategy.rules,
    params: {
      initialCapital: Number(arg('capital') ?? 100_000),
      fillMode: 'next_open',
      slippageBps: Number(arg('slippageBps') ?? 5),
      commissionPerShare: 0,
      minCommissionUsd: 0,
    },
  });

  console.log(JSON.stringify({ strategyVersion: strategy.version, metrics: result.metrics, trades: result.trades.length }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
