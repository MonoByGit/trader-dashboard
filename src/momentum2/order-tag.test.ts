import { momentumClientOrderId, momentumOrderTag, momentumStopClientPrefix } from './order-tag';
import { MOMENTUM2_BASE } from './config';
import { m3Versions } from '../momentum3/config';
import { m5Versions } from '../momentum5/config';

describe('momentumOrderTag', () => {
  it('M3 gebruikt m3- prefix, niet m2-m3-', () => {
    const [c] = m3Versions();
    expect(momentumOrderTag(c!)).toBe('m3');
    expect(momentumOrderTag(MOMENTUM2_BASE)).toBe(`m2-${MOMENTUM2_BASE.id}`);
  });
});

describe('momentumStopClientPrefix', () => {
  it('matcht setStop en stopFill voor M2', () => {
    const cfg = MOMENTUM2_BASE;
    expect(momentumStopClientPrefix(cfg)).toBe(`m2s-${cfg.id}-`);
  });

  it('M3/M5 gebruiken tags met version id', () => {
    const [crypto] = m3Versions();
    expect(momentumStopClientPrefix(crypto!)).toBe(`m3s-${crypto!.id}-`);
    const [qld, tqqq] = m5Versions(100_000, { includeTqqq: true });
    expect(momentumStopClientPrefix(qld!)).toBe(`m5s-${qld!.id}-`);
    expect(momentumStopClientPrefix(tqqq!)).toBe(`m5s-${tqqq!.id}-`);
  });
});

describe('momentumClientOrderId', () => {
  it('versies krijgen unieke ids (M5 QLD vs TQQQ, M3 crypto vs etf)', () => {
    const [crypto, etf] = m3Versions();
    const a = momentumClientOrderId(crypto!, '2026-11-01', 'BIL', 'b');
    const b = momentumClientOrderId(etf!, '2026-11-01', 'BIL', 'b');
    expect(a).not.toBe(b);
    expect(a).toContain(crypto!.id);
    expect(b).toContain(etf!.id);

    const [qld, tqqq] = m5Versions(100_000, { includeTqqq: true });
    const c = momentumClientOrderId(qld!, '2026-11-01', 'BIL', 'b');
    const d = momentumClientOrderId(tqqq!, '2026-11-01', 'BIL', 'b');
    expect(c).not.toBe(d);
    expect(c).toMatch(/^m5-m5-nasdaq-trend-/);
    expect(d).toMatch(/^m5-m5-nasdaq-tqqq-/);
  });
});
