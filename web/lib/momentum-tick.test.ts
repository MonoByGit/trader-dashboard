import { runMomentumShadowTick } from './momentum-tick';

const day = { date: '2026-11-02', open: '09:30', close: '16:00' };
const now = Date.parse('2026-11-02T14:42:00Z');

function deps(over: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const marks: string[] = [];
  const logs: string[] = [];
  const run = {
    momentum2: async (s: string) => { calls.push(`m2:${s}`); return { step: s, shadow: true, trades: 0 }; },
    momentum3: async (s: string) => { calls.push(`m3:${s}`); return { skipped: true, reason: 'markt gesloten' }; },
    momentum5: async (s: string) => { calls.push(`m5:${s}`); throw new Error('boem'); },
    momentum6: async (s: string) => { calls.push(`m6:${s}`); return {}; },
  };
  return {
    calls, marks, logs,
    d: {
      run: run as never,
      readDone: async () => new Set<string>(),
      markDone: async (k: string) => { marks.push(k); },
      log: (l: string) => logs.push(l),
      env: { MOMENTUM2_ENABLED: '1', MOMENTUM3_ENABLED: '1', MOMENTUM5_ENABLED: '1', ...over } as NodeJS.ProcessEnv,
    },
  };
}

describe('runMomentumShadowTick', () => {
  const origErr = console.error;
  beforeAll(() => { console.error = () => {}; });
  afterAll(() => { console.error = origErr; });

  it('draait alleen ingeschakelde strategieën; skip telt niet als gedaan; fout markeert en breekt niets', async () => {
    const t = deps();
    const r = await runMomentumShadowTick(now, day, t.d);
    expect(t.calls).toEqual(['m2:execute', 'm3:execute', 'm5:execute']);
    expect(t.marks).toEqual([
      'm:tick:momentum2:execute:2026-11-02',
      'm:tick:momentum5:execute:2026-11-02',
    ]);
    expect(r['momentum5:execute']).toEqual({ error: 'boem' });
    expect(t.logs.find((l) => l.includes('momentum2:execute'))).toMatch(/schaduw=ja/);
  });
  it('vlag uit: niets aangeroepen', async () => {
    const t = deps({ MOMENTUM2_ENABLED: '0', MOMENTUM3_ENABLED: undefined, MOMENTUM5_ENABLED: undefined });
    await runMomentumShadowTick(now, day, t.d);
    expect(t.calls).toEqual([]);
  });
  it('DRY_RUN=0 weigert, geen run', async () => {
    const t = deps({ MOMENTUM2_DRY_RUN: '0' });
    await runMomentumShadowTick(now, day, t.d);
    expect(t.calls).not.toContain('m2:execute');
  });
  it('al gedaan vandaag: niet opnieuw', async () => {
    const t = deps();
    t.d.readDone = async () => new Set(['m:tick:momentum2:execute:2026-11-02']);
    await runMomentumShadowTick(now, day, t.d);
    expect(t.calls).not.toContain('m2:execute');
  });
});
