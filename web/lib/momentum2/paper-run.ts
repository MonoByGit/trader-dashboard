import type { MomentumPaperMode } from '../../../src/momentum2/mode';
import { reconcileDisasterStops, type BrokerWithStops } from '../../../src/momentum2/reconcile-disaster-stops';
import type { StrategyHooks } from '../../../src/momentum2/hooks';
import type { Store } from '../../../src/momentum2/live';
import type { Bar, VersionBook, VersionConfig } from '../../../src/momentum2/types';
import { alpacaPaperBroker, shadowBroker } from './broker';

export function brokerForMode(mode: MomentumPaperMode, lastPrice: Record<string, number>): BrokerWithStops {
  if (mode.run && !mode.shadow) return alpacaPaperBroker();
  return shadowBroker(lastPrice);
}

export async function loadOrInitRealBook(
  store: Store,
  cfg: VersionConfig,
  startSpy: number | null,
  startDate: string,
): Promise<VersionBook> {
  const existing = await store.loadBook(cfg.id);
  if (existing) {
    if (!existing.real) {
      existing.real = true;
      await store.saveBook(existing);
    }
    return existing;
  }
  const { newBook } = await import('../../../src/momentum2/book');
  const book = newBook(cfg, startDate, startSpy);
  book.real = true;
  await store.saveBook(book);
  return book;
}

export async function runReconcile<C extends VersionConfig>(input: {
  date: string;
  cfgs: C[];
  store: Store;
  hooks: StrategyHooks<C>;
  barsBySymbol: Record<string, Bar[]>;
  broker: BrokerWithStops;
}): Promise<Record<string, unknown>> {
  const books: Record<string, VersionBook | null> = {};
  for (const c of input.cfgs) books[c.id] = await input.store.loadBook(c.id);
  return reconcileDisasterStops({
    date: input.date,
    cfgs: input.cfgs,
    books,
    hooks: input.hooks,
    barsBySymbol: input.barsBySymbol,
    broker: input.broker,
  });
}
