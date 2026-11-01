import { NextResponse } from 'next/server';
import { alpaca, inferAssetClass } from '@/lib/alpaca';
import { loadGuardState, refreshCircuitBreaker } from '@/lib/guards/service';
import { loadCryptoGuardConfig } from '@crypto/config';
import { countCryptoEntriesTodayUtc, syncCryptoDayStart } from '@/lib/crypto/guards-state';
import { isCryptoModuleEnabled } from '@/lib/crypto/enabled';
import { loadGuardConfig } from '@guards/index';

export async function GET() {
  try {
    const enabled = await isCryptoModuleEnabled();
    const cryptoCfg = loadCryptoGuardConfig();
    const globalCfg = loadGuardConfig();
    const state = await loadGuardState();

    let equity = 0;
    let cryptoExposure = 0;
    let cryptoPositions = 0;
    let cryptoDayStart = 0;

    try {
      const [account, positions] = await Promise.all([alpaca.account(), alpaca.positions()]);
      equity = parseFloat(account.equity);
      await refreshCircuitBreaker(equity);
      const cryptoPos = positions.filter((p) => inferAssetClass(p.symbol, p.asset_class) === 'crypto');
      cryptoPositions = cryptoPos.length;
      cryptoExposure = cryptoPos.reduce((s, p) => s + parseFloat(p.market_value), 0);
      cryptoDayStart = await syncCryptoDayStart(cryptoExposure);
    } catch {
      /* paper account optional in dev */
    }

    const budgetCap = (equity * cryptoCfg.maxBudgetPct) / 100;
    const cryptoDailyDd =
      cryptoDayStart > 0 ? ((cryptoDayStart - cryptoExposure) / cryptoDayStart) * 100 : 0;

    return NextResponse.json({
      moduleEnabled: enabled,
      softStart: {
        enabled: cryptoCfg.softStartEnabled,
        maxNewPerDay: cryptoCfg.softStartMaxNewPositionsPerDay,
        newEntriesTodayUtc: await countCryptoEntriesTodayUtc(),
      },
      limits: {
        maxBudgetPct: cryptoCfg.maxBudgetPct,
        budgetCapUsd: budgetCap,
        cryptoExposureUsd: cryptoExposure,
        maxPositionPct: cryptoCfg.maxPositionPct,
        maxPositions: cryptoCfg.maxPositions,
        openCryptoPositions: cryptoPositions,
        cryptoDailyDrawdownPct: +cryptoDailyDd.toFixed(2),
        cryptoDailyDrawdownLimitPct: cryptoCfg.maxDailyDrawdownPct,
        tickIntervalHours: cryptoCfg.tickIntervalHours,
      },
      global: {
        emergencyStop: state.emergencyStop,
        tradingEnabled: state.tradingEnabled,
        circuitBreakerTripped: state.circuitBreakerTripped,
        maxDailyDrawdownPct: globalCfg.maxDailyDrawdownPct,
        maxPeakDrawdownPct: globalCfg.maxPeakDrawdownPct,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
