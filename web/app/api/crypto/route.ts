import { NextResponse } from 'next/server';
import { loadCryptoGuardConfig } from '@guards/crypto-config';
import { alpaca } from '@/lib/alpaca';
import { buildGuardStatus } from '@/lib/guards/service';
import { isCryptoModuleEnabled, setCryptoModuleEnabled } from '@/lib/crypto/state';
import { sleevesFromAlpacaLive } from '@/lib/sleeves';
import { filterByAssetClass } from '@/lib/asset-class';
import { authRequired, isAuthenticated } from '@/lib/auth';

export async function GET() {
  try {
    const [account, positions, enabled] = await Promise.all([
      alpaca.account(),
      alpaca.positions(),
      isCryptoModuleEnabled(),
    ]);
    const equity = parseFloat(account.equity);
    const cash = parseFloat(account.cash);
    const sleeves = await sleevesFromAlpacaLive(equity, cash, positions);
    const cryptoPositions = filterByAssetClass(positions, 'crypto');
    const guards = await buildGuardStatus(equity, cash, positions.length);
    const cfg = loadCryptoGuardConfig();

    return NextResponse.json({
      enabled,
      assetClass: 'crypto',
      label: 'Crypto sleeve',
      color: 'var(--sleeve-crypto)',
      sleeves: sleeves.crypto,
      combinedEquity: equity,
      positions: cryptoPositions.map((p) => ({
        symbol: p.symbol,
        qty: parseFloat(p.qty),
        marketValue: parseFloat(p.market_value),
        unrealizedPl: parseFloat(p.unrealized_pl),
        unrealizedPlPct: parseFloat(p.unrealized_plpc) * 100,
      })),
      guards: {
        globalEmergencyStop: guards.emergencyStop,
        globalCircuitBreaker: guards.circuitBreakerTripped,
        tradingEnabled: guards.tradingEnabled,
        maxBudgetPct: cfg.maxCryptoBudgetPct,
        maxPositionPct: cfg.maxCryptoPositionPct,
        maxDailyLossPct: cfg.maxCryptoDailyLossPct,
        maxNewPositionsPerDay: cfg.maxNewCryptoPositionsPerDay,
        hardStopPct: cfg.hardStopPct * 100,
        tickIntervalHours: cfg.tickIntervalHours,
      },
      benchmark: 'BTC/USD',
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/** Authenticated toggle — paper only. */
export async function POST(req: Request) {
  if (authRequired() && !(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled boolean required' }, { status: 400 });
  }
  await setCryptoModuleEnabled(body.enabled);
  return NextResponse.json({ enabled: body.enabled });
}
