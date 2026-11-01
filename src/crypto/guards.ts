import type { CryptoGuardConfig } from './config';

export interface CryptoLimitsInput {
  equity: number;
  cryptoExposureUsd: number;
  proposedOrderValueUsd: number;
  symbolExposureUsd: number;
  openCryptoPositions: number;
  newEntriesToday: number;
  cryptoDayStartEquity: number;
  /** Current mark-to-market of crypto book (for daily loss on crypto slice). */
  cryptoBookValueUsd: number;
  config: CryptoGuardConfig;
  globalBlocksEntries: boolean;
}

export interface CryptoLimitsResult {
  allowed: boolean;
  failReasons: string[];
}

export function evaluateCryptoOrderLimits(input: CryptoLimitsInput): CryptoLimitsResult {
  const failReasons: string[] = [];
  const { config, equity } = input;

  if (input.globalBlocksEntries) {
    failReasons.push('Global guard blocks new entries (emergency, kill switch, or circuit breaker)');
  }

  if (equity <= 0) {
    failReasons.push('Invalid equity');
  }

  const budgetCap = (equity * config.maxBudgetPct) / 100;
  const afterExposure = input.cryptoExposureUsd + input.proposedOrderValueUsd;
  if (afterExposure > budgetCap + 1e-6) {
    failReasons.push(
      `Crypto budget cap ${config.maxBudgetPct}% ($${budgetCap.toFixed(0)}); would be $${afterExposure.toFixed(0)}`,
    );
  }

  const maxPos = (equity * config.maxPositionPct) / 100;
  const afterSymbol = input.symbolExposureUsd + input.proposedOrderValueUsd;
  if (afterSymbol > maxPos + 1e-6) {
    failReasons.push(
      `Max ${config.maxPositionPct}% per crypto position ($${maxPos.toFixed(0)}); symbol would be $${afterSymbol.toFixed(0)}`,
    );
  }

  if (input.openCryptoPositions >= config.maxPositions && input.proposedOrderValueUsd > 0) {
    failReasons.push(`Max ${config.maxPositions} open crypto positions`);
  }

  if (config.softStartEnabled && input.proposedOrderValueUsd > 0) {
    if (input.newEntriesToday >= config.softStartMaxNewPositionsPerDay) {
      failReasons.push(
        `Soft-start: max ${config.softStartMaxNewPositionsPerDay} new crypto position(s) per UTC day`,
      );
    }
  }

  if (input.cryptoDayStartEquity > 0 && input.cryptoBookValueUsd > 0) {
    const dd =
      ((input.cryptoDayStartEquity - input.cryptoBookValueUsd) / input.cryptoDayStartEquity) * 100;
    if (dd >= config.maxDailyDrawdownPct) {
      failReasons.push(
        `Crypto daily loss limit ${config.maxDailyDrawdownPct}% (current ${dd.toFixed(2)}%)`,
      );
    }
  }

  return { allowed: failReasons.length === 0, failReasons };
}

export function shouldHaltCryptoFromGlobalDrawdown(input: {
  dailyDrawdownPct: number;
  peakDrawdownPct: number;
  maxDailyDrawdownPct: number;
  maxPeakDrawdownPct: number;
}): boolean {
  return (
    input.dailyDrawdownPct >= input.maxDailyDrawdownPct ||
    input.peakDrawdownPct >= input.maxPeakDrawdownPct
  );
}
