import { earningsWithin, formatNewsContext, sourceLabels } from './news';
import { buildVetoPrompt, makeVeto, withShadows } from './veto';
import type { NewsContext, VetoCandidate, VetoFn } from './types';

const cand: VetoCandidate = { symbol: 'XLK', momentum: 0.12, weight: 0.4, lastClose: 200, sma: 180, strategy: 'm2-rotatie-a' };
const ctx: NewsContext = {
  headlines: [{ headline: 'Chipmaker waarschuwt voor lagere omzet', source: 'Benzinga', publishedAt: '2026-10-30T10:00:00Z' }],
  earnings: [{ symbol: 'XLK', date: '2026-11-04' }, { symbol: 'AAPL', date: '2026-11-05' }],
  sources: { alpacaNews: 'ok', finnhubCalendar: 'ok' },
};

describe('nieuwscontext', () => {
  it('zet echte koppen en earnings in de prompt', () => {
    const p = buildVetoPrompt({ ...cand, news: ctx });
    expect(p).toContain('Chipmaker waarschuwt voor lagere omzet');
    expect(p).toContain('Benzinga');
    expect(p).toContain('2026-11-04');
    expect(p).not.toContain('2026-11-05'); // earnings van een ander symbool
  });
  it('zonder nieuws zegt de prompt dat het model het nieuws niet kent', () => {
    expect(buildVetoPrompt(cand)).toMatch(/geen nieuws aangeleverd/);
    const down: NewsContext = { headlines: [], earnings: [], sources: { alpacaNews: 'error', finnhubCalendar: 'unavailable' } };
    expect(formatNewsContext(down, 'XLK')).toMatch(/Alpaca\): niet beschikbaar/);
    expect(formatNewsContext(down, 'XLK')).toMatch(/Finnhub\): niet beschikbaar/);
  });
  it('bronnenlabels voor de log', () => {
    expect(sourceLabels(ctx)).toEqual(['alpaca-news:ok(1)', 'finnhub-calendar:ok(2)']);
    expect(sourceLabels({ ...ctx, sources: { alpacaNews: 'unavailable', finnhubCalendar: 'ok' } })[0]).toBe('alpaca-news:unavailable');
  });
  it('earningsWithin', () => {
    expect(earningsWithin(ctx.earnings, 'XLK', '2026-11-02', 3)).toBe(true);
    expect(earningsWithin(ctx.earnings, 'XLK', '2026-11-02', 1)).toBe(false);
  });
});

describe('veto-log', () => {
  const meta = { model: 'deepseek-chat', modelVersion: 'v3.1' };
  it('legt model, versie, strategieversie en bronnen vast bij elk besluit', async () => {
    const v = await makeVeto(async () => '{"veto":true,"reason":"waarschuwing"}', meta)({ ...cand, news: ctx });
    expect(v).toMatchObject({ veto: true, model: 'deepseek-chat', modelVersion: 'v3.1', strategyVersion: 'm2-rotatie-a', sources: ['alpaca-news:ok(1)', 'finnhub-calendar:ok(2)'] });
  });
  it('ook bij een fout of zonder nieuws staat de trace erop', async () => {
    const v = await makeVeto(async () => { throw new Error('x'); }, meta)(cand);
    expect(v).toMatchObject({ veto: false, failedOpen: true, strategyVersion: 'm2-rotatie-a', sources: ['geen-nieuws-aangeleverd'] });
  });
});

describe('schaduwmodellen', () => {
  const main: VetoFn = async () => ({ veto: false, reason: 'ok', model: 'deepseek', modelVersion: '1' });
  it('lopen mee op dezelfde input en veranderen het besluit nooit', async () => {
    const seen: VetoCandidate[] = [];
    const a: VetoFn = async (c) => { seen.push(c); return { veto: true, reason: 'nee', model: 'claude', modelVersion: 'x' }; };
    const b: VetoFn = async (c) => { seen.push(c); return { veto: true, reason: 'nee', model: 'gemini', modelVersion: 'y' }; };
    const v = await withShadows(main, [a, b])({ ...cand, news: ctx });
    expect(v.veto).toBe(false);
    expect(v.shadow?.map((s) => s.model)).toEqual(['claude', 'gemini']);
    expect(seen[0]).toBe(seen[1]); // exact dezelfde input
  });
  it('een kapot schaduwmodel raakt niets', async () => {
    const bad: VetoFn = async () => { throw new Error('timeout'); };
    const v = await withShadows(main, [bad])(cand);
    expect(v.veto).toBe(false);
    expect(v.shadow?.[0]).toMatchObject({ veto: false, failedOpen: true });
  });
  it('zonder schaduwmodellen is het resultaat het hoofdbesluit', async () => {
    expect((await withShadows(main, [])(cand)).shadow).toBeUndefined();
  });
});
