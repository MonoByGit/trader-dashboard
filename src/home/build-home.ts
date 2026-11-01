/**
 * Pure opbouw van /api/home (tab Vandaag). Geen IO: de route haalt de brondata op en geeft die hier door.
 * Vier blokken: portfolio, strategieën (status), laatste trades/signalen met reden, de motor.
 */
import { resolveMomentumPaperMode, resolveShadowMode } from '../momentum2/mode.js';

export type StrategyStatus = 'echt' | 'papier' | 'schaduw' | 'uit' | 'geblokkeerd';

export interface HomeStrategy {
  id: string;
  naam: string;
  status: StrategyStatus;
  reden: string;
  laatsteRun: { routine: string; status: string; dag: string; wanneer: string | null } | null;
}

export interface HomeInput {
  now: string;
  account: { equity: number; cash: number; dayPnl: number; dayPnlPct: number; marketOpen: boolean | null } | null;
  accountError?: string;
  guards: { tradingEnabled: boolean; emergencyStop: boolean; circuitBreakerTripped: boolean } | null;
  env: Record<string, string | undefined>;
  runs: Array<{ routine: string; status: string; trading_date: string; started_at: string | null; skip_reason: string | null }>;
  decisions: Array<{ ts: string; symbol: string; decision: string; rationale: string | null; routine: string | null }>;
  heartbeat: { at?: string; due?: string[]; errors?: number } | null;
}

const SHADOW: Array<{ id: string; naam: string; flag: string; routinePrefix: string; paper?: true }> = [
  { id: 'momentum2', naam: 'Momentum 2 · ETF-rotatie', flag: 'MOMENTUM2', routinePrefix: 'momentum2' },
  { id: 'momentum3', naam: 'Momentum 3 · agressief', flag: 'MOMENTUM3', routinePrefix: 'momentum3' },
  { id: 'momentum5', naam: 'Momentum 5 · Nasdaq-trend', flag: 'MOMENTUM5', routinePrefix: 'momentum5', paper: true },
  { id: 'momentum6', naam: 'Momentum 6 · BTC-breakout', flag: 'MOMENTUM6', routinePrefix: 'momentum6', paper: true },
];

/** Zelfde regels als de runners: M5/M6 mogen met DRY_RUN=0 naar Alpaca PAPER, M2/M3 nooit. */
function strategyStatus(env: HomeInput['env'], s: (typeof SHADOW)[number]): { status: StrategyStatus; reden: string } {
  if (s.paper) {
    const m = resolveMomentumPaperMode(env, s.flag);
    if (!m.run) return { status: 'uit', reden: m.reason };
    return m.shadow
      ? { status: 'schaduw', reden: 'Draait alleen in schaduw, geen orders' }
      : { status: 'papier', reden: 'Papierorders bij Alpaca (oefengeld, geen echt geld)' };
  }
  const m = resolveShadowMode(env, s.flag);
  if (m.run) return { status: 'schaduw', reden: 'Draait alleen in schaduw, geen orders' };
  return { status: env[`${s.flag}_ENABLED`] === '1' ? 'geblokkeerd' : 'uit', reden: m.reason };
}

function lastRun(runs: HomeInput['runs'], prefix: string): HomeStrategy['laatsteRun'] {
  const r = runs
    .filter((x) => x.routine.startsWith(prefix))
    .sort((a, b) => String(b.started_at ?? '').localeCompare(String(a.started_at ?? '')))[0];
  return r ? { routine: r.routine, status: r.status, dag: r.trading_date, wanneer: r.started_at } : null;
}

export function buildHome(i: HomeInput) {
  const g = i.guards;
  const m1Blok = g && (g.emergencyStop || !g.tradingEnabled || g.circuitBreakerTripped);
  const m1Reden = !g
    ? 'Guardstatus niet gelezen'
    : g.emergencyStop
      ? 'Noodstop actief'
      : g.circuitBreakerTripped
        ? 'Circuit breaker actief'
        : !g.tradingEnabled
          ? 'Handel staat uit'
          : 'Papierorders bij Alpaca';

  const strategies: HomeStrategy[] = [
    {
      id: 'm1',
      naam: 'Momentum 1 · ETF en crypto',
      status: m1Blok ? 'geblokkeerd' : g ? 'echt' : 'uit',
      reden: m1Reden,
      laatsteRun: lastRun(i.runs, 'market-open') ?? lastRun(i.runs, 'crypto'),
    },
    ...SHADOW.map((s): HomeStrategy => ({
      id: s.id,
      naam: s.naam,
      ...strategyStatus(i.env, s),
      laatsteRun: lastRun(i.runs, s.routinePrefix),
    })),
  ];

  const hb = i.heartbeat;
  const ageMin = hb?.at ? Math.round((Date.parse(i.now) - Date.parse(hb.at)) / 60_000) : null;
  const motor = {
    laatsteTick: hb?.at ?? null,
    minutenGeleden: ageMin,
    gezond: ageMin != null && ageMin <= 15 && !(hb?.errors),
    fouten: hb?.errors ?? 0,
    melding:
      hb == null
        ? 'Nog geen tick gelezen'
        : ageMin != null && ageMin > 15
          ? `Laatste tick ${ageMin} minuten geleden`
          : hb.errors
            ? `Laatste tick had ${hb.errors} fout(en)`
            : 'Tick loopt',
  };

  return {
    gelezenOp: i.now,
    portfolio: i.account
      ? { ...i.account, fout: null }
      : { equity: null, cash: null, dayPnl: null, dayPnlPct: null, marketOpen: null, fout: i.accountError ?? 'Account niet gelezen' },
    strategieen: strategies,
    recent: i.decisions.slice(0, 10).map((d) => ({
      ts: d.ts,
      symbool: d.symbol,
      besluit: d.decision,
      reden: d.rationale ?? 'Geen reden vastgelegd',
      routine: d.routine,
    })),
    motor,
  };
}
