import { alpaca } from './alpaca';
import {
  DEFAULT_VOL_STRESS_RATIO_MAX,
  vixyStressRatio,
  volStressPasses,
} from '../../src/volatility/vixy-stress';
import strategy from '@/strategy.json';

export interface VolStressSnapshot {
  ratio: number | null;
  maxRatio: number;
  pass: boolean | null;
  note: string;
}

export async function loadVolStressSnapshot(): Promise<VolStressSnapshot> {
  const maxRatio =
    (strategy.rules as { vol_stress_ratio_max?: number }).vol_stress_ratio_max ??
    DEFAULT_VOL_STRESS_RATIO_MAX;
  try {
    const bars = (await alpaca.bars(['VIXY'], '1Day', 30)).bars?.VIXY ?? [];
    const closes = bars.map((b) => b.c);
    const ratio = vixyStressRatio(closes);
    const pass = volStressPasses(ratio, maxRatio);
    const note =
      ratio == null
        ? 'Onvoldoende VIXY-historie voor stress-ratio.'
        : `VIXY stress ${ratio.toFixed(2)} vs max ${maxRatio.toFixed(2)} (close / 20d gem.)`;
    return { ratio, maxRatio, pass, note };
  } catch {
    return {
      ratio: null,
      maxRatio,
      pass: null,
      note: 'VIXY stress-ratio niet beschikbaar.',
    };
  }
}
