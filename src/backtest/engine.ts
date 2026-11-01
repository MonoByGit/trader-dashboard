import { loadGuardConfig } from '../guards/config';
import { evaluateCircuitBreakers } from '../guards/circuit-breakers';
import { evaluatePortfolioLimits } from '../guards/portfolio-limits';
import { blocksNewEntries } from '../guards/routine-gates';
import { evaluateEntryRules } from './entry-rules';
import { firstBracketHit, hourlyBarsForTradingDate } from './intraday-brackets';
import { barOnOrBefore } from './bar-align';
import { rollBacktestSessionGuards } from './session-guards';
import { barIndexByDate, barTradingDate, snapshotAtIndex } from './indicators';
import { vixyStressRatio } from '../volatility/vixy-stress';
import { computeMetrics } from './metrics';
import { qtyFromNotional, qtyModeForAssetClass } from './order-qty';
import { computePositionSize } from './sizing';
import type {
  BacktestEngineInput,
  BacktestEngineResult,
  BacktestTrade,
  DailyBar,
} from './types';

interface OpenPosition {
  symbol: string;
  qty: number;
  entryPrice: number;
  stop: number;
  takeProfit: number;
}

interface PendingEntry {
  symbol: string;
  signalDate: string;
}

function applySlippage(price: number, side: 'buy' | 'sell', slippageBps: number): number {
  const mult = slippageBps / 10_000;
  return side === 'buy' ? price * (1 + mult) : price * (1 - mult);
}

function commission(qty: number, params: BacktestEngineInput['params']): number {
  const c = qty * params.commissionPerShare;
  return Math.max(c, params.minCommissionUsd);
}

function getBar(bars: DailyBar[], date: string): DailyBar | undefined {
  return bars.find((b) => barTradingDate(b) === date);
}

function vixStressAtDate(vixBars: DailyBar[], date: string): number | null {
  const idx = barIndexByDate(vixBars, date);
  if (idx < 0) return null;
  const closes = vixBars.slice(0, idx + 1).map((b) => b.c);
  return vixyStressRatio(closes);
}

export function runBacktest(input: BacktestEngineInput): BacktestEngineResult {
  const {
    tradingDates,
    barsBySymbol,
    spyBars,
    vixBars,
    symbols,
    rules,
    params,
    guardEnv,
  } = input;

  const assetClass = input.assetClass ?? 'etf';
  const benchmarkSymbol = input.benchmarkSymbol ?? (assetClass === 'crypto' ? 'BTC' : 'SPY');
  const qtyMode = qtyModeForAssetClass(assetClass);
  const guardConfig = loadGuardConfig({ ...process.env, ...guardEnv } as NodeJS.ProcessEnv);

  let cash = params.initialCapital;
  const positions = new Map<string, OpenPosition>();
  const trades: BacktestTrade[] = [];
  const guardEvents: string[] = [];

  let dayStartEquity = params.initialCapital;
  let sessionPeakEquity = params.initialCapital;
  let circuitBreakerTripped = false;
  let consecutiveLosses = 0;
  let dailyTrades = 0;
  let tradingEnabled = true;

  let spyShares = 0;
  let spyCash = params.initialCapital;
  const firstSpy = barOnOrBefore(spyBars, tradingDates[0]!) ?? spyBars[0];
  const firstSpyOpen = firstSpy?.o ?? firstSpy?.c;
  if (firstSpyOpen != null && firstSpyOpen > 0) {
    spyShares = qtyFromNotional(spyCash, firstSpyOpen, qtyMode);
    spyCash -= spyShares * firstSpyOpen;
  }

  let pending: PendingEntry[] = [];
  const equityCurve: BacktestEngineResult['equityCurve'] = [];

  const markEquity = (date: string, spyBar?: DailyBar): number => {
    let exposure = 0;
    for (const pos of Array.from(positions.values())) {
      const b = getBar(barsBySymbol[pos.symbol] ?? [], date);
      const px = b?.c ?? pos.entryPrice;
      exposure += pos.qty * px;
    }
    return cash + exposure;
  };

  const closePosition = (
    pos: OpenPosition,
    date: string,
    price: number,
    reason: string,
  ): void => {
    const fill = applySlippage(price, 'sell', params.slippageBps);
    const proceeds = pos.qty * fill - commission(pos.qty, params);
    const costBasis = pos.qty * pos.entryPrice;
    const pnl = proceeds - costBasis;
    cash += proceeds;
    trades.push({
      symbol: pos.symbol,
      side: 'sell',
      qty: pos.qty,
      price: fill,
      date,
      reason,
      pnl: +pnl.toFixed(2),
    });
    if (pnl < 0) consecutiveLosses += 1;
    else consecutiveLosses = 0;
    positions.delete(pos.symbol);
    dailyTrades += 1;
  };

  for (let di = 0; di < tradingDates.length; di++) {
    const date = tradingDates[di]!;
    const prevDate = di > 0 ? tradingDates[di - 1]! : null;
    if (di === 0 || prevDate !== date) {
      dailyTrades = 0;
    }
    const sessionRoll = rollBacktestSessionGuards(prevDate, date, { dayStartEquity });
    if (sessionRoll) {
      consecutiveLosses = sessionRoll.consecutiveLosses ?? consecutiveLosses;
      circuitBreakerTripped = sessionRoll.circuitBreakerTripped ?? circuitBreakerTripped;
      sessionPeakEquity = sessionRoll.sessionPeakEquity ?? sessionPeakEquity;
    }

    // 1) Fill pending entries at today's open (signals from prior closes only)
    const toFill = pending.filter((pe) => pe.signalDate < date);
    pending = pending.filter((pe) => pe.signalDate >= date);
    for (const pe of toFill) {
      const bar = getBar(barsBySymbol[pe.symbol] ?? [], date);
      if (!bar) continue;

      if (
        blocksNewEntries({
          routine: 'market-open',
          emergencyStop: false,
          tradingEnabled,
          circuitBreakerTripped,
        })
      ) {
        continue;
      }

      if (positions.size >= guardConfig.maxPositions) continue;
      if (positions.has(pe.symbol)) continue;

      const fillPx =
        input.params.fillMode === 'next_open'
          ? applySlippage(bar.o, 'buy', params.slippageBps)
          : applySlippage(bar.c, 'buy', params.slippageBps);

      const bars = barsBySymbol[pe.symbol] ?? [];
      const idx = barIndexByDate(bars, date);
      const closes = idx >= 0 ? bars.slice(0, idx + 1).map((b) => b.c) : [];
      const equity = markEquity(date);
      const sizing = computePositionSize({
        closes,
        price: fillPx,
        equity,
        availableCash: cash,
        qtyMode,
      });
      if (sizing.shares <= 0) continue;

      const orderValue = sizing.shares * fillPx;
      const limits = evaluatePortfolioLimits(
        {
          equity,
          cash,
          openPositionCount: positions.size,
          dailyTrades,
          proposedOrderValueUsd: orderValue,
          currentSymbolExposureUsd: 0,
          totalExposureUsd: Array.from(positions.values()).reduce(
            (s, p) => s + p.qty * p.entryPrice,
            0,
          ),
        },
        guardConfig,
      );
      if (!limits.allowed) {
        guardEvents.push(`${date} ${pe.symbol}: ${limits.failReasons.join('; ')}`);
        continue;
      }

      const cost = orderValue + commission(sizing.shares, params);
      if (cost > cash) continue;

      cash -= cost;
      const stop = fillPx * (1 - rules.hard_stop_pct);
      const takeProfit = fillPx * (1 + rules.take_profit_pct);
      positions.set(pe.symbol, {
        symbol: pe.symbol,
        qty: sizing.shares,
        entryPrice: fillPx,
        stop,
        takeProfit,
      });
      trades.push({
        symbol: pe.symbol,
        side: 'buy',
        qty: sizing.shares,
        price: fillPx,
        date,
        reason: `entry after signal ${pe.signalDate}`,
      });
      dailyTrades += 1;
    }

    // 2) Brackets: hourly walk when available, else daily high/low
    const useHourly = input.params.barMode === 'hourly' && input.hourlyBarsBySymbol;
    for (const pos of Array.from(positions.values())) {
      const bar = getBar(barsBySymbol[pos.symbol] ?? [], date);
      if (!bar) continue;
      if (useHourly) {
        const intraday = hourlyBarsForTradingDate(
          input.hourlyBarsBySymbol![pos.symbol] ?? [],
          date,
        );
        const hit = intraday.length
          ? firstBracketHit(pos.stop, pos.takeProfit, intraday)
          : null;
        if (hit?.hit === 'stop') {
          closePosition(pos, date, hit.price, 'hard_stop');
          continue;
        }
        if (hit?.hit === 'take_profit') {
          closePosition(pos, date, hit.price, 'take_profit');
          continue;
        }
      } else {
        if (bar.l <= pos.stop) {
          closePosition(pos, date, pos.stop, 'hard_stop');
          continue;
        }
        if (bar.h >= pos.takeProfit) {
          closePosition(pos, date, pos.takeProfit, 'take_profit');
        }
      }
    }

    // 3) EOD flatten if no overnight
    if (!rules.hold_overnight) {
      for (const pos of Array.from(positions.values())) {
        const bar = getBar(barsBySymbol[pos.symbol] ?? [], date);
        if (bar) closePosition(pos, date, bar.c, 'eod_flat');
      }
    }

    const spyBar = getBar(spyBars, date);
    const equity = markEquity(date, spyBar);
    if (spyBar) {
      const spyMark = spyCash + spyShares * spyBar.c;
      equityCurve.push({
        date,
        equity,
        cash,
        exposure: equity - cash,
        spyEquity: spyMark,
      });
    }

    // Guards at close
    const cb = evaluateCircuitBreakers(
      {
        equity,
        dayStartEquity,
        sessionPeakEquity: Math.max(sessionPeakEquity, equity),
        consecutiveLosses,
        ordersLast10Min: 0,
      },
      guardConfig,
    );
    sessionPeakEquity = Math.max(sessionPeakEquity, equity);
    if (cb.tripped && !circuitBreakerTripped) {
      circuitBreakerTripped = true;
      guardEvents.push(`${date}: circuit breaker — ${cb.reason ?? cb.trigger}`);
    }

    // 4) Signals at close for next session (no look-ahead: snapshot uses bars through today)
    if (
      !blocksNewEntries({
        routine: 'market-open',
        emergencyStop: false,
        tradingEnabled,
        circuitBreakerTripped,
      })
    ) {
      const candidates: { symbol: string; score: number }[] = [];
      const vixStressRatio =
        vixBars?.length ? vixStressAtDate(vixBars, date) : null;

      for (const symbol of symbols) {
        if (positions.has(symbol)) continue;
        const bars = barsBySymbol[symbol] ?? [];
        const idx = barIndexByDate(bars, date);
        if (idx < 0) continue;
        const snap = snapshotAtIndex(bars, idx);
        if (!snap) continue;
        snap.symbol = symbol;
        const entry = evaluateEntryRules(snap, rules, { vixStressRatio });
        if (entry.pass) candidates.push({ symbol, score: entry.score });
      }

      candidates.sort((a, b) => b.score - a.score);
      const slots = Math.max(0, guardConfig.maxPositions - positions.size);
      for (const c of candidates.slice(0, slots)) {
        pending.push({ symbol: c.symbol, signalDate: date });
      }
    }

    dayStartEquity = equity;
  }

  const { strategy, spy } = computeMetrics(equityCurve, trades, benchmarkSymbol);

  return {
    trades,
    equityCurve,
    metrics: { ...strategy, ...spy },
    guardEvents,
  };
}
