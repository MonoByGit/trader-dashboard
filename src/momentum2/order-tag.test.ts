import { momentumOrderTag } from './order-tag';
import { MOMENTUM2_BASE } from './config';
import { m3Versions } from '../momentum3/config';

describe('momentumOrderTag', () => {
  it('M3 gebruikt m3- prefix, niet m2-m3-', () => {
    const [c] = m3Versions();
    expect(momentumOrderTag(c!)).toBe('m3');
    expect(momentumOrderTag(MOMENTUM2_BASE)).toBe(`m2-${MOMENTUM2_BASE.id}`);
  });
});
