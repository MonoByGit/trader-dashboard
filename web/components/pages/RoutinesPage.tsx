'use client';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { readJson, runsFromResponse } from '@/lib/api-shapes';

interface Run { id: string; routine: string; trading_date: string; started_at: string; finished_at: string | null; status: string; skip_reason: string | null; duration_ms: number | null; error_message: string | null; }

const tijd = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

/** Alleen lezen: echte runs uit de database. Handmatig starten kan hier niet. */
export function RoutinesPage() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/runs?limit=60', { cache: 'no-store' })
      .then(async (r) => setRuns(runsFromResponse<Run>(await readJson(r))))
      .catch((e) => setFout(String(e instanceof Error ? e.message : e)));
  }, []);

  return (
    <>
      <div className="page-head"><div><h1>Routines</h1><div className="subtitle text-secondary">Echte runs van de scheduler, nieuwste eerst. Alleen kijken: routines worden niet met de hand gestart.</div></div></div>
      <div className="card">
        <div className="card-head"><h3><Icon name="routines" size={12}/> Laatste runs</h3></div>
        <div className="card-body flush">
          {fout && <div className="text-neg" style={{ padding: 12, fontSize: 12 }}>Kon de runs niet laden: {fout}</div>}
          <table className="data">
            <thead><tr><th>Routine</th><th>Handelsdag</th><th>Gestart (Amsterdam)</th><th>Status</th><th>Opmerking</th></tr></thead>
            <tbody>
              {runs?.map((r) => (
                <tr key={r.id}>
                  <td className="mono" style={{ fontSize: 11 }}>{r.routine}</td>
                  <td className="mono text-secondary" style={{ fontSize: 10 }}>{r.trading_date}</td>
                  <td className="mono text-secondary" style={{ fontSize: 10 }}>{tijd(r.started_at)}</td>
                  <td><Pill kind={r.status === 'ok' ? 'pos' : r.status === 'failed' ? 'neg' : r.status === 'running' ? 'accent' : 'muted'}>{r.status.toUpperCase()}</Pill></td>
                  <td className="text-secondary" style={{ fontSize: 11 }}>{r.error_message ?? r.skip_reason ?? ''}</td>
                </tr>
              ))}
              {runs && !runs.length && <tr><td colSpan={5} className="text-tertiary" style={{ fontSize: 11 }}>Nog geen runs.</td></tr>}
              {!runs && !fout && <tr><td colSpan={5} className="text-tertiary" style={{ fontSize: 11 }}>Bezig met lezen…</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
