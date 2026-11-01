/** Shared Alpaca types (no runtime imports — safe for alpaca-bars without loading alpaca.ts). */
export interface AlpacaBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  vw: number;
}
