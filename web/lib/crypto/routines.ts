import cryptoStrategy from '@/crypto-strategy.json';
import { AiJsonParseError, claudeJsonArray, MODELS } from '@/lib/ai';
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
import { snapshotFromDailyBars } from '../../../src/indicators/live-snapshot';

const RULES = cryptoStrategy.rules as {
  max_positions: number;
  hard_stop_pct: number;
  position_size_pct: number;
};

function buildSnapshots(
  symbols: string[],
  bars: Record<string, { c: number; v: number }[]>,
) {
  return symbols
    .map((symbol) => snapshotFromDailyBars(symbol, bars[symbol] ?? []))
    .filter(Boolean);
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
    console.error('[crypto-scan] AI JSON mislukt — geen orders geplaatst:', msg);
    return { skipped: true, reason: 'AI JSON response invalid or truncated', asset_class: 'crypto' };
  }

  const orders: { symbol: string; qty: number; orderId: string }[] = [];
  for (const c of candidates) {
    if (c.action !== 'buy' || !symbols.includes(c.symbol) || openSymbols.includes(c.symbol)) continue;
    if (openSymbols.length + orders.length >= RULES.max_positions) break;

    const b = bars[c.symbol] ?? [];
    if (!b.length) continue;
    const lastPrice = b[b.length - 1].c;
    const notional = equity * RULES.position_size_pct;
    const qty = Math.max(0.0001, +(notional / lastPrice).toFixed(4));

    const symbolExposure = cryptoPositions
      .filter((p) => p.symbol === c.symbol)
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
        symbol: c.symbol,
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
        symbol: c.symbol,
        qty,
        side: 'buy',
        type: 'market',
        time_in_force: 'gtc',
      });
      await saveCryptoStop(c.symbol, stopPrice, qty);
      await placeCryptoStopLimit(c.symbol, qty, stopPrice).catch((e) => {
        console.error('[crypto stop-limit]', e);
      });
      orders.push({ symbol: c.symbol, qty, orderId: order.id });
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
    } catch (e) {
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
    }
  }

  await syncRecentOrders().catch(() => {});
  return { routine: 'crypto-scan', orders, asset_class: 'crypto' };
}

registerRoutineHandler('crypto-scan', runCryptoScan);
