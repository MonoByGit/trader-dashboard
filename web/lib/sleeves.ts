import { computeSleeveAccounting, type SleeveAccountingResult } from '../../src/sleeves/accounting';
import type { AlpacaPosition } from './alpaca';
import { loadCryptoGuardConfig } from '@guards/crypto-config';
import { isCryptoModuleEnabled } from './crypto/state';

export type { SleeveAccountingResult };

export function sleevesFromAlpaca(
  totalEquityUsd: number,
  totalCashUsd: number,
  positions: AlpacaPosition[],
): SleeveAccountingResult {
  return computeSleeveAccounting({
    totalEquityUsd,
    totalCashUsd,
    positions,
    cryptoBudgetPct: loadCryptoGuardConfig().maxCryptoBudgetPct,
    cryptoModuleEnabled: true,
  });
}

export async function sleevesFromAlpacaLive(
  totalEquityUsd: number,
  totalCashUsd: number,
  positions: AlpacaPosition[],
): Promise<SleeveAccountingResult> {
  const enabled = await isCryptoModuleEnabled();
  return computeSleeveAccounting({
    totalEquityUsd,
    totalCashUsd,
    positions,
    cryptoBudgetPct: loadCryptoGuardConfig().maxCryptoBudgetPct,
    cryptoModuleEnabled: enabled,
  });
}
