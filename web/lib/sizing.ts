// Volatility-targeting position sizing with a fractional-Kelly upper bound.
//
// Idee in mensentaal: in plaats van altijd een vast percentage in te zetten,
// rekenen we per symbool uit hoe beweeglijk het is. Een rustig fonds mag een
// grotere positie krijgen, een wild fonds een kleinere, zodat elke trade
// ongeveer evenveel risico draagt. Daarbovenop ligt een harde bovengrens
// (de strategie-cap van 25 procent en een fractionele Kelly-limiet) en de
// cash-bodem van 10 procent. We loggen altijd welke grens uiteindelijk bond,
// zodat Dusty kan meelezen waarom een positie zo groot werd als hij werd.
//
// Pure functies, geen side effects: makkelijk te testen los van de bot.

const TARGET_VOL = 0.12; // gewenste jaarlijkse portfolio-volatiliteit (12%)
const TRADING_DAYS = 252;
const BASE_CAP = 0.25; // strategie-basis: 25% van equity per trade als bovengrens
const MAX_PER_SYMBOL = 0.30; // nooit meer dan 30% van equity in één symbool
const CASH_FLOOR = 0.10; // houd minstens 10% cash aan
const KELLY_FRACTION = 0.25; // 1/4 Kelly
const KELLY_MIN_SAMPLE = 10; // minimaal aantal gesloten trades voor een zinnige Kelly

export type SizingBinding =
  | 'vol-target'
  | 'kelly'
  | 'base-cap'
  | 'cash-floor'
  | 'insufficient-data'
  | 'no-shares';

export interface SizingInputs {
  symbol: string;
  closes: number[]; // dagelijkse slotkoersen, oud -> nieuw (>= 21 voor 20-daagse vol)
  price: number; // huidige/laatste prijs voor omrekening naar shares
  equity: number; // totale portfolio-equity
  availableCash: number; // vrije cash
}

export interface KellyStats {
  winRate: number; // 0..1
  avgWin: number; // gemiddelde winst per winnende trade (absoluut, > 0)
  avgLoss: number; // gemiddeld verlies per verliezende trade (absoluut, > 0)
  sampleSize: number; // aantal gesloten trades
}

export interface SizingResult {
  symbol: string;
  shares: number;
  notional: number; // shares * price
  weight: number; // uiteindelijk gewicht t.o.v. equity
  volAnnual: number | null; // jaarlijkse gerealiseerde vol (20d), null bij te weinig data
  volTargetWeight: number | null;
  kellyCap: number | null;
  binding: SizingBinding; // welke grens bond uiteindelijk
  note: string; // mensentaal-uitleg voor de decision log
}

/** Jaarlijkse gerealiseerde volatiliteit uit dagelijkse log-returns over `lookback` dagen. */
export function realizedVolAnnual(closes: number[], lookback = 20): number | null {
  if (!closes || closes.length < lookback + 1) return null;
  const recent = closes.slice(-(lookback + 1));
  const rets: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    if (recent[i - 1] <= 0 || recent[i] <= 0) return null;
    rets.push(Math.log(recent[i] / recent[i - 1]));
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  const daily = Math.sqrt(variance);
  return daily * Math.sqrt(TRADING_DAYS);
}

/** Fractionele (1/4) Kelly op basis van win rate en win/verlies-verhouding. Null bij te weinig data. */
export function kellyCapWeight(s?: KellyStats): number | null {
  if (!s || s.sampleSize < KELLY_MIN_SAMPLE || s.avgLoss <= 0 || s.avgWin <= 0) return null;
  const b = s.avgWin / s.avgLoss; // payoff-ratio
  const full = s.winRate - (1 - s.winRate) / b; // volledige Kelly-fractie
  if (full <= 0) return 0; // geen edge -> Kelly zegt: niet instappen
  return Math.min(KELLY_FRACTION * full, BASE_CAP);
}

/**
 * Bereken de positiegrootte. Neemt de kleinste van: vol-target gewicht,
 * Kelly-cap (indien beschikbaar) en de basis-cap. Clamp daarna op de cash-bodem.
 */
export function computePositionSize(inp: SizingInputs, kelly?: KellyStats): SizingResult {
  const { symbol, closes, price, equity, availableCash } = inp;
  const volAnnual = realizedVolAnnual(closes);
  const volTargetWeight = volAnnual && volAnnual > 0 ? TARGET_VOL / volAnnual : null;
  const kellyCap = kellyCapWeight(kelly);

  // Kandidaat-gewichten verzamelen; de kleinste wint. Basis-cap staat er altijd in.
  const candidates: Array<{ w: number; tag: SizingBinding }> = [{ w: BASE_CAP, tag: 'base-cap' }];
  if (volTargetWeight != null) candidates.push({ w: Math.min(volTargetWeight, MAX_PER_SYMBOL), tag: 'vol-target' });
  if (kellyCap != null) candidates.push({ w: kellyCap, tag: 'kelly' });

  let chosen = candidates[0];
  for (const c of candidates) if (c.w < chosen.w) chosen = c;

  let weight = chosen.w;
  let binding: SizingBinding = chosen.tag;

  if (volAnnual == null && kellyCap == null) {
    // Geen vol-data en geen Kelly: val terug op de basis-cap, maar markeer het.
    binding = 'insufficient-data';
  }

  // Notional vanuit equity, daarna clampen op beschikbare cash en de cash-bodem.
  let notional = equity * weight;
  const maxByCash = availableCash - equity * CASH_FLOOR; // wat we mogen uitgeven zonder de bodem te raken
  if (notional > maxByCash) {
    notional = Math.max(0, maxByCash);
    weight = equity > 0 ? notional / equity : 0;
    binding = 'cash-floor';
  }

  const shares = price > 0 ? Math.floor(notional / price) : 0;
  if (shares <= 0) {
    return {
      symbol, shares: 0, notional: 0, weight: 0, volAnnual, volTargetWeight, kellyCap,
      binding: 'no-shares',
      note: 'Geen positie: na alle grenzen bleef er te weinig over voor minstens 1 aandeel.',
    };
  }

  const finalNotional = +(shares * price).toFixed(2);
  return {
    symbol,
    shares,
    notional: finalNotional,
    weight: +(equity > 0 ? finalNotional / equity : 0).toFixed(4),
    volAnnual: volAnnual != null ? +volAnnual.toFixed(4) : null,
    volTargetWeight: volTargetWeight != null ? +volTargetWeight.toFixed(4) : null,
    kellyCap: kellyCap != null ? +kellyCap.toFixed(4) : null,
    binding,
    note: explain(symbol, shares, finalNotional, weight, volAnnual, binding),
  };
}

function explain(symbol: string, shares: number, notional: number, weight: number, volAnnual: number | null, binding: SizingBinding): string {
  const pct = (weight * 100).toFixed(1);
  const vol = volAnnual != null ? `${(volAnnual * 100).toFixed(0)}% jaar-vol` : 'vol onbekend';
  switch (binding) {
    case 'vol-target':
      return `${shares}x ${symbol} ($${notional}, ${pct}% van equity). Vol-target bond: ${symbol} is beweeglijk (${vol}), dus kleinere positie zodat het risico vergelijkbaar blijft.`;
    case 'kelly':
      return `${shares}x ${symbol} ($${notional}, ${pct}% van equity). Kelly-limiet bond: op basis van de recente trefkans is dit de verstandige maximale inzet.`;
    case 'base-cap':
      return `${shares}x ${symbol} ($${notional}, ${pct}% van equity). Basis-cap bond: ${symbol} is rustig genoeg (${vol}), dus de standaard 25%-grens is leidend.`;
    case 'cash-floor':
      return `${shares}x ${symbol} ($${notional}, ${pct}% van equity). Cash-bodem bond: ingeperkt om minstens 10% cash aan te houden.`;
    case 'insufficient-data':
      return `${shares}x ${symbol} ($${notional}, ${pct}% van equity). Nog te weinig historie voor vol- of Kelly-berekening, dus voorzichtig op de basis-cap gesized.`;
    default:
      return `${shares}x ${symbol} ($${notional}, ${pct}% van equity).`;
  }
}
