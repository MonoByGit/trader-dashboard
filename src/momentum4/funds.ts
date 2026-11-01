/** 13F-filer metadata (CIK zonder leading zeros). */
export interface M4Fund {
  cik: string;
  label: string;
  /** Korte motivatie voor backtest-selectie (publiek 13F, long-only karakter). */
  rationale: string;
}

export const M4_BERKSHIRE: M4Fund = {
  cik: '1067983',
  label: 'Berkshire Hathaway',
  rationale: 'Decennialange compounder; zeer lage turnover in kernposities; 13F sinds de jaren 80.',
};

/**
 * Mandje long-only managers met publieke 13F, lange track record en relatief lage turnover
 * (geen activist/event macro zoals Third Point / Duquesne).
 */
export const M4_BASKET_LOW_TURNOVER: M4Fund[] = [
  M4_BERKSHIRE,
  {
    cik: '1061768',
    label: 'Baupost Group (Klarman)',
    rationale: 'Value/credit-achtergrond; 13F-equities langdurig; weinig namen, infrequente grote wijzigingen.',
  },
  {
    cik: '1027796',
    label: 'Gardner Russo & Quinn',
    rationale: 'Geconcentreerde quality; typisch tientallen posities; lange holding periods.',
  },
  {
    cik: '1045807',
    label: 'Yacktman Asset Management',
    rationale: 'Patient long-only US large-cap; lage turnover t.o.v. hedge funds.',
  },
  {
    cik: '1103804',
    label: 'Wedgewood Partners',
    rationale: 'Geconcentreerd groei/value; beperkt aantal namen per 13F.',
  },
  {
    cik: '1093429',
    label: 'Davis Selected Advisers',
    rationale: 'Long-term equity manager; 13F als venster op duurzame posities.',
  },
  {
    cik: '943556',
    label: 'Torray LLC',
    rationale: 'Long-only equity sinds jaren 80; beperkte 13F-universe, lage handelsfrequentie.',
  },
];

/** Legacy lijst (live refresh API): breder, incl. activist — niet voor low-turnover backtest. */
export const M4_13F_FUNDS: M4Fund[] = [
  M4_BERKSHIRE,
  { cik: '1336528', label: 'Pershing Square', rationale: 'Geconcentreerd activist; hogere turnover.' },
  { cik: '1536411', label: 'Duquesne Family Office', rationale: 'Macro overlay; kortere holding periods.' },
  { cik: '1040273', label: 'Third Point', rationale: 'Event-driven; niet low-turnover.' },
];

export function padCik(cik: string): string {
  return cik.replace(/\D/g, '').padStart(10, '0');
}

export function fundsByCiks(ciks: string[]): M4Fund[] {
  const all = [...M4_BASKET_LOW_TURNOVER, ...M4_13F_FUNDS];
  const byCik = new Map(all.map((f) => [f.cik, f]));
  return ciks.map((c) => byCik.get(c) ?? { cik: c, label: c, rationale: '' });
}
