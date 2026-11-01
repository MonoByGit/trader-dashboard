import type { GuardConfig } from './config';
import type { PortfolioLimitsInput, PortfolioLimitsResult } from './types';

export function evaluatePortfolioLimits(
  input: PortfolioLimitsInput,
  config: GuardConfig
): PortfolioLimitsResult {
  const failReasons: string[] = [];
  const warnings: string[] = [];

  if (input.openPositionCount >= config.maxPositions) {
    failReasons.push(`Max open positions (${config.maxPositions}) reached`);
  }

  if (input.dailyTrades >= config.maxDailyTrades) {
    failReasons.push(`Max daily trades (${config.maxDailyTrades}) reached`);
  }

  if (input.proposedOrderValueUsd > config.maxOrderSizeUsd) {
    failReasons.push(
      `Order size $${input.proposedOrderValueUsd.toFixed(0)} exceeds max $${config.maxOrderSizeUsd}`
    );
  }

  if (input.proposedOrderValueUsd > 0 && input.proposedOrderValueUsd < config.minOrderSizeUsd) {
    failReasons.push(
      `Order size $${input.proposedOrderValueUsd.toFixed(0)} below min $${config.minOrderSizeUsd}`
    );
  }

  const equity = input.equity > 0 ? input.equity : 1;
  const cashPct = (input.cash / equity) * 100;
  const cashAfter = input.cash - input.proposedOrderValueUsd;
  const cashAfterPct = (cashAfter / equity) * 100;

  if (cashAfterPct < config.minCashReservePct) {
    failReasons.push(
      `Order would breach min cash reserve (${config.minCashReservePct}%, would be ${cashAfterPct.toFixed(1)}%)`
    );
  }

  const symbolExposure = (input.currentSymbolExposureUsd ?? 0) + input.proposedOrderValueUsd;
  const symbolPct = (symbolExposure / equity) * 100;
  if (symbolPct > config.maxPositionSizePct) {
    failReasons.push(
      `Position size ${symbolPct.toFixed(1)}% exceeds max ${config.maxPositionSizePct}%`
    );
  } else if (symbolPct > config.maxPositionSizePct * 0.9) {
    warnings.push(`Position size ${symbolPct.toFixed(1)}% near limit ${config.maxPositionSizePct}%`);
  }

  const totalExposure = input.totalExposureUsd + input.proposedOrderValueUsd;
  const exposurePct = (totalExposure / equity) * 100;
  if (exposurePct > config.maxTotalExposurePct) {
    failReasons.push(
      `Total exposure ${exposurePct.toFixed(1)}% exceeds max ${config.maxTotalExposurePct}%`
    );
  }

  if (cashPct < config.minCashReservePct + 2 && input.proposedOrderValueUsd === 0) {
    warnings.push(`Cash reserve ${cashPct.toFixed(1)}% near minimum ${config.minCashReservePct}%`);
  }

  return { allowed: failReasons.length === 0, failReasons, warnings };
}
