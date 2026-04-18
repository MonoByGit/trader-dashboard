export const ETF_META: Record<string, { name: string; sector: string }> = {
  QQQ:  { name: 'Nasdaq-100', sector: 'Tech / Growth' },
  SPY:  { name: 'S&P 500', sector: 'Broad Market' },
  IWM:  { name: 'Russell 2000', sector: 'Small Cap' },
  DIA:  { name: 'Dow Jones', sector: 'Broad Market' },
  XLF:  { name: 'Financial Select', sector: 'Financials' },
  XLE:  { name: 'Energy Select', sector: 'Energy' },
  XLK:  { name: 'Tech Select', sector: 'Technology' },
  XLV:  { name: 'Health Care Select', sector: 'Health Care' },
  XLI:  { name: 'Industrial Select', sector: 'Industrials' },
  XLY:  { name: 'Consumer Disc. Select', sector: 'Consumer Disc.' },
  XLU:  { name: 'Utilities Select', sector: 'Utilities' },
  XLB:  { name: 'Materials Select', sector: 'Materials' },
  XLRE: { name: 'Real Estate Select', sector: 'Real Estate' },
  XLC:  { name: 'Comm. Services Select', sector: 'Comm. Services' },
};

export function etfMeta(symbol: string) {
  return ETF_META[symbol] ?? { name: symbol, sector: 'ETF' };
}
