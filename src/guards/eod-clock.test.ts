import { loadGuardConfig } from './config.js';
import { planEodClose } from './eod-clock.js';

const config = loadGuardConfig({});

describe('planEodClose', () => {
  it('flattens when market is open with enough time before close', () => {
    const plan = planEodClose(
      {
        timestamp: '2026-01-15T20:45:00Z',
        is_open: true,
        next_close: '2026-01-15T21:00:00Z',
        next_open: '2026-01-16T14:30:00Z',
      },
      true,
      config,
      Date.parse('2026-01-15T20:45:00Z')
    );
    expect(plan.action).toBe('flatten');
  });

  it('keeps brackets when market is closed after the bell', () => {
    const plan = planEodClose(
      {
        timestamp: '2026-01-15T21:05:00Z',
        is_open: false,
        next_close: '2026-01-15T21:00:00Z',
        next_open: '2026-01-16T14:30:00Z',
      },
      true,
      config,
      Date.parse('2026-01-15T21:05:00Z')
    );
    expect(plan.action).toBe('keep_brackets');
  });

  it('keeps brackets when too close to the close while still open', () => {
    const plan = planEodClose(
      {
        timestamp: '2026-01-15T20:59:30Z',
        is_open: true,
        next_close: '2026-01-15T21:00:00Z',
        next_open: '2026-01-16T14:30:00Z',
      },
      true,
      config,
      Date.parse('2026-01-15T20:59:30Z')
    );
    expect(plan.action).toBe('keep_brackets');
  });
});
