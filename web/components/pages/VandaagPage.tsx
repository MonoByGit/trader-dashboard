'use client';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { fmt } from '@/lib/format';

type Status = 'echt' | 'papier' | 'schaduw' | 'uit' | 'geblokkeerd';
interface Home {
  gelezenOp: string;
  portfolio: { equity: number | null; cash: number | null; dayPnl: number | null; dayPnlPct: number | null; marketOpen: boolean | null; fout: string | null };
  strategieen: Array<{
    id: string; naam: string; status: Status; reden: string;
    laatsteRun: { routine: string; status: string; dag: string; wanneer: string | null } | null;
  }>;
  recent: Array<{ ts: string; symbool: string; besluit: string; reden: string; routine: string | null }>;
  motor: { laatsteTick: string | null; minutenGeleden: number | null; gezond: boolean; fouten: number; melding: string };
  bronfouten: string[];
}

const AMS = 'Europe/Amsterdam';
const tijd = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('nl-NL', { timeZone: AMS, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

const STATUS_LABEL: Record<Status, string> = { echt: 'PAPIER', papier: 'PAPIER', schaduw: 'SCHADUW', uit: 'UIT', geblokkeerd: 'GEBLOKKEERD' };
const STATUS_KIND: Record<Status, 'pos' | 'accent' | 'muted' | 'neg'> = { echt: 'pos', papier: 'pos', schaduw: 'accent', uit: 'muted', geblokkeerd: 'neg' };

export function VandaagPage() {
  const [home, setHome] = useState<Home | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch('/api/home', { cache: 'no-store' })
        .then(async (r) => {
          const j = await r.json();
          if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
          if (alive) { setHome(j as Home); setFout(null); }
        })
        .catch((e) => { if (alive) setFout(String(e instanceof Error ? e.message : e)); });
    void load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const p = home?.portfolio;
  const pos = (p?.dayPnl ?? 0) >= 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Vandaag</h1>
          <div className="subtitle text-secondary">
            Alleen kijken, niets starten. Papiergeld. {home ? `Gelezen om ${tijd(home.gelezenOp)} (Amsterdam).` : 'Bezig met lezen…'}
          </div>
        </div>
      </div>

      {fout && (
        <div className="card" style={{ marginBottom: 12, borderColor: 'var(--neg)' }}>
          <div className="card-body" style={{ fontSize: 12 }}><Icon name="x" size={11} className="text-neg"/> Kon het overzicht niet laden: {fout}</div>
        </div>
      )}
      {home?.bronfouten?.length ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-body text-secondary" style={{ fontSize: 11 }}>Niet alles gelezen: {home.bronfouten.join(' · ')}</div>
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-head"><h3><Icon name="dashboard" size={12}/> Portfolio en dagresultaat</h3></div>
        <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14 }}>
          {p?.fout ? (
            <div className="text-neg" style={{ fontSize: 12 }}>Account niet gelezen: {p.fout}</div>
          ) : (
            <>
              <div><div className="text-tertiary" style={{ fontSize: 10 }}>Waarde</div><div className="mono" style={{ fontSize: 20 }}>{fmt.usd(p?.equity)}</div></div>
              <div><div className="text-tertiary" style={{ fontSize: 10 }}>Cash</div><div className="mono" style={{ fontSize: 20 }}>{fmt.usd(p?.cash)}</div></div>
              <div>
                <div className="text-tertiary" style={{ fontSize: 10 }}>Resultaat vandaag</div>
                <div className={`mono ${pos ? 'text-pos' : 'text-neg'}`} style={{ fontSize: 20 }}>
                  {fmt.signedUsd(p?.dayPnl)} <span style={{ fontSize: 12 }}>({fmt.pct((p?.dayPnlPct ?? 0) * 100)})</span>
                </div>
              </div>
              <div><div className="text-tertiary" style={{ fontSize: 10 }}>Beurs</div><div style={{ fontSize: 14, marginTop: 4 }}>{p?.marketOpen == null ? '—' : p.marketOpen ? 'Open' : 'Dicht'}</div></div>
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-head"><h3><Icon name="strategy" size={12}/> Strategieën</h3></div>
        <div className="card-body flush">
          <table className="data">
            <thead><tr><th>Strategie</th><th>Status</th><th>Waarom</th><th>Laatste run</th></tr></thead>
            <tbody>
              {home?.strategieen.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontSize: 12, fontWeight: 500 }}>{s.naam}</td>
                  <td><Pill kind={STATUS_KIND[s.status]} dot>{STATUS_LABEL[s.status]}</Pill></td>
                  <td className="text-secondary" style={{ fontSize: 11 }}>{s.reden}</td>
                  <td className="mono text-secondary" style={{ fontSize: 10 }}>
                    {s.laatsteRun ? `${s.laatsteRun.routine} · ${s.laatsteRun.status} · ${tijd(s.laatsteRun.wanneer)}` : 'nog niet gedraaid'}
                  </td>
                </tr>
              ))}
              {!home && <tr><td colSpan={4} className="text-tertiary" style={{ fontSize: 11 }}>Bezig met lezen…</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3><Icon name="log" size={12}/> Laatste signalen en trades</h3></div>
          <div className="card-body flush">
            <table className="data">
              <thead><tr><th>Wanneer</th><th>Symbool</th><th>Besluit</th><th>Reden</th></tr></thead>
              <tbody>
                {home?.recent.length ? home.recent.map((d, i) => (
                  <tr key={i}>
                    <td className="mono text-secondary" style={{ fontSize: 10 }}>{tijd(d.ts)}</td>
                    <td className="sym">{d.symbool}</td>
                    <td style={{ fontSize: 11 }}>{d.besluit}</td>
                    <td className="text-secondary" style={{ fontSize: 11 }}>{d.reden}</td>
                  </tr>
                )) : <tr><td colSpan={4} className="text-tertiary" style={{ fontSize: 11 }}>{home ? 'Nog geen besluiten vastgelegd.' : 'Bezig met lezen…'}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3><Icon name="routines" size={12}/> De motor</h3></div>
          <div className="card-body" style={{ fontSize: 12 }}>
            {home ? (
              <>
                <div style={{ marginBottom: 8 }}><Pill kind={home.motor.gezond ? 'pos' : 'neg'} dot>{home.motor.gezond ? 'LOOPT' : 'AANDACHT'}</Pill></div>
                <div>{home.motor.melding}</div>
                <div className="text-tertiary" style={{ marginTop: 6, fontSize: 11 }}>Laatste tick: {tijd(home.motor.laatsteTick)} (Amsterdam)</div>
              </>
            ) : <div className="text-tertiary">Bezig met lezen…</div>}
          </div>
        </div>
      </div>
    </>
  );
}
