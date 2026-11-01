'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { fmt } from '@/lib/format';

interface AiCallRow {
  id: string;
  ts: string;
  routine: string | null;
  provider: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  finish_reason: string | null;
  cost_usd: number;
  asset_class: string | null;
}

interface DayTotal {
  day: string;
  etf_usd: number;
  crypto_usd: number;
  cost_usd: number;
}

interface WeekTotal {
  week_start: string;
  etf_usd: number;
  crypto_usd: number;
  cost_usd: number;
}

interface AiCostsPayload {
  todayUsd: number;
  todayByClass: { etf: number; crypto: number };
  weekUsd: number;
  weekByClass: { etf: number; crypto: number };
  rows: AiCallRow[];
  byDay: DayTotal[];
  byWeek: WeekTotal[];
}

function assetLabel(ac: string | null): string {
  if (ac === 'crypto') return 'Crypto';
  return 'ETF';
}

function finishLabel(reason: string | null): string {
  if (!reason) return '—';
  return reason;
}

export function AiCostsPage() {
  const [data, setData] = useState<AiCostsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/ai-costs')
      .then(r => r.json())
      .then((d: AiCostsPayload) => {
        setData(d);
        setError(null);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const rows = data?.rows ?? [];
  const byDay = data?.byDay ?? [];
  const byWeek = data?.byWeek ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>AI-kosten</h1>
          <div className="subtitle text-secondary">
            LLM-aanroepen per routine — tokens, provider en kosten (paper, geen live trading).
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label"><Icon name="zap" size={12}/> Vandaag (totaal)</div>
          <div className="kpi-value">{loading ? '…' : fmt.usd(data?.todayUsd ?? 0, 4)}</div>
          <div className="kpi-delta neutral">ET · kalenderdag</div>
        </div>
        <div className="kpi">
          <div className="kpi-label"><Icon name="positions" size={12}/> Vandaag · ETF</div>
          <div className="kpi-value">{loading ? '…' : fmt.usd(data?.todayByClass?.etf ?? 0, 4)}</div>
          <div className="kpi-delta neutral">Equity routines</div>
        </div>
        <div className="kpi">
          <div className="kpi-label"><Icon name="bolt" size={12}/> Vandaag · crypto</div>
          <div className="kpi-value">{loading ? '…' : fmt.usd(data?.todayByClass?.crypto ?? 0, 4)}</div>
          <div className="kpi-delta neutral">24/7 scan</div>
        </div>
        <div className="kpi">
          <div className="kpi-label"><Icon name="clock" size={12}/> Deze week</div>
          <div className="kpi-value">{loading ? '…' : fmt.usd(data?.weekUsd ?? 0, 4)}</div>
          <div className="kpi-delta neutral">
            ETF {fmt.usd(data?.weekByClass?.etf ?? 0, 4)} · crypto {fmt.usd(data?.weekByClass?.crypto ?? 0, 4)}
          </div>
        </div>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-body text-neg" style={{ fontSize: 12 }}>{error}</div>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h3><Icon name="log" size={12}/> AI-aanroepen <span className="text-tertiary mono" style={{ fontSize: 10 }}>{rows.length} recent</span></h3>
        </div>
        <div className="card-body flush">
          <table className="data">
            <thead>
              <tr>
                <th>Tijd</th>
                <th>Provider</th>
                <th>Model</th>
                <th>Routine</th>
                <th>Klasse</th>
                <th className="num">Prompt tok.</th>
                <th className="num">Completion tok.</th>
                <th className="num">Kosten</th>
                <th>Finish</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)' }}>Laden…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                    <Icon name="zap" size={32}/>
                    <div style={{ marginTop: 10, fontSize: 12 }}>Nog geen AI-aanroepen gelogd.</div>
                  </td>
                </tr>
              )}
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="mono text-tertiary" style={{ fontSize: 10 }}>
                    {new Date(r.ts).toLocaleString('nl-NL', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </td>
                  <td style={{ fontSize: 11 }}>{r.provider}</td>
                  <td className="mono text-secondary" style={{ fontSize: 10 }}>{r.model}</td>
                  <td className="text-secondary" style={{ fontSize: 10 }}>{r.routine ?? '—'}</td>
                  <td>
                    <Pill kind={r.asset_class === 'crypto' ? 'accent' : 'muted'}>{assetLabel(r.asset_class)}</Pill>
                  </td>
                  <td className="num mono">{r.input_tokens ?? '—'}</td>
                  <td className="num mono">{r.output_tokens ?? '—'}</td>
                  <td className="num mono">{fmt.usd(r.cost_usd, 4)}</td>
                  <td className="text-tertiary" style={{ fontSize: 10 }}>{finishLabel(r.finish_reason)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3><Icon name="history" size={12}/> Per dag (ETF vs crypto)</h3></div>
          <div className="card-body flush">
            <table className="data">
              <thead>
                <tr><th>Dag</th><th className="num">ETF</th><th className="num">Crypto</th><th className="num">Totaal</th></tr>
              </thead>
              <tbody>
                {byDay.slice(0, 14).map(d => (
                  <tr key={d.day}>
                    <td className="mono">{d.day}</td>
                    <td className="num mono">{fmt.usd(d.etf_usd, 4)}</td>
                    <td className="num mono">{fmt.usd(d.crypto_usd, 4)}</td>
                    <td className="num mono">{fmt.usd(d.cost_usd, 4)}</td>
                  </tr>
                ))}
                {!loading && byDay.length === 0 && (
                  <tr><td colSpan={4} className="text-tertiary" style={{ padding: 24, textAlign: 'center' }}>Geen data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3><Icon name="routines" size={12}/> Per week (ETF vs crypto)</h3></div>
          <div className="card-body flush">
            <table className="data">
              <thead>
                <tr><th>Week (maandag)</th><th className="num">ETF</th><th className="num">Crypto</th><th className="num">Totaal</th></tr>
              </thead>
              <tbody>
                {byWeek.slice(0, 12).map(w => (
                  <tr key={w.week_start}>
                    <td className="mono">{w.week_start}</td>
                    <td className="num mono">{fmt.usd(w.etf_usd, 4)}</td>
                    <td className="num mono">{fmt.usd(w.crypto_usd, 4)}</td>
                    <td className="num mono">{fmt.usd(w.cost_usd, 4)}</td>
                  </tr>
                ))}
                {!loading && byWeek.length === 0 && (
                  <tr><td colSpan={4} className="text-tertiary" style={{ padding: 24, textAlign: 'center' }}>Geen data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
