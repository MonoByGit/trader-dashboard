import cryptoStrategy from '@/crypto-strategy.json';
import { evaluateEntryRules } from '@backtest/entry-rules';
import { snapshotAtIndex } from '@backtest/indicators';
import type { DailyBar, StrategyRulesLike } from '@backtest/types';
import { loadCryptoGuardConfig } from '@crypto/config';
import { evaluateCryptoOrderLimits } from '@crypto/guards';
import { blocksNewEntries, loadGuardConfig } from '@guards/index';
import { alpaca, inferAssetClass, type AlpacaPosition } from '@/lib/alpaca';
import { claudeJson, MODELS } from '@/lib/ai';
import { saveDecision } from '@/lib/decisions';
import { logGuardEvent, refreshCircuitBreaker } from '@/lib/guards/service';
import { registerRoutineHandler } from '@/lib/routine-dispatch';
import { syncRecentOrders } from '@/lib/orders-store';
import { countCryptoEntriesTodayUtc, syncCryptoDayStart } from '@/lib/crypto/guards-state';
import { isCryptoModuleEnabled } from '@/lib/crypto/enabled';
import { clearProtectiveStop, getProtectiveStop, setProtectiveStop } from '@/lib/crypto/stops';

const WATCHLIST = (cryptoStrategy.symbols as string[]) ?? ['BTC/USD'];
const RULES = cryptoStrategy.rules as StrategyRulesLike;

function cryptoPositions(positions: AlpacaPosition[]): AlpacaPosition[] {
  return positions.filter((p) => inferAssetClass(p.symbol, p.asset_class) === 'crypto');
}

function cryptoExposure(positions: AlpacaPosition[]): number {
  return cryptoPositions(positions).reduce((s, p) => s + parseFloat(p.market_value), 0);
}

async function enforceSoftwareStops(positions: AlpacaPosition[]): Promise<string[]> {
  const closed: string[] = [];
  const quotesResp = await alpaca.cryptoLatestQuotes(WATCHLIST).catch(() => ({ quotes: {} as Record<string, { ap: number; bp: number }> }));
  const quoteMap = quotesResp.quotes ?? {};
  for (const p of cryptoPositions(positions)) {
    const stop = await getProtectiveStop(p.symbol);
    if (!stop) continue;
    const q = quoteMap[p.symbol.replace('/', '')] ?? quoteMap[p.symbol];
    const mid =
      q && q.ap && q.bp ? (q.ap + q.bp) / 2 : parseFloat(p.current_price);
    if (!Number.isFinite(mid) || mid <= 0) continue;

    let reason: string | null = null;
    if (mid <= stop.stopPrice) reason = `Software stop @ ${stop.stopPrice.toFixed(2)}`;
    else if (stop.takeProfitPrice != null && mid >= stop.takeProfitPrice) {
      reason = `Take profit @ ${stop.takeProfitPrice.toFixed(2)}`;
    }
    if (!reason) continue;

    try {
      await alpaca.closePosition(p.symbol);
      await clearProtectiveStop(p.symbol);
      closed.push(p.symbol);
      await saveDecision({
        routine: 'crypto-tick',
        assetClass: 'crypto',
        symbol: p.symbol,
        decision: 'SELL',
        rationale: reason,
        agentNote: 'Protective exit (geen Alpaca bracket voor crypto).',
        confidence: 1,
      });
    } catch (e) {
      console.error('[crypto stop]', p.symbol, e);
    }
  }
  return closed;
}

async function runCryptoTick(): Promise<Record<string, unknown>> {
  const enabled = await isCryptoModuleEnabled();
  if (!enabled) {
    return { skipped: true, reason: 'Crypto module disabled (zet aan in dashboard)' };
  }

  const guardCfg = loadCryptoGuardConfig();
  const [account, positions] = await Promise.all([alpaca.account(), alpaca.positions()]);
  const equity = parseFloat(account.equity);
  const guardState = await refreshCircuitBreaker(equity);

  const globalBlock = blocksNewEntries({
    routine: 'crypto-tick',
    emergencyStop: guardState.emergencyStop,
    tradingEnabled: guardState.tradingEnabled,
    circuitBreakerTripped: guardState.circuitBreakerTripped,
  });

  const closedFromStops = await enforceSoftwareStops(positions);
  const freshPositions = closedFromStops.length ? await alpaca.positions() : positions;
  const cryptoPos = cryptoPositions(freshPositions);
  const cryptoBook = cryptoExposure(freshPositions);
  const cryptoDayStart = await syncCryptoDayStart(cryptoBook || 0);

  const barsResp = await alpaca.cryptoBars(WATCHLIST, '1Day', 45);
  const barsMap = barsResp.bars ?? {};

  const snapshots = WATCHLIST.map((symbol) => {
    const key = symbol.replace('/', '');
    const bars = (barsMap[symbol] ?? barsMap[key] ?? []) as DailyBar[];
    if (bars.length < 5) return null;
    const snap = snapshotAtIndex(bars, bars.length - 1);
    if (!snap) return null;
    return { ...snap, symbol };
  }).filter(Boolean);

  for (const s of snapshots) {
    if (!s) continue;
    const entry = evaluateEntryRules(s, RULES, {});
    await saveDecision({
      routine: 'crypto-tick',
      assetClass: 'crypto',
      symbol: s.symbol,
      decision: entry.pass ? 'HOLD_CANDIDATE' : 'NO_GO',
      criteria: entry.criteria,
      rationale: entry.pass ? 'Regels groen; tick beoordeelt entry.' : 'Regels niet groen.',
      agentNote: `RSI ${s.rsi}, vol ${s.volumeRatio}`,
      confidence: entry.pass ? 0.6 : 0.2,
    });
  }

  if (globalBlock) {
    const reason = guardState.emergencyStop
      ? 'Emergency stop active'
      : guardState.circuitBreakerTripped
        ? `Circuit breaker: ${guardState.circuitBreakerReason ?? 'tripped'}`
        : 'Kill switch activated';
    return { skipped: true, reason, closedFromStops, cryptoBook };
  }

  const openSymbols = cryptoPos.map((p) => p.symbol);
  if (openSymbols.length >= guardCfg.maxPositions) {
    return { skipped: true, reason: 'Max crypto positions', closedFromStops, cryptoBook };
  }

  const candidates = snapshots.filter(
    (s) => s && evaluateEntryRules(s, RULES, {}).pass && !openSymbols.includes(s.symbol),
  );

  if (!candidates.length) {
    return { routine: 'crypto-tick', closedFromStops, entries: 0, cryptoBook };
  }

  const picks = await claudeJson<{ symbol: string; action: 'buy' | 'skip'; reason: string }[]>(
    MODELS.sonnet,
    `Je bent Momentum Crypto (paper). Kies max 1 symbool om te kopen deze tick. Equity $${equity.toFixed(0)}. Crypto exposure $${cryptoBook.toFixed(0)}. Open: ${openSymbols.join(', ') || 'geen'}.`,
    `Kandidaten:\n${JSON.stringify(candidates)}\nJSON: [{"symbol":"BTC/USD","action":"buy"|"skip","reason":"..."}]`,
    512,
  );

  const newToday = await countCryptoEntriesTodayUtc();
  const orders: { symbol: string; notional: number; orderId: string }[] = [];

  for (const c of picks) {
    if (c.action !== 'buy' || openSymbols.includes(c.symbol)) continue;
    if (openSymbols.length + orders.length >= guardCfg.maxPositions) break;

    const snap = candidates.find((x) => x?.symbol === c.symbol);
    if (!snap) continue;

    const sizePct = (cryptoStrategy.rules as { position_size_pct: number }).position_size_pct;
    const notional = Math.max(100, equity * sizePct);
    const symbolExposure = cryptoPos
      .filter((p) => p.symbol === c.symbol)
      .reduce((s, p) => s + parseFloat(p.market_value), 0);

    const limits = evaluateCryptoOrderLimits({
      equity,
      cryptoExposureUsd: cryptoBook + orders.reduce((s, o) => s + o.notional, 0),
      proposedOrderValueUsd: notional,
      symbolExposureUsd: symbolExposure,
      openCryptoPositions: openSymbols.length + orders.length,
      newEntriesToday: newToday + orders.length,
      cryptoDayStartEquity: cryptoDayStart,
      cryptoBookValueUsd: cryptoBook,
      config: guardCfg,
      globalBlocksEntries: false,
    });

    if (!limits.allowed) {
      await saveDecision({
        routine: 'crypto-tick',
        assetClass: 'crypto',
        symbol: c.symbol,
        decision: 'NO_GO',
        rationale: limits.failReasons.join('; '),
        agentNote: 'Crypto guard rejected.',
        confidence: 0,
      });
      await logGuardEvent('crypto_limits', limits.failReasons.join('; '), { symbol: c.symbol });
      continue;
    }

    try {
      const order = await alpaca.placeOrder({
        symbol: c.symbol,
        notional: Math.round(notional * 100) / 100,
        side: 'buy',
        type: 'market',
        time_in_force: 'gtc',
      });
      const fill = parseFloat(order.filled_avg_price ?? String(snap.lastClose));
      const stopPx = fill * (1 - RULES.hard_stop_pct);
      const tpPx = fill * (1 + RULES.take_profit_pct);
      await setProtectiveStop({
        symbol: c.symbol,
        entryPrice: fill,
        stopPrice: stopPx,
        takeProfitPrice: tpPx,
      });

      try {
        await alpaca.placeOrder({
          symbol: c.symbol,
          qty: parseFloat(order.filled_qty || order.qty || '0') || undefined,
          side: 'sell',
          type: 'stop_limit',
          time_in_force: 'gtc',
          stop_price: +stopPx.toFixed(2),
          limit_price: +(stopPx * 0.995).toFixed(2),
        });
      } catch {
        /* stop_limit optional; software stop remains primary — see docs/crypto-stops.md */
      }

      orders.push({ symbol: c.symbol, notional, orderId: order.id });
      await saveDecision({
        routine: 'crypto-tick',
        assetClass: 'crypto',
        symbol: c.symbol,
        decision: 'BUY',
        rationale: c.reason,
        agentNote: `Notional ~$${notional.toFixed(0)}; stop ${stopPx.toFixed(2)}`,
        confidence: 0.7,
        orderId: order.id,
      });
    } catch (e) {
      await saveDecision({
        routine: 'crypto-tick',
        assetClass: 'crypto',
        symbol: c.symbol,
        decision: 'NO_GO',
        rationale: String(e),
        agentNote: 'Order placement failed',
        confidence: 0,
      });
    }
  }

  await syncRecentOrders().catch((e) => console.error('[crypto sync orders]', e));

  const globalCfg = loadGuardConfig();
  const dayStart = guardState.dayStartEquity > 0 ? guardState.dayStartEquity : equity;
  const peak = guardState.sessionPeakEquity > 0 ? guardState.sessionPeakEquity : equity;
  const dailyDd = dayStart > 0 ? ((dayStart - equity) / dayStart) * 100 : 0;
  const peakDd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
  if (dailyDd >= globalCfg.maxDailyDrawdownPct || peakDd >= globalCfg.maxPeakDrawdownPct) {
    await logGuardEvent('crypto_global_drawdown', 'Global drawdown limits hit; crypto entries blocked next tick', {
      dailyDd,
      peakDd,
    });
  }

  return {
    routine: 'crypto-tick',
    closedFromStops,
    entries: orders.length,
    orders,
    cryptoBook,
  };
}

registerRoutineHandler('crypto-tick', runCryptoTick);
