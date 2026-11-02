import { isCryptoSymbol } from '../asset-classes/classify';
import { alpacaSymbolsEqual } from '../alpaca/symbol-path';
import type { StrategyHooks } from './hooks';
import { dateOf } from './indicators';
import type { MomentumBroker, OpenStopOrder } from './broker-types';
import { sleeveQty, type ForeignQtyFn } from './live';
import { momentumStopClientPrefix } from './order-tag';
import type { Bar, VersionBook, VersionConfig } from './types';

export type { OpenStopOrder };

export type BrokerWithStops = MomentumBroker;

function symMatch(a: string, b: string): boolean {
  return a === b || alpacaSymbolsEqual(a, b);
}

/** Positie zonder stop → aanmaken; stop zonder positie → annuleren; geen dubbele stops per symbool. */
export async function reconcileDisasterStops<C extends VersionConfig>(input: {
  date: string;
  cfgs: C[];
  books: Record<string, VersionBook | null | undefined>;
  hooks: StrategyHooks<C>;
  barsBySymbol: Record<string, Bar[]>;
  broker: BrokerWithStops;
  foreignQty?: ForeignQtyFn;
}): Promise<{ recreated: string[]; cancelled: string[]; deduped: string[]; failed: string[] }> {
  const failed: string[] = [];
  const recreated: string[] = [];
  const cancelled: string[] = [];
  const deduped: string[] = [];

  for (const cfg of input.cfgs) {
    const book = input.books[cfg.id];
    if (!book?.real) continue;
    const prefix = momentumStopClientPrefix(cfg);
    let open = await input.broker.listOpenStops({ stopClientPrefix: prefix });

    for (const [sym, pos] of Object.entries(book.positions)) {
      const hist = (input.barsBySymbol[sym] ?? []).filter((b) => dateOf(b) < input.date);
      const st = input.hooks.stopFor(pos, cfg, hist.length ? hist : undefined, sym);
      if (!Number.isFinite(st.level) || st.level <= 0) continue;

      const matches = open.filter((o) => symMatch(o.symbol, sym));
      // een replace of plaatsing loopt nog (oud en nieuw tegelijk zichtbaar): niets annuleren, volgende run
      if (matches.some((m) => m.status === 'pending_replace' || m.status === 'pending_new')) continue;
      if (matches.length > 1) {
        matches.sort((a, b) => b.stopPrice - a.stopPrice);
        for (const extra of matches.slice(1)) {
          if (extra.orderId) {
            await input.broker.cancelStop({ versionId: cfg.id, symbol: extra.symbol, orderId: extra.orderId });
          } else {
            await input.broker.cancelStop({ versionId: cfg.id, symbol: extra.symbol, stopClientPrefix: prefix });
          }
          deduped.push(`${cfg.id}:${sym}:${extra.clientOrderId}`);
        }
        open = open.filter((o) => !matches.slice(1).some((x) => x.clientOrderId === o.clientOrderId));
      }

      const cur = matches[0];
      try {
        // nooit stops voor stukken die deze sleeve niet bij de broker heeft (andere sleeves, short)
        const qty = await sleeveQty(input.broker, book, sym, input.foreignQty);
        if (!(qty > 0)) {
          failed.push(`${cfg.id}:${sym}:geen broker-qty`);
          continue;
        }
        if (!cur || cur.qty !== qty || cur.stopPrice < st.level - 1e-6) {
          await input.broker.setStop({
            versionId: cfg.id,
            symbol: sym,
            qty,
            stopPrice: st.level,
            stopClientPrefix: prefix,
          });
          recreated.push(`${cfg.id}:${sym}`);
        }
      } catch (e) {
        // één symbool mag de rest van de reconcile niet blokkeren; volgende run opnieuw
        failed.push(`${cfg.id}:${sym}:${e instanceof Error ? e.message : String(e)}`);
      }
    }

    for (const stop of open) {
      const held = Object.keys(book.positions).some((sym) => symMatch(sym, stop.symbol));
      if (!held) {
        await input.broker.cancelStop({
          versionId: cfg.id,
          symbol: stop.symbol,
          stopClientPrefix: prefix,
        });
        cancelled.push(`${cfg.id}:${stop.symbol}`);
      }
    }
  }

  return { recreated, cancelled, deduped, failed };
}

/** Crypto stops gebruiken stop_limit; equities gewone GTC stop. */
export function brokerStopIsCrypto(symbol: string): boolean {
  return isCryptoSymbol(symbol);
}
