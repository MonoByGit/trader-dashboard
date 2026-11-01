import type { Holding, HoldingsSnapshot } from './holdings';
import { padCik } from './funds';

export const EDGAR_USER_AGENT = 'MonoTrader studio@monobydusty.com';

export interface EdgarFetchOptions {
  userAgent?: string;
  /** Minimale pauze tussen requests (ms). SEC: max 10/s; wij houden ruim marge. */
  minIntervalMs?: number;
  fetchImpl?: typeof fetch;
  /** Disk/memory cache: key → body. */
  cache?: Map<string, string>;
}

export interface Filing13F {
  accessionNumber: string;
  form: string;
  filingDate: string;
  reportDate: string;
}

export interface CusipResolver {
  resolve(cusip: string): Promise<string | null>;
}

let lastFetchAt = 0;

async function edgarGet(url: string, opt: EdgarFetchOptions): Promise<string> {
  const cache = opt.cache;
  if (cache?.has(url)) return cache.get(url)!;
  const fetchFn = opt.fetchImpl ?? fetch;
  const minMs = opt.minIntervalMs ?? 120;
  const wait = Math.max(0, minMs - (Date.now() - lastFetchAt));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastFetchAt = Date.now();
  let res: Response | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    res = await fetchFn(url, {
      headers: {
        'User-Agent': opt.userAgent ?? EDGAR_USER_AGENT,
        'Accept-Encoding': 'gzip, deflate',
      },
    });
    if (res.ok) break;
    if (res.status !== 503) break;
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  if (!res!.ok) throw new Error(`EDGAR ${res!.status}: ${url}`);
  const text = await res.text();
  cache?.set(url, text);
  return text;
}

/** Lijst 13F-HR filings voor een CIK (recent + oudere submission-bestanden indien aanwezig). */
export async function list13FFilings(cik: string, opt: EdgarFetchOptions = {}): Promise<Filing13F[]> {
  const padded = padCik(cik);
  const url = `https://data.sec.gov/submissions/CIK${padded}.json`;
  const raw = await edgarGet(url, opt);
  const data = JSON.parse(raw) as {
    filings: {
      recent: Record<string, string[]>;
      files?: Array<{ name: string; filingCount: number }>;
    };
  };
  const out: Filing13F[] = [];
  const pushRecent = (block: Record<string, string[]>) => {
    const forms = block.form ?? [];
    for (let i = 0; i < forms.length; i++) {
      const form = forms[i]!;
      if (!form.startsWith('13F')) continue;
      out.push({
        accessionNumber: block.accessionNumber![i]!,
        form,
        filingDate: block.filingDate![i]!,
        reportDate: block.reportDate![i] ?? '',
      });
    }
  };
  pushRecent(data.filings.recent);
  for (const f of data.filings.files ?? []) {
    const partUrl = `https://data.sec.gov/submissions/${f.name}`;
    const partRaw = await edgarGet(partUrl, opt);
    const part = JSON.parse(partRaw) as Record<string, unknown>;
    if (part.filings && typeof part.filings === 'object') {
      pushRecent((part.filings as { recent: Record<string, string[]> }).recent);
    } else if (Array.isArray(part.form)) {
      pushRecent(part as Record<string, string[]>);
    }
  }
  return out;
}

/** Per rapportperiode: houd de laatste filing (incl. amendementen). */
export function dedupe13FByReport(filings: Filing13F[]): Filing13F[] {
  const byReport = new Map<string, Filing13F>();
  for (const f of filings) {
    if (!f.reportDate) continue;
    if (!f.form.startsWith('13F')) continue;
    const key = f.reportDate;
    const prev = byReport.get(key);
    if (!prev || f.filingDate > prev.filingDate) byReport.set(key, f);
  }
  return [...byReport.values()].sort((a, b) => a.filingDate.localeCompare(b.filingDate));
}

const tag = (xml: string, name: string) => {
  const re = new RegExp(`<(?:\\w+:)?${name}[^>]*>([^<]*)</(?:\\w+:)?${name}>`, 'i');
  const m = xml.match(re);
  return m?.[1]?.trim() ?? '';
};

/** Parse 13F informationTable XML; aggregeert per CUSIP. */
export function parse13FInfoTableXml(xml: string): Array<{ cusip: string; shares: number; valueUsd: number }> {
  const rows = xml.split(/<\/infoTable>/i).slice(0, -1);
  const byCusip = new Map<string, { shares: number; valueUsd: number }>();
  for (const chunk of rows) {
    if (!/<infoTable>/i.test(chunk)) continue;
    const cusip = tag(chunk, 'cusip');
    if (!cusip || cusip.length < 8) continue;
    const shType = tag(chunk, 'sshPrnamtType');
    if (shType && shType !== 'SH') continue;
    const shares = Number(tag(chunk, 'sshPrnamt').replace(/,/g, '')) || 0;
    const valueUsd = Number(tag(chunk, 'value').replace(/,/g, '')) || 0;
    const cur = byCusip.get(cusip) ?? { shares: 0, valueUsd: 0 };
    cur.shares += shares;
    cur.valueUsd += valueUsd;
    byCusip.set(cusip, cur);
  }
  return [...byCusip.entries()].map(([cusip, v]) => ({ cusip, ...v }));
}

function accessionPath(cik: string, accession: string): string {
  const num = cik.replace(/\D/g, '');
  const nodash = accession.replace(/-/g, '');
  return `https://www.sec.gov/Archives/edgar/data/${num}/${nodash}`;
}

async function findInfoTableUrl(cik: string, accession: string, opt: EdgarFetchOptions): Promise<string> {
  const base = accessionPath(cik, accession);
  const index = JSON.parse(await edgarGet(`${base}/index.json`, opt)) as {
    directory: { item: Array<{ name: string; size?: string }> };
  };
  const items = index.directory?.item ?? [];
  const info = items.find((x) => /infotable/i.test(x.name));
  if (info) return `${base}/${info.name}`;
  const xmls = items.filter((x) => x.name.endsWith('.xml') && !/primary_doc/i.test(x.name));
  xmls.sort((a, b) => Number(b.size ?? 0) - Number(a.size ?? 0));
  if (!xmls[0]) throw new Error(`Geen 13F infotable in ${accession}`);
  return `${base}/${xmls[0]!.name}`;
}

export async function fetch13FHoldings(
  cik: string,
  filing: Filing13F,
  resolver: CusipResolver,
  opt: EdgarFetchOptions = {},
): Promise<HoldingsSnapshot> {
  const infoUrl = await findInfoTableUrl(cik, filing.accessionNumber, opt);
  const xml = await edgarGet(infoUrl, opt);
  const raw = parse13FInfoTableXml(xml);
  const totalValue = raw.reduce((s, r) => s + r.valueUsd, 0) || 1;
  const holdings: Holding[] = [];
  for (const row of raw) {
    const symbol = await resolver.resolve(row.cusip);
    if (!symbol) continue;
    if (!/^[A-Z]{1,5}$/.test(symbol)) continue;
    holdings.push({
      symbol,
      shares: row.shares,
      weightPct: (row.valueUsd / totalValue) * 100,
    });
  }
  holdings.sort((a, b) => b.weightPct - a.weightPct);
  return {
    asOf: filing.reportDate,
    filedAt: filing.filingDate,
    fund: cik,
    cik,
    holdings,
  };
}

/** OpenFIGI (gratis) alleen voor CUSIP→ticker; geen handelsbron. Resultaat gecached. */
export function openFigiResolver(cache: Map<string, string | null>, opt: EdgarFetchOptions = {}): CusipResolver {
  const fetchFn = opt.fetchImpl ?? fetch;
  return {
    async resolve(cusip: string) {
      const key = cusip.toUpperCase();
      if (cache.has(key)) return cache.get(key)!;
      const minMs = opt.minIntervalMs ?? 120;
      const wait = Math.max(0, minMs - (Date.now() - lastFetchAt));
      if (wait) await new Promise((r) => setTimeout(r, wait));
      lastFetchAt = Date.now();
      const res = await fetchFn('https://api.openfigi.com/v3/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ idType: 'ID_CUSIP', idValue: key }]),
      });
      if (!res.ok) {
        cache.set(key, null);
        return null;
      }
      const data = (await res.json()) as Array<{ data?: Array<{ ticker?: string; exchCode?: string; marketSector?: string }> }>;
      const row = data[0]?.data?.find((d) => d.marketSector === 'Equity' && d.exchCode === 'US' && d.ticker);
      const ticker = row?.ticker?.toUpperCase() ?? null;
      cache.set(key, ticker);
      return ticker;
    },
  };
}

/** Vaste resolver voor tests (CUSIP of symbol → ticker). */
export function staticCusipResolver(map: Record<string, string>): CusipResolver {
  return {
    async resolve(cusip: string) {
      return map[cusip.toUpperCase()] ?? map[cusip] ?? null;
    },
  };
}
