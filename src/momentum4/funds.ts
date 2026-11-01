/** Kleine set bekende, langdurige 13F-filers (CIK zonder leading zeros in config). */
export interface M4Fund {
  cik: string;
  label: string;
}

export const M4_13F_FUNDS: M4Fund[] = [
  { cik: '1067983', label: 'Berkshire Hathaway' },
  { cik: '1336528', label: 'Pershing Square' },
  { cik: '1536411', label: 'Duquesne Family Office' },
  { cik: '1040273', label: 'Third Point' },
];

export function padCik(cik: string): string {
  return cik.replace(/\D/g, '').padStart(10, '0');
}
