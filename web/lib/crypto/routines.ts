import cryptoStrategy from '@/crypto-strategy.json';
import { blocksNewEntries, evaluateCryptoLimits } from '@guards/index';
import { filterByAssetClass } from '@/lib/asset-class';
import { alpaca } from '@/lib/alpaca';
import { saveDecision } from '@/lib/decisions';
import { registerRoutineHandler } from '@/lib/routine-dispatch';
import {
  checkOrderAgainstLimits,
  countDailyTrades,
  getEffectiveCryptoGuardConfig,
  logGuardEvent,
  refreshCircuitBreaker,
} from '@/lib/guards/service';
import { syncRecentOrders } from '@/lib/orders-store';
import { sleevesFromAlpacaLive } from '@/lib/sleeves';
import { countCryptoBuysTodayUtc, isCryptoModuleEnabled, syncCryptoDayStart } from './state';
import { enforceSoftwareCryptoStops, placeCryptoStopLimit, saveCryptoStop } from './stops';
import { getCryptoSymbols } from './strategy-version';

const RULES = cryptoStrategy.rules as {
  max_positions: number;
  hard_stop_pct: number;
  position_size_pct: number;
};

function rsi(closes: number[]): number {
  if (closes.length < 15) return 50;
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < Math.min(15, closes.length); i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains.push(d);
    else losses.push(-d);
  }
  const ag = gains.reduce((a, v) => a + v, 0) / 14;
  const al = losses.reduce((a, v) => a + v, 0) / 14;
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}

async function runCryptoScan(): Promise<Record<string, unknown>> {
  if (!(await isCryptoModuleEnabled())) {
    return { skipped: true, reason: 'Crypto module disabled', asset_class: 'crypto' };
  }

  const [account, positions] = await Promise.all([alpaca.account(), alpaca.positions()]);
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

  const cryptoPositions = filterByAssetClass(positions, 'crypto');
  const symbols = getCryptoSymbols();
  const barsData = await alpaca.cryptoBars(symbols, '1Day', 40);
  const bars = barsData.bars ?? {};

  for (const p of cryptoPositions) {
    const b = bars[p.symbol] ?? [];
    const last = b.length ? b[b.length - 1].c : parseFloat(p.current_price);
    await enforceSoftwareCryptoStops(p.symbol, last);
  }

  const sleeves = await sleevesFromAlpacaLive(equity, cash, positions);
  const cryptoDayStart = await syncCryptoDayStart(sleeves.crypto.equityUsd);
  const cryptoCfg = await getEffectiveCryptoGuardConfig();
  const newToday = await countCryptoBuysTodayUtc();

  const cryptoLimitsBlock = evaluateCryptoLimits(
    {
      totalEquityUsd: equity,
      cryptoExposureUsd: sleeves.crypto.exposureUsd,
      symbolExposureUsd: 0,
      proposedOrderUsd: 0,
      newPositionsOpenedToday: newToday,
      cryptoDayStartEquityUsd: cryptoDayStart,
      cryptoSleeveEquityUsd: sleeves.crypto.equityUsd,
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

  const candidates: string[] = [];
  for (const symbol of symbols) {
    if (openSymbols.includes(symbol)) continue;
    const b = bars[symbol] ?? [];
    if (b.length < 20) continue;
    const closes = b.slice(-20).map((x) => x.c);
    const sma20 = closes.reduce((a, v) => a + v, 0) / closes.length;
    const last = closes[closes.length - 1];
    const r = rsi(closes);
    if (last > sma20 && r >= 45 && r <= 70) candidates.push(symbol);
  }

  const orders: { symbol: string; qty: number; orderId: string }[] = [];
  for (const symbol of candidates) {
    if (openSymbols.length + orders.length >= RULES.max_positions) break;
    const b = bars[symbol] ?? [];
    const lastPrice = b[b.length - 1].c;
    const notional = equity * RULES.position_size_pct;
    const qty = Math.max(0.0001, +(notional / lastPrice).toFixed(4));

    const symbolExposure = cryptoPositions
      .filter((p) => p.symbol === symbol)
      .reduce((s, p) => s + parseFloat(p.market_value), 0);

    const cryptoLimit = evaluateCryptoLimits(
      {
        totalEquityUsd: equity,
        cryptoExposureUsd: sleeves.crypto.exposureUsd,
        symbolExposureUsd: symbolExposure,
        proposedOrderUsd: notional,
        newPositionsOpenedToday: newToday + orders.length,
        cryptoDayStartEquityUsd: cryptoDayStart,
        cryptoSleeveEquityUsd: sleeves.crypto.equityUsd,
      },
      cryptoCfg,
    );
    if (!cryptoLimit.allowed) {
      await saveDecision({
        routine: 'crypto-scan',
        symbol,
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
    const globalLimits = await checkOrderAgainstLimits({
      equity,
      cash,
      openPositionCount: etfOnlyPositions.length + cryptoPositions.length + orders.length,
      dailyTrades: await countDailyTrades(),
      proposedOrderValueUsd: notional,
      currentSymbolExposureUsd: symbolExposure,
      totalExposureUsd: etfExposure + sleeves.crypto.exposureUsd,
    });
    if (!globalLimits.allowed) {
      await saveDecision({
        routine: 'crypto-scan',
        symbol,
        decision: 'NO_GO',
        rationale: globalLimits.failReasons.join('; '),
        agentNote: 'Global portfolio guard',
        confidence: 0,
        asset_class: 'crypto',
      });
      continue;
    }

    const stopPrice = +(lastPrice * (1 - cryptoCfg.hardStopPct)).toFixed(2);
    try {
      const order = await alpaca.placeOrder({
        symbol,
        qty,
        side: 'buy',
        type: 'market',
        time_in_force: 'gtc',
      });
      await saveCryptoStop(symbol, stopPrice, qty);
      await placeCryptoStopLimit(symbol, qty, stopPrice).catch((e) => {
        console.error('[crypto stop-limit]', e);
      });
      orders.push({ symbol, qty, orderId: order.id });
      await saveDecision({
        routine: 'crypto-scan',
        symbol,
        decision: 'BUY',
        rationale: `Rule: above SMA20, RSI band. Stop ${stopPrice}.`,
        agentNote: 'Crypto sleeve; stop-limit GTC + tick backup. See docs/crypto-stops.md',
        confidence: 0.75,
        orderId: order.id,
        asset_class: 'crypto',
      });
    } catch (e) {
      await logGuardEvent('crypto_order_fail', String(e), { symbol });
      await saveDecision({
        routine: 'crypto-scan',
        symbol,
        decision: 'NO_GO',
        rationale: String(e),
        agentNote: 'Order failed',
        confidence: 0,
        asset_class: 'crypto',
      });
    }
  }

  await syncRecentOrders().catch(() => {});
  return { routine: 'crypto-scan', orders, asset_class: 'crypto' };
}

registerRoutineHandler('crypto-scan', runCryptoScan);
