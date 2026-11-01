import type { MomentumPaperMode } from '../../../src/momentum2/mode';
import { reconcileDisasterStops, type BrokerWithStops } from '../../../src/momentum2/reconcile-disaster-stops';
import type { StrategyHooks } from '../../../src/momentum2/hooks';
import type { ForeignQtyFn, Store } from '../../../src/momentum2/live';
import type { Bar, VersionBook, VersionConfig } from '../../../src/momentum2/types';
import { alpacaPaperBroker, shadowBroker } from './broker';
import { foreignQtyForSymbol } from './ownership';

/** Qty van `symbol` in de echte boeken van andere sleeves (eigen boek telt niet mee). */
export const foreignQtyOtherSleeves: ForeignQtyFn = (symbol, versionId) => foreignQtyForSymbol(symbol, versionId);

export function brokerForMode(mode: MomentumPaperMode, lastPrice: Record<string, number>): BrokerWithStops {
  if (mode.run && !mode.shadow) return alpacaPaperBroker();
  return shadowBroker(lastPrice);
}

/**
 * Papierboek: nooit een schaduwboek omzetten (phantom posities).
 * Bestaand echt boek hergebruiken; anders leeg starten met startbudget.
 */
export async function loadOrInitRealBook(
  store: Store,
  cfg: VersionConfig,
  startSpy: number | null,
  startDate: string,
): Promise<VersionBook> {
  const existing = await store.loadBook(cfg.id);
  if (existing?.real) return existing;

  const { newBook } = await import('../../../src/momentum2/book');
  const book = newBook(cfg, startDate, startSpy);
  book.real = true;
  book.positions = {};
  book.cash = cfg.budgetUsd;
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
  foreignQty?: ForeignQtyFn;
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
    foreignQty: input.foreignQty ?? foreignQtyOtherSleeves,
  });
}
