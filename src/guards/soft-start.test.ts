import { loadGuardConfig } from './config';
import { applySoftStartToGuardConfig, parseSoftStartEnabled, SOFT_START_DEFAULTS } from './soft-start';

describe('soft-start', () => {
  it('tightens guard config when enabled', () => {
    const base = loadGuardConfig({
      MAX_POSITIONS: '10',
      MAX_DAILY_TRADES: '10',
      MAX_POSITION_SIZE_PCT: '30',
      MAX_TOTAL_EXPOSURE_PCT: '70',
    } as NodeJS.ProcessEnv);
    const effective = applySoftStartToGuardConfig(base, true);
    expect(effective.maxPositions).toBe(SOFT_START_DEFAULTS.maxNewPositionsPerDay);
    expect(effective.maxDailyTrades).toBe(SOFT_START_DEFAULTS.maxNewPositionsPerDay);
    expect(effective.maxPositionSizePct).toBe(SOFT_START_DEFAULTS.maxPositionSizePct);
    expect(effective.maxTotalExposurePct).toBe(SOFT_START_DEFAULTS.maxTotalExposurePct);
  });

  it('leaves config unchanged when disabled', () => {
    const base = loadGuardConfig({ MAX_POSITIONS: '4' } as NodeJS.ProcessEnv);
    const effective = applySoftStartToGuardConfig(base, false);
    expect(effective).toEqual(base);
  });

  it('parseSoftStartEnabled defaults to on', () => {
    expect(parseSoftStartEnabled(null)).toBe(true);
    expect(parseSoftStartEnabled('false')).toBe(false);
    expect(parseSoftStartEnabled('true')).toBe(true);
  });
});
