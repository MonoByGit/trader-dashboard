import { vixyStressRatio, volStressPasses } from './vixy-stress';

describe('vixyStressRatio', () => {
  it('flags stress when VIXY trades above its 20d average', () => {
    const calm = [...Array(19).fill(10), 10];
    expect(vixyStressRatio(calm)).toBeCloseTo(1, 2);
    expect(volStressPasses(vixyStressRatio(calm), 1.15)).toBe(true);

    const stressed = [...Array(19).fill(10), 12];
    expect(vixyStressRatio(stressed)).toBeGreaterThan(1.15);
    expect(volStressPasses(vixyStressRatio(stressed), 1.15)).toBe(false);
  });
});
