import { NextResponse } from 'next/server';
import { isCryptoModuleEnabled, setCryptoModuleEnabled } from '@/lib/crypto/enabled';
import { loadCryptoGuardConfig, loadCryptoSymbols } from '@crypto/config';
import { getCryptoStrategyVersion } from '@/lib/crypto/strategy-version';
import cryptoStrategy from '@/crypto-strategy.json';

export async function GET() {
  const enabled = await isCryptoModuleEnabled();
  const guard = loadCryptoGuardConfig();
  return NextResponse.json({
    enabled,
    strategyVersion: getCryptoStrategyVersion(),
    strategyName: (cryptoStrategy as { name?: string }).name,
    symbols: loadCryptoSymbols(),
    guard,
    defaultsOff: true,
  });
}

/** Authenticated toggle (middleware when APP_PASSWORD is set). */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled (boolean) is verplicht' }, { status: 400 });
    }
    await setCryptoModuleEnabled(body.enabled);
    return NextResponse.json({ enabled: await isCryptoModuleEnabled() });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
