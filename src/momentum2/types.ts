/**
 * Momentum 2 (ETF-rotatie). Pure types, geen I/O.
 * Alleen papiergeld: niets in deze map praat met een broker.
 */
export interface Bar {
  /** ISO datum of timestamp; de eerste 10 tekens zijn de handelsdatum. */
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface VersionConfig {
  id: string;
  label: string;
  /** Startbudget van deze versie in USD (virtuele sleeve op het ene papieraccount). */
  budgetUsd: number;
  universe: string[];
  /** Aantal ETF's in de rotatie. */
  topN: number;
  /** Momentum-lookback in handelsdagen (rendement close t t.o.v. close t-N). */
  lookbackDays: number;
  /** Trendfilter: alleen kopen boven dit voortschrijdend gemiddelde (200 dagen). */
  smaDays: number;
  /** Volatiliteitsvenster voor gewichten (dagelijkse rendementen). */
  volDays: number;
  /** Rebalance elke N handelsdagen (5 = wekelijks). */
  rebalanceEveryDays: number;
  /** Harde stop bij entry, percentage onder de instapprijs. */
  hardStopPct: number;
  /** Trailing stop, percentage onder het hoogste punt sinds instap. */
  trailingStopPct: number;
  /** Verliesgrens: bij equity onder budget * (1 - maxLossPct) gaat de versie dicht. */
  maxLossPct: number;
  /** Meebewegend budget: positiegrootte volgt de equity van de versie, niet het startbudget. */
  floatingBudget: boolean;
  /** Maximaal deel van de versie-equity dat belegd mag zijn (0..1). */
  maxGrossPct: number;
  /** Alleen herbalanceren als een positie meer dan dit deel afwijkt van het doel. */
  driftTolerance: number;
  /** DeepSeek mag nieuwe instappen vetoën (nooit iets toevoegen of verkopen). */
  vetoEnabled: boolean;
}

export interface Position {
  qty: number;
  entryPrice: number;
  entryDate: string;
  /** Hoogste koers sinds instap (intraday high). */
  highWater: number;
}

export interface EquityLogRow {
  date: string;
  equity: number;
  cash: number;
  exposure: number;
  /** SPY buy-and-hold geschaald naar het startbudget van de versie. */
  spyEquity: number;
  /** Verschil in procentpunten t.o.v. SPY sinds start. */
  excessVsSpyPct: number;
}

export interface TradeLogRow {
  date: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  reason: string;
  pnl?: number;
}

export interface VersionBook {
  versionId: string;
  startDate: string | null;
  startBudgetUsd: number;
  startSpyPrice: number | null;
  cash: number;
  positions: Record<string, Position>;
  peakEquity: number;
  /** true na het raken van de verliesgrens: geen nieuwe posities meer. */
  halted: boolean;
  haltReason: string | null;
  lastRebalanceIndex: number | null;
  /** true alleen als dit boek echte broker-posities beheert. Schaduwboeken zijn nooit echt. */
  real?: boolean;
  /** Laatste datum waarvoor decideDay draaide (idempotent per dag). */
  lastDecisionDate?: string;
}

export type OrderIntent = {
  symbol: string;
  side: 'buy' | 'sell';
  /** Doelbedrag in USD (buy) of volledige positie (sell, qty). */
  notionalUsd?: number;
  qty?: number;
  reason: string;
};

export interface VetoVerdict {
  veto: boolean;
  reason: string;
  /** Welk model en welke versie dit besluit nam (voor de besluitenlog). */
  model: string;
  modelVersion: string;
  /** true als de check niet kon draaien; de strategie staat dan, maar het is gelogd. */
  failedOpen?: boolean;
}

export interface VetoCandidate {
  symbol: string;
  momentum: number;
  weight: number;
  lastClose: number;
  sma: number;
}

export type VetoFn = (c: VetoCandidate) => Promise<VetoVerdict>;
