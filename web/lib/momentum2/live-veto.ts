import { withShadows } from '../../../src/momentum2/veto';
import type { VetoFn } from '../../../src/momentum2/types';
import { buildNewsContext } from '../news/context';
import { deepseekVeto } from './deepseek-veto';
import { shadowVetoes } from './shadow-models';

/**
 * De veto-poort zoals de schaduwrun hem gebruikt: echte koppen en earnings erbij, DeepSeek beslist (alleen veto),
 * eventuele schaduwmodellen lopen op exact dezelfde input mee en worden alleen gelogd.
 */
export function liveVeto(): VetoFn | undefined {
  if (!process.env.DEEPSEEK_API_KEY) return undefined;
  const combined = withShadows(deepseekVeto(), shadowVetoes());
  // Het nieuws wordt één keer opgehaald: hoofdmodel en schaduwmodellen krijgen exact dezelfde input.
  return async (c) => combined({ ...c, news: c.news ?? (await buildNewsContext(c.symbol)) });
}
