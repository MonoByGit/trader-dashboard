import { rsiWilder } from './rsi';

/** 20 closes — Wilder RSI(14) at last bar ≈ 73.56 (hand-checked via reference impl). */
const GOLDEN_CLOSES = [
  46.4, 47.0, 46.5, 46.9, 47.8, 47.5, 47.8, 48.2, 48.5, 48.7, 48.5, 48.6, 48.2, 49.0, 49.3, 49.5,
  49.2, 49.8, 50.1, 49.9,
];

describe('rsiWilder', () => {
  it('matches a known Wilder RSI(14) on a fixed series', () => {
    const rsi = rsiWilder(GOLDEN_CLOSES, 14);
    expect(rsi).not.toBeNull();
    expect(rsi!).toBeCloseTo(73.56, 1);
  });

  it('weights the most recent closes (not an older 15-bar window)', () => {
    const flat = Array(25).fill(100);
    const withDrop = [...flat, 95];
    expect(rsiWilder(withDrop, 14)!).toBeLessThan(rsiWilder(flat, 14)!);
  });
});
