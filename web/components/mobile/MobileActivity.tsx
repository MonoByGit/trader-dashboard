'use client';

import { useState } from 'react';
import { fmt } from '@/lib/format';

export type MDecision = {
  id: string; ts: string; routine: string; symbol: string; decision: string;
  agentNote?: string; rationale?: string;
  criteria?: Record<string, string> | null;
  gates?: Record<string, string> | null;
  orderId?: string | null;
};

const FILTERS = [
  { id: 'all', label: 'Alles' },
  { id: 'BUY', label: 'Buy' },
  { id: 'HOLD', label: 'Hold' },
  { id: 'NO_GO', label: 'No-go' },
];

export function badgeClass(decision: string): string {
  if (decision === 'BUY') return 'buy';
  if (decision === 'SELL') return 'sell';
  if (decision === 'HOLD') return 'hold';
  if (decision === 'NO_GO') return 'nogo';
  return 'muted';
}

export function MobileActivity({ decisions, onOpenDecision }: {
  decisions: MDecision[];
  onOpenDecision: (d: MDecision) => void;
}) {
  const [filter, setFilter] = useState('all');
  const list = filter === 'all' ? decisions : decisions.filter(d => d.decision === filter);

  return (
    <>
      <div className="m-chips">
        {FILTERS.map(f => (
          <button key={f.id} className={`m-chip${filter === f.id ? ' active' : ''}`} onClick={() => setFilter(f.id)}>{f.label}</button>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="m-empty">Geen beslissingen in deze filter.</div>
      ) : (
        list.map(d => (
          <button key={d.id} className="m-row" onClick={() => onOpenDecision(d)}>
            <span className={`m-badge ${badgeClass(d.decision)}`}>{d.decision.replace('_', '-')}</span>
            <div className="m-row-main">
              <div className="m-row-sym" style={{ fontSize: 13 }}>{d.symbol}</div>
              <div className="m-row-sub two">{d.agentNote}</div>
            </div>
            <div className="m-row-end">
              <span className="small">{fmt.time(d.ts)}</span>
              <span className="small" style={{ textTransform: 'capitalize' }}>{d.routine}</span>
            </div>
          </button>
        ))
      )}
    </>
  );
}
