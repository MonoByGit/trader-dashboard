import type { Fill } from './live';

export type OpenStopOrder = {
  symbol: string;
  /** Resterende (nog niet gevulde) qty van de stop. */
  qty: number;
  stopPrice: number;
  clientOrderId: string;
  orderId?: string;
};

export type MarketOrderRequest = {
  versionId: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  clientOrderId: string;
};

export type SetStopRequest = {
  versionId: string;
  symbol: string;
  qty: number;
  stopPrice: number;
  stopClientPrefix: string;
};

export type CancelStopRequest = {
  versionId: string;
  symbol: string;
  stopClientPrefix?: string;
  /** Annuleer één order (reconcile dedupe); anders alle stops voor prefix+symbool. */
  orderId?: string;
};

/**
 * Uitkomst van een stop-annulering:
 *  - none      er stond geen stop
 *  - canceled  alle stops bevestigd geannuleerd (stukken weer vrij)
 *  - filled    een stop is (deels) gevuld tijdens het annuleren
 *  - failed / timeout  niet bevestigd; de stukken kunnen nog vastzitten
 */
export type CancelStopOutcome = 'none' | 'canceled' | 'filled' | 'failed' | 'timeout';

export interface MomentumBroker {
  /** Market order. `done` = order is terminaal (filled/canceled); anders kan er nog meer vullen. */
  marketOrder(o: MarketOrderRequest): Promise<Fill | null>;
  setStop(o: SetStopRequest): Promise<void>;
  /** Oude brokers gaven void terug; dat telt als 'canceled'. */
  cancelStop(o: CancelStopRequest): Promise<CancelStopOutcome | void>;
  /** Laatste stop-fill sinds `since` (cumulatieve filled_qty van die order). */
  stopFill(o: { versionId: string; symbol: string; since: string; stopClientPrefix: string }): Promise<Fill | null>;
  /** Alle stop-orders met een fill sinds `since` (cumulatieve filled_qty per order). Valt terug op stopFill. */
  stopFills?(o: { versionId: string; symbol: string; since: string; stopClientPrefix: string }): Promise<Fill[]>;
  /** Huidige cumulatieve fill van een eerder geplaatste order (voor partial fills). */
  orderFill?(o: { orderId: string }): Promise<Fill | null>;
  listOpenStops(o: { stopClientPrefix: string }): Promise<OpenStopOrder[]>;
  /**
   * Account-brede broker-qty voor het symbool (Alpaca `qty`, NIET `qty_available`:
   * een open sell, ook de eigen stop, reserveert stukken). null = onbekend.
   */
  positionQty?(o: { symbol: string }): Promise<number | null>;
}

export type { Fill };
