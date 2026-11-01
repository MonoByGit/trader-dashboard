import cryptoStrategy from '@/crypto-strategy.json';
import { AiJsonParseError, claudeJsonArray, logFailedAiCall, MODELS } from '@/lib/ai';
import { gateBuyIfLockLost, hasBuyDecisionTodayEt } from '@/lib/buy-idempotency';
import { getRoutineRunContext } from '@/lib/routine-run-context';
import { cryptoDailyPnlFromLive, yesterdayUtcCloseBySymbol } from './daily-pnl-live';
import { blocksNewEntries, evaluateCryptoLimits } from '@guards/index';
import { filterByAssetClass } from '@/lib/asset-class';
import { alpaca } from '@/lib/alpaca';
import { saveDecision } from '@/lib/decisions';
import { registerRoutineHandler } from '@/lib/routine-dispatch';
import {
  checkOrderAgainstLimits,
  countDailyCryptoTrades,
  getEffectiveCryptoGuardConfig,
  getEffectiveGuardConfig,
  logGuardEvent,
  refreshCircuitBreaker,
} from '@/lib/guards/service';
import { syncRecentOrders } from '@/lib/orders-store';
import { sleevesFromAlpacaLive } from '@/lib/sleeves';
import { countCryptoBuysTodayUtc, isCryptoModuleEnabled, syncCryptoDayStart } from './state';
import { passesCryptoEntryCriteria } from '../../../src/crypto/entry-criteria';
import { dailyBarsExcludingTodayPartial } from '../../../src/alpaca/daily-bars-partial';
import {
  enforceSoftwareCryptoStops,
  enforceSoftwareCryptoTakeProfit,
  protectCryptoPositionAfterBuy,
  saveCryptoStop,
  saveCryptoTakeProfit,
} from './stops';
import { getCryptoSymbols } from './strategy-version';
import { cryptoSymbolExposureUsd, hasCryptoPosition } from '../../../src/crypto/symbol-match';
import { buildAlpacaClientOrderId } from '../../../src/alpaca/client-order-id';
import { isOrderPostRetryableError } from '../../../src/alpaca/order-post-reconcile';
import { alpacaSymbolsEqual } from '../../../src/alpaca/symbol-path';
import { snapshotFromDailyBars } from '../../../src/indicators/live-snapshot';
import { nextDailyTradeCount } from '../../../src/guards/daily-trades';

const RULES = cryptoStrategy.rules as {
  max_positions: number;
  hard_stop_pct: number;
  take_profit_pct: number;
  position_size_pct: number;
  rsi_min: number;
  rsi_max: number;
  volume_ratio_min: number;
};

function utcDateYmd(nowMs = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function buildSnapshots(
  symbols: string[],
  bars: Record<string, { c: number; v: number; t?: string }[]>,
) {
  const todayUtc = utcDateYmd();
  return symbols
    .map((symbol) => {
      const completed = dailyBarsExcludingTodayPartial(bars[symbol] ?? [], todayUtc, {
        calendar: 'utc',
      });
      return snapshotFromDailyBars(symbol, completed);
    })
    .filter(Boolean);
}

export async function runCryptoSoftwareStopsForPositions(
  cryptoPositions: { symbol: string; current_price: string }[],
  bars: Record<string, { c: number; v: number }[]>,
  watchlistSymbols: string[],
): Promise<void> {
  for (const p of cryptoPositions) {
    try {
      const barKey = watchlistSymbols.find((w) => alpacaSymbolsEqual(w, p.symbol)) ?? p.symbol;
      const b = bars[barKey] ?? [];
      const last = b.length ? b[b.length - 1].c : parseFloat(p.current_price);
      await enforceSoftwareCryptoStops(p.symbol, last);
      await enforceSoftwareCryptoTakeProfit(p.symbol, last);
    } catch (e) {
      await logGuardEvent('crypto_enforce_fail', String(e), { symbol: p.symbol });
    }
  }
}

async function runCryptoScan(): Promise<Record<string, unknown>> {
  const [account, positions] = await Promise.all([alpaca.account(), alpaca.positions()]);
  const symbols = getCryptoSymbols();
  const barsData = await alpaca.cryptoBars(symbols, '1Day', 40);
  const bars = barsData.bars ?? {};
  const cryptoPositions = filterByAssetClass(positions, 'crypto');

  await runCryptoSoftwareStopsForPositions(cryptoPositions, bars, symbols);

  if (!(await isCryptoModuleEnabled())) {
    return { skipped: true, reason: 'Crypto module disabled', asset_class: 'crypto' };
  }

  const equity = parseFloat(account.equity);
  const cash = parseFloat(account.cash);
  const guardState = await refreshCircuitBreaker(equity);

  if (
    blocksNewEntries({
      routine: 'crypto-scan',
      emergencyStop: guardState.emergencyStop,
      tradingEnabled: guardState.tradingEnabled,
      circuitBreakerTripped: guardState.circuitBreakerTripped,
    })
  ) {
    const reason = guardState.emergencyStop
      ? 'Emergency stop active'
      : guardState.circuitBreakerTripped
        ? 'Global circuit breaker'
        : 'Kill switch activated';
    return { skipped: true, reason, asset_class: 'crypto' };
  }

  const sleeves = await sleevesFromAlpacaLive(equity, cash, positions);
  const cryptoDayStart = await syncCryptoDayStart(sleeves.crypto.equityUsd);
  const cryptoCfg = await getEffectiveCryptoGuardConfig();
  const newToday = await countCryptoBuysTodayUtc();

  const recentOrders = await alpaca.orders(100);
  const yesterdayClose = yesterdayUtcCloseBySymbol(bars);
  const cryptoDailyPnlUsd = cryptoDailyPnlFromLive(cryptoPositions, recentOrders, {
    yesterdayCloseBySymbol: yesterdayClose,
  });
  const cryptoLimitsBlock = evaluateCryptoLimits(
    {
      totalEquityUsd: equity,
      cryptoExposureUsd: sleeves.crypto.exposureUsd,
      symbolExposureUsd: 0,
      proposedOrderUsd: 0,
      newPositionsOpenedToday: newToday,
      cryptoDayStartEquityUsd: cryptoDayStart,
      cryptoSleeveEquityUsd: sleeves.crypto.equityUsd,
      cryptoDailyPnlUsd,
    },
    cryptoCfg,
  );
  if (!cryptoLimitsBlock.allowed && cryptoPositions.length === 0) {
    return { skipped: true, reason: cryptoLimitsBlock.failReasons.join('; '), asset_class: 'crypto' };
  }

  const openSymbols = cryptoPositions.map((p) => p.symbol);
  if (openSymbols.length >= RULES.max_positions) {
    return { routine: 'crypto-scan', note: 'Max crypto positions', asset_class: 'crypto' };
  }

  const snapshots = buildSnapshots(symbols, bars);
  let candidates: { symbol: string; action: 'buy' | 'skip'; reason: string }[];
  try {
    candidates = await claudeJsonArray<{ symbol: string; action: 'buy' | 'skip'; reason: string }>(
      MODELS.sonnet,
      `Je bent Momentum Crypto (paper sleeve). Strategie: ${cryptoStrategy.name}. Equity totaal: $${equity.toFixed(0)}. Crypto open: ${openSymbols.join(',') || 'geen'}. Max ${RULES.max_positions} crypto posities. Alleen symbolen uit de watchlist. Geen BUY voor al open.`,
      `Marktdata:\n${JSON.stringify(snapshots)}\nGeef JSON-object: {"candidates":[{"symbol":"BTC/USD","action":"buy"|"skip","reason":"kort"}]}`,
    );
  } catch (e) {
    const msg = e instanceof AiJsonParseError ? e.message : String(e);
    console.error('[crypto-scan] AI call failed — marking run failed for retry:', msg);
    await logFailedAiCall(e, 'crypto-scan', MODELS.sonnet);
    throw new Error(`[crypto-scan] ${msg}`);
  }

  let dailyCryptoTrades = await countDailyCryptoTrades();
  const orders: { symbol: string; qty: number; orderId: string }[] = [];
  const scanRunId = String(Date.now());
  for (const c of candidates) {
    if (
      c.action !== 'buy' ||
      !symbols.includes(c.symbol) ||
      hasCryptoPosition(cryptoPositions, c.symbol)
    ) {
      if (c.action === 'skip' && c.reason?.trim()) {
        console.info(`[crypto-scan] AI skip ${c.symbol}: ${c.reason.trim()}`);
      }
      continue;
    }
    if (openSymbols.length + orders.length >= RULES.max_positions) break;

    const snap = snapshots.find((s) => s && alpacaSymbolsEqual(s.symbol, c.symbol));
    if (!snap) continue;
    const criteria = passesCryptoEntryCriteria(
      { rsi: snap.rsi, volumeRatio: snap.volumeRatio },
      {
        rsi_min: RULES.rsi_min,
        rsi_max: RULES.rsi_max,
        volume_ratio_min: RULES.volume_ratio_min,
      },
    );
    if (!criteria.ok) {
      await saveDecision({
        routine: 'crypto-scan',
        symbol: c.symbol,
        decision: 'NO_GO',
        rationale: criteria.reason,
        agentNote: 'Crypto entry criteria (strategy.json)',
        confidence: 0,
        asset_class: 'crypto',
      });
      continue;
    }

    const b = bars[c.symbol] ?? [];
    if (!b.length) continue;
    const lastPrice = b[b.length - 1].c;
    const notional = equity * RULES.position_size_pct;
    const qty = Math.max(0.0001, +(notional / lastPrice).toFixed(4));

    const symbolExposure = cryptoSymbolExposureUsd(cryptoPositions, c.symbol);

    const cryptoLimit = evaluateCryptoLimits(
      {
        totalEquityUsd: equity,
        cryptoExposureUsd: sleeves.crypto.exposureUsd,
        symbolExposureUsd: symbolExposure,
        proposedOrderUsd: notional,
        newPositionsOpenedToday: newToday + orders.length,
        cryptoDayStartEquityUsd: cryptoDayStart,
        cryptoSleeveEquityUsd: sleeves.crypto.equityUsd,
        cryptoDailyPnlUsd,
      },
      cryptoCfg,
    );
    if (!cryptoLimit.allowed) {
      await saveDecision({
        routine: 'crypto-scan',
        symbol: c.symbol,
        decision: 'NO_GO',
        rationale: cryptoLimit.failReasons.join('; '),
        agentNote: 'Crypto sleeve guard',
        confidence: 0,
        asset_class: 'crypto',
      });
      continue;
    }

    const etfOnlyPositions = filterByAssetClass(positions, 'etf');
    const etfExposure = etfOnlyPositions.reduce((s, p) => s + parseFloat(p.market_value), 0);
    const globalCfg = await getEffectiveGuardConfig();
    const cryptoTradeSlot = nextDailyTradeCount(dailyCryptoTrades, globalCfg.maxDailyCryptoTrades);
    if (!cryptoTradeSlot.allowed) {
      await saveDecision({
        routine: 'crypto-scan',
        symbol: c.symbol,
        decision: 'NO_GO',
        rationale: `Max daily crypto trades (${globalCfg.maxDailyCryptoTrades}) reached`,
        agentNote: 'Crypto daily trade budget',
        confidence: 0,
        asset_class: 'crypto',
      });
      break;
    }

    const globalLimits = await checkOrderAgainstLimits({
      equity,
      cash,
      openPositionCount: etfOnlyPositions.length + cryptoPositions.length + orders.length,
      dailyTrades: 0,
      proposedOrderValueUsd: notional,
      currentSymbolExposureUsd: symbolExposure,
      totalExposureUsd: etfExposure + sleeves.crypto.exposureUsd,
    });
    if (!globalLimits.allowed) {
      await saveDecision({
        routine: 'crypto-scan',
        symbol: c.symbol,
        decision: 'NO_GO',
        rationale: globalLimits.failReasons.join('; '),
        agentNote: 'Global portfolio guard',
        confidence: 0,
        asset_class: 'crypto',
      });
      continue;
    }

    const freshPositions = await alpaca.positions();
    const freshCrypto = filterByAssetClass(freshPositions, 'crypto');
    if (hasCryptoPosition(freshCrypto, c.symbol)) continue;
    if (await hasBuyDecisionTodayEt(c.symbol, 'crypto-scan')) continue;

    const runCtx = getRoutineRunContext();
    const lockGate = await gateBuyIfLockLost(runCtx?.runId, c.symbol);
    if (!lockGate.allowed) {
      await saveDecision({
        routine: 'crypto-scan',
        symbol: c.symbol,
        decision: 'NO_GO',
        rationale: lockGate.reason,
        agentNote: 'Run lock lost before order.',
        confidence: 0,
        asset_class: 'crypto',
      });
      break;
    }

    const stopPrice = +(lastPrice * (1 - cryptoCfg.hardStopPct)).toFixed(2);
    const takeProfitPrice = +(lastPrice * (1 + RULES.take_profit_pct)).toFixed(2);
    let order;
    const clientOrderId = buildAlpacaClientOrderId({
      routine: 'crypto-scan',
      runId: scanRunId,
      symbol: c.symbol,
      side: 'buy',
    });
    try {
      order = await alpaca.placeOrder({
        symbol: c.symbol,
        qty,
        side: 'buy',
        type: 'market',
        time_in_force: 'gtc',
        client_order_id: clientOrderId,
      });
    } catch (e) {
      if (isOrderPostRetryableError(e)) {
        await saveCryptoStop(c.symbol, stopPrice, qty);
        await logGuardEvent('crypto_order_ambiguous', String(e), {
          symbol: c.symbol,
          clientOrderId,
        });
      }
      await logGuardEvent('crypto_order_fail', String(e), { symbol: c.symbol });
      await saveDecision({
        routine: 'crypto-scan',
        symbol: c.symbol,
        decision: 'NO_GO',
        rationale: String(e),
        agentNote: 'Order failed',
        confidence: 0,
        asset_class: 'crypto',
      });
      continue;
    }

    let reportQty = qty;
    try {
      const protection = await protectCryptoPositionAfterBuy(c.symbol, order.id, stopPrice);
      reportQty = protection.qty;
      await saveCryptoTakeProfit(c.symbol, takeProfitPrice, protection.qty);
    } catch (e) {
      try {
        await saveCryptoStop(c.symbol, stopPrice, qty);
      } catch (stopErr) {
        await logGuardEvent('crypto_buy_unprotected', `stop save failed: ${String(stopErr)}`, {
          symbol: c.symbol,
          orderId: order.id,
        });
      }
      try {
        await logGuardEvent('crypto_buy_unprotected', String(e), {
          symbol: c.symbol,
          orderId: order.id,
        });
      } catch {
        /* guard log must not block BUY recording */
      }
    }
    orders.push({ symbol: c.symbol, qty: reportQty, orderId: order.id });
    dailyCryptoTrades = cryptoTradeSlot.next;
    await saveDecision({
      routine: 'crypto-scan',
      symbol: c.symbol,
      decision: 'BUY',
      rationale: c.reason || `Stop ${stopPrice}.`,
      agentNote: 'Crypto sleeve; stop-limit GTC + tick backup. See docs/crypto-stops.md',
      confidence: 0.75,
      orderId: order.id,
      asset_class: 'crypto',
    });
  }

  await syncRecentOrders().catch(() => {});
  return { routine: 'crypto-scan', orders, asset_class: 'crypto' };
}

registerRoutineHandler('crypto-scan', runCryptoScan);
