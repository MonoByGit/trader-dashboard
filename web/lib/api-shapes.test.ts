/** @jest-environment node */
import { ordersFromResponse, readJson, runsFromResponse } from './api-shapes';

describe('runsFromResponse (contract RoutinesPage en /api/runs)', () => {
  it('leest { today, runs } zoals de route zonder filters teruggeeft', () => {
    const runs = [{ id: 'run-momentum6-run-1', routine: 'momentum6-run' }];
    expect(runsFromResponse({ today: '2026-11-01', runs })).toEqual(runs);
  });
  it('leest ook een kale lijst (route met date of filters)', () => {
    expect(runsFromResponse([{ id: 'a' }])).toEqual([{ id: 'a' }]);
  });
  it('een andere vorm is een fout, geen lege lijst', () => {
    expect(() => runsFromResponse({ today: '2026-11-01' })).toThrow(/onverwacht/);
    expect(() => runsFromResponse(null)).toThrow(/onverwacht/);
  });
});

describe('ordersFromResponse (HistoryPage)', () => {
  it('lijst blijft lijst, ook leeg', () => {
    expect(ordersFromResponse([])).toEqual([]);
  });
  it('een fout-object wordt een zichtbare fout met de melding van de route', () => {
    expect(() => ordersFromResponse({ error: 'Alpaca 503' })).toThrow('Alpaca 503');
  });
});

describe('readJson', () => {
  const res = (ok: boolean, status: number, body: unknown, bad = false) => ({
    ok, status, json: async () => { if (bad) throw new Error('x'); return body; },
  });
  it('geeft de foutmelding van de route door', async () => {
    await expect(readJson(res(false, 401, { error: 'Niet ingelogd' }))).rejects.toThrow('Niet ingelogd');
  });
  it('HTTP-status als er geen JSON is', async () => {
    await expect(readJson(res(false, 502, null, true))).rejects.toThrow('HTTP 502');
  });
  it('ok-antwoord komt terug', async () => {
    await expect(readJson(res(true, 200, { runs: [] }))).resolves.toEqual({ runs: [] });
  });
});
