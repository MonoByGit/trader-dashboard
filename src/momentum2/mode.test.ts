import { readFileSync } from 'node:fs';
import { resolveMomentum2Mode } from './mode';

describe('momentum2 modus', () => {
  it('staat standaard uit', () => {
    expect(resolveMomentum2Mode({})).toMatchObject({ run: false });
    expect(resolveMomentum2Mode({ MOMENTUM2_ENABLED: 'true' })).toMatchObject({ run: false });
  });
  it('aan = alleen schaduw', () => {
    expect(resolveMomentum2Mode({ MOMENTUM2_ENABLED: '1' })).toEqual({ run: true, shadow: true });
    expect(resolveMomentum2Mode({ MOMENTUM2_ENABLED: '1', MOMENTUM2_DRY_RUN: '1' })).toEqual({ run: true, shadow: true });
  });
  it('DRY_RUN=0 weigert te handelen, welke waarde ook', () => {
    const m = resolveMomentum2Mode({ MOMENTUM2_ENABLED: '1', MOMENTUM2_DRY_RUN: '0' });
    expect(m.run).toBe(false);
    for (const v of ['0', '1', 'false', 'no', '', undefined, 'real', 'live']) {
      const r = resolveMomentum2Mode({ MOMENTUM2_ENABLED: '1', MOMENTUM2_DRY_RUN: v });
      expect('shadow' in r ? r.shadow : true).toBe(true); // er bestaat geen niet-schaduw modus
    }
  });
  it('de route importeert de Alpaca-broker niet', () => {
    const src = readFileSync(new URL('../../web/lib/momentum2/run.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/alpacaPaperBroker/);
    expect(src).not.toMatch(/placeOrder|cancelOrder/);
    expect(src).toMatch(/resolveMomentum2Mode/);
  });
});

import { resolveMomentumPaperMode, resolveShadowMode } from './mode';
describe('resolveShadowMode (M3/M4)', () => {
  it('uit tenzij ENABLED=1, en DRY_RUN=0 wordt geweigerd', () => {
    expect(resolveShadowMode({}, 'MOMENTUM3')).toMatchObject({ run: false });
    expect(resolveShadowMode({ MOMENTUM3_ENABLED: '1' }, 'MOMENTUM3')).toEqual({ run: true, shadow: true });
    expect(resolveShadowMode({ MOMENTUM3_ENABLED: '1', MOMENTUM3_DRY_RUN: '0' }, 'MOMENTUM3')).toMatchObject({ run: false });
  });
  it('M3-route raakt geen echte orders', () => {
    const src = readFileSync(new URL('../../web/lib/momentum3/run.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/alpacaPaperBroker|placeOrder|cancelOrder/);
    expect(src).toMatch(/shadowBroker/);
  });
  it('M5/M6: standaard schaduw; papier via resolveMomentumPaperMode + brokerForMode', () => {
    expect(resolveMomentumPaperMode({ MOMENTUM5_ENABLED: '1' }, 'MOMENTUM5')).toEqual({ run: true, shadow: true });
    expect(resolveMomentumPaperMode({ MOMENTUM5_ENABLED: '1', MOMENTUM5_DRY_RUN: '0' }, 'MOMENTUM5')).toEqual({
      run: true,
      shadow: false,
      paper: true,
    });
    for (const p of ['momentum5/run.ts', 'momentum6/run.ts']) {
      const src = readFileSync(new URL(`../../web/lib/${p}`, import.meta.url), 'utf8');
      expect(src).toMatch(/brokerForMode/);
      expect(src).toMatch(/runReconcile/);
    }
    for (const p of ['momentum5/run/route.ts', 'momentum6/run/route.ts']) {
      const src = readFileSync(new URL(`../../web/app/api/${p}`, import.meta.url), 'utf8');
      expect(src).toMatch(/requireCronAuth/);
      expect(src).toMatch(/force-dynamic/);
    }
  });
});
