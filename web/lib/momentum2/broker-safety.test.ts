import { readFileSync } from 'node:fs';
import { momentumMarketTimeInForce } from './broker';

describe('momentumMarketTimeInForce', () => {
  it('gebruikt gtc voor crypto, day voor ETF', () => {
    expect(momentumMarketTimeInForce('BTC/USD')).toBe('gtc');
    expect(momentumMarketTimeInForce('QQQ')).toBe('day');
  });
});

describe('alpacaPaperBroker setStop', () => {
  it('plaatst nieuwe stop vóór annuleren van oude (bronvolgorde)', () => {
    const src = readFileSync(new URL('./broker.ts', import.meta.url), 'utf8');
    const setStopBody = src.slice(src.indexOf('async setStop(o)'), src.indexOf('async listOpenStops'));
    const placeIdx = setStopBody.indexOf('await alpaca.placeOrder');
    const cancelIdx = setStopBody.indexOf('awaitStopOrderCanceled');
    expect(placeIdx).toBeGreaterThan(-1);
    expect(cancelIdx).toBeGreaterThan(placeIdx);
    expect(setStopBody).toMatch(/nextStopClientOrderId/);
  });

  it('client_order_id bevat qty en sequentie', () => {
    const src = readFileSync(new URL('./broker.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/stopSeqByKey/);
    expect(src).toMatch(/cfgFractionalQtyKey\(qty\)/);
  });
});
