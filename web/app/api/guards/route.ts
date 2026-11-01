import { NextResponse } from 'next/server';
import { alpaca } from '@/lib/alpaca';
import { sendMessage, killSwitchMessage } from '@/lib/telegram';
import { openOrAppendThread } from '@/lib/threads';
import { buildGuardStatus, setTradingEnabled, loadGuardState } from '@/lib/guards/service';
import { applySoftStartToGuardConfig, loadGuardConfig, SOFT_START_DEFAULTS } from '@guards/index';
import { isSoftStartEnabled } from '@/lib/strategy-versions';

export async function GET() {
  try {
    const config = loadGuardConfig();
    let equity = 0;
    let cash = 0;
    let openPositions = 0;

    try {
      const [account, positions] = await Promise.all([alpaca.account(), alpaca.positions()]);
      equity = parseFloat(account.equity);
      cash = parseFloat(account.cash);
      openPositions = positions.length;
    } catch {
      const state = await loadGuardState();
      const softStartEnabled = await isSoftStartEnabled();
      const effective = applySoftStartToGuardConfig(config, softStartEnabled);
      return NextResponse.json({
        tradingEnabled: state.tradingEnabled,
        circuitBreakerTripped: state.circuitBreakerTripped,
        circuitBreakerReason: state.circuitBreakerReason,
        emergencyStop: state.emergencyStop,
        emergencyStopAt: state.emergencyStopAt,
        dailyDrawdownPct: 0,
        peakDrawdownPct: 0,
        dailyDrawdownLimit: -config.maxDailyDrawdownPct,
        peakDrawdownLimit: -config.maxPeakDrawdownPct,
        consecLosses: state.consecutiveLosses,
        consecLossesLimit: config.maxConsecutiveLosses,
        tradesLast10Min: 0,
        tradesLast10MinLimit: config.maxOrdersPer10Min,
        openPositions: 0,
        maxOpenPositions: effective.maxPositions,
        dailyTrades: 0,
        maxDailyTrades: effective.maxDailyTrades,
        cashReservePct: 100,
        cashReserveMin: config.minCashReservePct,
        maxOrderSize: config.maxOrderSizeUsd,
        minOrderSize: config.minOrderSizeUsd,
        maxTotalExposurePct: effective.maxTotalExposurePct,
        maxPositionSizePct: effective.maxPositionSizePct,
        softStartEnabled,
        softStartLimits: SOFT_START_DEFAULTS,
        effectiveMaxOpenPositions: effective.maxPositions,
        effectiveMaxDailyTrades: effective.maxDailyTrades,
        effectiveMaxPositionSizePct: effective.maxPositionSizePct,
        effectiveMaxTotalExposurePct: effective.maxTotalExposurePct,
      });
    }

    const status = await buildGuardStatus(equity, cash, openPositions);
    const cfg = status.config;
    const softStartEnabled = status.softStartEnabled;

    return NextResponse.json({
      tradingEnabled: status.tradingEnabled,
      circuitBreakerTripped: status.circuitBreakerTripped,
      circuitBreakerReason: status.circuitBreakerReason,
      circuitBreakerTrippedAt: status.circuitBreakerTrippedAt,
      emergencyStop: status.emergencyStop,
      emergencyStopAt: status.emergencyStopAt,
      dailyDrawdownPct: -status.dailyDrawdownPct,
      peakDrawdownPct: -status.peakDrawdownPct,
      dailyDrawdownLimit: -cfg.maxDailyDrawdownPct,
      peakDrawdownLimit: -cfg.maxPeakDrawdownPct,
      consecLosses: status.consecutiveLosses,
      consecLossesLimit: cfg.maxConsecutiveLosses,
      tradesLast10Min: status.ordersLast10Min,
      tradesLast10MinLimit: cfg.maxOrdersPer10Min,
      openPositions: status.openPositions,
      maxOpenPositions: cfg.maxPositions,
      dailyTrades: status.dailyTrades,
      maxDailyTrades: cfg.maxDailyTrades,
      cashReservePct: status.cashReservePct,
      cashReserveMin: cfg.minCashReservePct,
      maxOrderSize: cfg.maxOrderSizeUsd,
      minOrderSize: cfg.minOrderSizeUsd,
      maxTotalExposurePct: cfg.maxTotalExposurePct,
      maxPositionSizePct: cfg.maxPositionSizePct,
      softStartEnabled,
      softStartLimits: SOFT_START_DEFAULTS,
      effectiveMaxOpenPositions: cfg.maxPositions,
      effectiveMaxDailyTrades: cfg.maxDailyTrades,
      effectiveMaxPositionSizePct: cfg.maxPositionSizePct,
      effectiveMaxTotalExposurePct: cfg.maxTotalExposurePct,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { tradingEnabled, who } = await req.json();
  const enabled = !!tradingEnabled;

  const state = await loadGuardState();
  if (state.emergencyStop && enabled) {
    return NextResponse.json(
      { error: 'Emergency stop active — resume noodstop before re-enabling trading' },
      { status: 409 }
    );
  }

  const previous = state.tradingEnabled;
  await setTradingEnabled(enabled);

  if (previous !== enabled) {
    await sendMessage(killSwitchMessage(enabled, typeof who === 'string' && who ? who : 'Dusty'));
    const day = new Date().toISOString().slice(0, 10);
    await openOrAppendThread({
      title: enabled ? 'Trading weer ingeschakeld' : 'Trading gestopt (kill switch)',
      type: 'gesprek',
      priority: enabled ? 'normaal' : 'hoog',
      anchorType: 'guard',
      anchorId: `killswitch-${day}`,
      summary: enabled ? 'Kill switch uit · trading actief' : 'Kill switch aan · geen nieuwe orders',
      tags: ['#killswitch', '#guard'],
      body: enabled
        ? 'De kill switch staat uit. Ik mag weer nieuwe orders inleggen volgens de strategie. Zijn er aandachtspunten voordat ik verderga?'
        : 'De kill switch is omgezet: ik leg geen nieuwe orders meer in. Bestaande posities en stops blijven actief. Laat je me weten wanneer ik weer mag handelen?',
    }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
