import { buildHome, type HomeInput } from './build-home';

const base: HomeInput = {
  now: '2026-11-02T15:00:00Z',
  account: { equity: 100000, cash: 50000, dayPnl: 120, dayPnlPct: 0.0012, marketOpen: true },
  guards: { tradingEnabled: true, emergencyStop: false, circuitBreakerTripped: false },
  env: {},
  runs: [],
  decisions: [],
  heartbeat: { at: '2026-11-02T14:58:00Z', due: [], errors: 0 },
};

describe('buildHome', () => {
  it('M2..M6 staan standaard uit; M1 echt', () => {
    const h = buildHome(base);
    expect(h.strategieen.find((s) => s.id === 'm1')?.status).toBe('echt');
    for (const id of ['momentum2', 'momentum3', 'momentum5', 'momentum6']) {
      expect(h.strategieen.find((s) => s.id === id)?.status).toBe('uit');
    }
    expect(h.strategieen.some((s) => s.id === 'momentum4')).toBe(false);
  });
  it('ENABLED=1 is schaduw; M5 met DRY_RUN=0 is papier, M2 met DRY_RUN=0 geblokkeerd', () => {
    const h = buildHome({ ...base, env: { MOMENTUM2_ENABLED: '1', MOMENTUM5_ENABLED: '1', MOMENTUM5_DRY_RUN: '0' } });
    expect(h.strategieen.find((s) => s.id === 'momentum2')?.status).toBe('schaduw');
    expect(h.strategieen.find((s) => s.id === 'momentum5')?.status).toBe('papier');
    expect(h.strategieen.find((s) => s.id === 'momentum5')?.reden).toMatch(/Papierorders bij Alpaca/);
    const h2 = buildHome({ ...base, env: { MOMENTUM2_ENABLED: '1', MOMENTUM2_DRY_RUN: '0', MOMENTUM6_ENABLED: '1', MOMENTUM6_DRY_RUN: '0' } });
    expect(h2.strategieen.find((s) => s.id === 'momentum2')?.status).toBe('geblokkeerd');
    expect(h2.strategieen.find((s) => s.id === 'momentum6')?.status).toBe('papier');
  });
  it('noodstop maakt M1 geblokkeerd met reden', () => {
    const h = buildHome({ ...base, guards: { tradingEnabled: true, emergencyStop: true, circuitBreakerTripped: false } });
    const m1 = h.strategieen.find((s) => s.id === 'm1')!;
    expect(m1.status).toBe('geblokkeerd');
    expect(m1.reden).toMatch(/Noodstop/);
  });
  it('laatste run per strategie', () => {
    const h = buildHome({
      ...base,
      env: { MOMENTUM3_ENABLED: '1' },
      runs: [
        { routine: 'momentum3-execute', status: 'ok', trading_date: '2026-11-02', started_at: '2026-11-02T14:50:00Z', skip_reason: null },
        { routine: 'momentum3-decide', status: 'ok', trading_date: '2026-11-01', started_at: '2026-10-30T21:30:00Z', skip_reason: null },
      ],
    });
    expect(h.strategieen.find((s) => s.id === 'momentum3')?.laatsteRun?.routine).toBe('momentum3-execute');
  });
  it('motor: gezond, verouderd of ontbrekend', () => {
    expect(buildHome(base).motor.gezond).toBe(true);
    expect(buildHome({ ...base, heartbeat: { at: '2026-11-02T13:00:00Z', errors: 0 } }).motor.gezond).toBe(false);
    const none = buildHome({ ...base, heartbeat: null }).motor;
    expect(none.gezond).toBe(false);
    expect(none.melding).toMatch(/Nog geen tick/);
  });
  it('fouten zichtbaar in plaats van leeg: account-fout en reden-ontbreekt', () => {
    const h = buildHome({
      ...base,
      account: null,
      accountError: 'Alpaca 503',
      decisions: [{ ts: 'x', symbol: 'QQQ', decision: 'skip', rationale: null, routine: 'midday' }],
    });
    expect(h.portfolio.fout).toBe('Alpaca 503');
    expect(h.recent[0]!.reden).toBe('Geen reden vastgelegd');
  });
});

describe('buildHome laatste run', () => {
  it('kiest de nieuwste op tijd, ook als de tekst een andere tijdzone heeft', () => {
    const h = buildHome({
      now: '2026-11-01T18:00:00Z', account: null, guards: null, env: {}, decisions: [], heartbeat: null,
      runs: [
        { routine: 'momentum6-run', status: 'skipped', trading_date: '2026-11-01', started_at: '2026-11-01 17:30:00+01', skip_reason: null },
        { routine: 'momentum6-run', status: 'ok', trading_date: '2026-11-01', started_at: '2026-11-01 16:35:00+00', skip_reason: null },
      ],
    });
    // 17:30+01 = 16:30Z, dus de ok-run van 16:35Z is de nieuwste (tekstsortering zou de verkeerde kiezen)
    expect(h.strategieen.find((s) => s.id === 'momentum6')?.laatsteRun?.status).toBe('ok');
  });
});
