import type { CryptoGuardConfig } from './crypto-config';

export interface CryptoLimitsInput {
  totalEquityUsd: number;
  cryptoExposureUsd: number;
  symbolExposureUsd: number;
  proposedOrderUsd: number;
  newPositionsOpenedToday: number;
  cryptoDayStartEquityUsd: number;
  cryptoSleeveEquityUsd: number;
}

export interface CryptoLimitsResult {
  allowed: boolean;
  failReasons: string[];
}

export function evaluateCryptoLimits(
  input: CryptoLimitsInput,
  config: CryptoGuardConfig,
): CryptoLimitsResult {
  const failReasons: string[] = [];
  const equity = input.totalEquityUsd > 0 ? input.totalEquityUsd : 1;

  const afterExposure = input.cryptoExposureUsd + input.proposedOrderUsd;
  const budgetCap = equity * (config.maxCryptoBudgetPct / 100);
  if (afterExposure > budgetCap + 0.01) {
    failReasons.push(
      `Crypto budget ${((afterExposure / equity) * 100).toFixed(1)}% exceeds max ${config.maxCryptoBudgetPct}%`,
    );
  }

  const symbolAfter = input.symbolExposureUsd + input.proposedOrderUsd;
  const posCap = equity * (config.maxCryptoPositionPct / 100);
  if (symbolAfter > posCap + 0.01) {
    failReasons.push(
      `Crypto position ${((symbolAfter / equity) * 100).toFixed(1)}% exceeds max ${config.maxCryptoPositionPct}%`,
    );
  }

  if (input.proposedOrderUsd > 0 && input.newPositionsOpenedToday >= config.maxNewCryptoPositionsPerDay) {
    const isNewSymbol = input.symbolExposureUsd <= 0;
    if (isNewSymbol) {
      failReasons.push(
        `Soft-start: max ${config.maxNewCryptoPositionsPerDay} new crypto positions per day reached`,
      );
    }
  }

  if (input.cryptoDayStartEquityUsd > 0 && input.cryptoSleeveEquityUsd > 0) {
    const lossPct =
      ((input.cryptoDayStartEquityUsd - input.cryptoSleeveEquityUsd) / input.totalEquityUsd) * 100;
    if (lossPct > config.maxCryptoDailyLossPct) {
      failReasons.push(
        `Crypto daily loss ${lossPct.toFixed(2)}% of account exceeds limit ${config.maxCryptoDailyLossPct}%`,
      );
    }
  }

  return { allowed: failReasons.length === 0, failReasons };
}
