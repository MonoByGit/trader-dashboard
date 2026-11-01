import type { Fill } from './live';

export type OpenStopOrder = {
  symbol: string;
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

export interface MomentumBroker {
  marketOrder(o: MarketOrderRequest): Promise<Fill | null>;
  setStop(o: SetStopRequest): Promise<void>;
  cancelStop(o: CancelStopRequest): Promise<void>;
  stopFill(o: { versionId: string; symbol: string; since: string; stopClientPrefix: string }): Promise<Fill | null>;
  listOpenStops(o: { stopClientPrefix: string }): Promise<OpenStopOrder[]>;
  /** Actuele broker-qty voor symbool (paper); null = onbekend → boek gebruiken. */
  positionQty?(o: { symbol: string }): Promise<number | null>;
}

export type { Fill };
