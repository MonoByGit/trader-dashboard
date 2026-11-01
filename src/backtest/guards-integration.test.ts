import { loadGuardConfig } from '../guards/config';
import { evaluatePortfolioLimits } from '../guards/portfolio-limits';

describe('backtest guard integration', () => {
  it('portfolio limits block oversized orders like live', () => {
    const config = loadGuardConfig({ MAX_POSITION_SIZE_PCT: '30' } as NodeJS.ProcessEnv);
    const res = evaluatePortfolioLimits(
      {
        equity: 100_000,
        cash: 100_000,
        openPositionCount: 0,
        dailyTrades: 0,
        proposedOrderValueUsd: 40_000,
        totalExposureUsd: 0,
      },
      config,
    );
    expect(res.allowed).toBe(false);
    expect(res.failReasons.some((r) => r.includes('Position size'))).toBe(true);
  });
});
