/** @jest-environment node */
import { jest } from '@jest/globals';

type Run = { routine: string; trading_date: string; status: string; started_at?: string };
const runs: Run[] = [];
let emergencyStop = false;

await jest.unstable_mockModule('@/lib/routine-runs', () => ({
  listRecentMomentumRuns: async () => runs,
  tryBeginRoutineRun: async (routine: string, day: string) => {
    runs.push({ routine, trading_date: day, status: 'running', started_at: new Date().toISOString() });
    return { runId: `${routine}-${day}-${runs.length}`, slotKey: day };
  },
  finishRoutineRun: async (id: string, status: string) => {
    const idx = Number(id.split('-').at(-1)) - 1;
    runs[idx]!.status = status;
  },
}));
await jest.unstable_mockModule('@/lib/guards/service', () => ({
  loadGuardState: async () => ({ emergencyStop, tradingEnabled: true, circuitBreakerTripped: false }),
}));
const never = async () => { throw new Error('echte runner mag in de test niet draaien'); };
await jest.unstable_mockModule('@/lib/momentum2/run', () => ({ runMomentum2: never }));
await jest.unstable_mockModule('@/lib/momentum3/run', () => ({ runMomentum3: never }));
await jest.unstable_mockModule('@/lib/momentum5/run', () => ({ runMomentum5: never }));
await jest.unstable_mockModule('@/lib/momentum6/run', () => ({ runMomentum6: never }));

const { runMomentumTick } = await import('./momentum-tick');

const cal = { date: '2026-11-02', open: '09:30', close: '16:00' };
const afterOpen = new Date('2026-11-02T14:50:00Z').getTime();

function fakeRunners(calls: string[], fail?: string) {
  const mk = (name: string) => async (step: string) => {
    calls.push(`${name}:${step}`);
    if (name === fail) throw new Error('boom');
    return { step, shadow: true, date: '2026-11-02', trades: 0 };
  };
  return { momentum2: mk('m2'), momentum3: mk('m3'), momentum5: mk('m5'), momentum6: mk('m6') };
}

describe('runMomentumTick', () => {
  beforeEach(() => { runs.length = 0; emergencyStop = false; });

  it('roept M2, M3, M5 (execute) en M6 (decide+execute) aan in schaduw, met logregel', async () => {
    const calls: string[] = [];
    const lines: string[] = [];
    const out = await runMomentumTick(afterOpen, cal, { runners: fakeRunners(calls), log: (l) => lines.push(l) });
    expect(calls.sort()).toEqual(['m2:execute', 'm3:execute', 'm5:execute', 'm6:decide', 'm6:execute']);
    expect(Object.keys(out).sort()).toEqual(['momentum2-execute', 'momentum3-execute', 'momentum5-execute', 'momentum6-run']);
    expect(lines.some((l) => /^\[momentum-tick\] momentum5-execute 2026-11-02 ok schaduw/.test(l))).toBe(true);
  });

  it('tweede tick dezelfde dag doet niets meer', async () => {
    const calls: string[] = [];
    await runMomentumTick(afterOpen, cal, { runners: fakeRunners(calls), log: () => {} });
    calls.length = 0;
    await runMomentumTick(afterOpen + 5 * 60_000, cal, { runners: fakeRunners(calls), log: () => {} });
    expect(calls).toEqual([]);
  });

  it('fout in één strategie raakt de andere niet', async () => {
    const calls: string[] = [];
    const out = await runMomentumTick(afterOpen, cal, { runners: fakeRunners(calls, 'm3'), log: () => {} });
    expect(out['momentum3-execute']).toEqual({ error: 'boom' });
    expect(calls).toContain('m5:execute');
    expect(runs.find((r) => r.routine === 'momentum3-execute')!.status).toBe('failed');
  });

  it('noodstop: niets draaien', async () => {
    emergencyStop = true;
    const calls: string[] = [];
    await runMomentumTick(afterOpen, cal, { runners: fakeRunners(calls), log: () => {} });
    expect(calls).toEqual([]);
  });

  it('runner meldt skipped (vlag uit): run telt als skipped, niet ok', async () => {
    const lines: string[] = [];
    const skip = async () => ({ skipped: true, reason: 'MOMENTUM5_ENABLED staat niet aan' });
    await runMomentumTick(afterOpen, cal, {
      runners: { momentum2: skip, momentum3: skip, momentum5: skip, momentum6: skip },
      log: (l) => lines.push(l),
    });
    expect(runs.every((r) => r.status === 'skipped')).toBe(true);
    expect(lines.some((l) => l.includes('MOMENTUM5_ENABLED staat niet aan'))).toBe(true);
  });
});
