import { computeSnapshotSeries } from '@snapshots/returns';
import { tradingDateEt } from '@scheduler/decide';
import { alpaca, type AlpacaBar, type AlpacaPosition } from './alpaca';
import { dbQuery, dbRun, hasDb } from './db';
import { ensureSchema } from './migrate';

export interface DailySnapshot {
  trading_date: string;
  equity: number;
  cash: number;
  positions: unknown;
  spy_close: number | null;
  momentum_daily_return_pct: number | null;
  spy_daily_return_pct: number | null;
  momentum_cumulative_return_pct: number | null;
  spy_cumulative_return_pct: number | null;
  baseline_equity: number | null;
  baseline_spy_close: number | null;
}

async function getBaseline(): Promise<{ equity: number; spyClose: number | null }> {
  const rows = await dbQuery<{ baseline_equity: string; baseline_spy_close: string | null }>(
    `SELECT baseline_equity, baseline_spy_close FROM daily_snapshots ORDER BY trading_date ASC LIMIT 1`,
  );
  if (rows.length) {
    return {
      equity: parseFloat(rows[0].baseline_equity),
      spyClose: rows[0].baseline_spy_close != null ? parseFloat(rows[0].baseline_spy_close) : null,
    };
  }
  const configured = process.env.SNAPSHOT_BASELINE_EQUITY;
  if (configured) {
    return { equity: parseFloat(configured), spyClose: null };
  }
  return { equity: 0, spyClose: null };
}

async function spyCloseForDate(tradingDate: string, bars: AlpacaBar[]): Promise<number | null> {
  const bar = bars.find((b) => b.t.slice(0, 10) === tradingDate);
  if (bar) return bar.c;
  const prior = [...bars].reverse().find((b) => b.t.slice(0, 10) <= tradingDate);
  return prior?.c ?? null;
}

function positionsSummary(positions: AlpacaPosition[]) {
  return positions.map((p) => ({
    symbol: p.symbol,
    qty: parseFloat(p.qty),
    marketValue: parseFloat(p.market_value),
    unrealizedPl: parseFloat(p.unrealized_pl),
  }));
}

export async function writeDailySnapshot(forDate?: string): Promise<DailySnapshot | null> {
  if (!hasDb()) return null;
  await ensureSchema();

  const account = await alpaca.account();
  const positions = await alpaca.positions();
  const tradingDate = forDate ?? tradingDateEt(Date.now());
  const equity = parseFloat(account.equity);
  const cash = parseFloat(account.cash);

  const spyBars = (await alpaca.bars(['SPY'], '1Day', 400)).bars?.SPY ?? [];
  const spyClose = await spyCloseForDate(tradingDate, spyBars);

  let baseline = await getBaseline();
  if (baseline.equity <= 0) {
    baseline = { equity, spyClose };
  }

  const prev = await dbQuery<{ equity: string; spy_close: string | null }>(
    `SELECT equity, spy_close FROM daily_snapshots WHERE trading_date < $1::date ORDER BY trading_date DESC LIMIT 1`,
    [tradingDate],
  );
  const prevEquity = prev.length ? parseFloat(prev[0].equity) : null;
  const prevSpy = prev.length && prev[0].spy_close != null ? parseFloat(prev[0].spy_close) : null;

  const momentumDaily =
    prevEquity != null && prevEquity > 0 ? ((equity - prevEquity) / prevEquity) * 100 : null;
  const spyDaily =
    spyClose != null && prevSpy != null && prevSpy > 0
      ? ((spyClose - prevSpy) / prevSpy) * 100
      : null;
  const momentumCum =
    baseline.equity > 0 ? ((equity - baseline.equity) / baseline.equity) * 100 : null;
  const spyCum =
    spyClose != null && baseline.spyClose != null && baseline.spyClose > 0
      ? ((spyClose - baseline.spyClose) / baseline.spyClose) * 100
      : null;

  const posJson = JSON.stringify(positionsSummary(positions));

  await dbRun(
    `INSERT INTO daily_snapshots (
      trading_date, equity, cash, positions, spy_close,
      momentum_daily_return_pct, spy_daily_return_pct,
      momentum_cumulative_return_pct, spy_cumulative_return_pct,
      baseline_equity, baseline_spy_close, updated_at
    ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,NOW())
    ON CONFLICT (trading_date) DO UPDATE SET
      equity = EXCLUDED.equity,
      cash = EXCLUDED.cash,
      positions = EXCLUDED.positions,
      spy_close = EXCLUDED.spy_close,
      momentum_daily_return_pct = EXCLUDED.momentum_daily_return_pct,
      spy_daily_return_pct = EXCLUDED.spy_daily_return_pct,
      momentum_cumulative_return_pct = EXCLUDED.momentum_cumulative_return_pct,
      spy_cumulative_return_pct = EXCLUDED.spy_cumulative_return_pct,
      baseline_equity = EXCLUDED.baseline_equity,
      baseline_spy_close = EXCLUDED.baseline_spy_close,
      updated_at = NOW()`,
    [
      tradingDate,
      equity,
      cash,
      posJson,
      spyClose,
      momentumDaily,
      spyDaily,
      momentumCum,
      spyCum,
      baseline.equity,
      baseline.spyClose,
    ],
  );

  return {
    trading_date: tradingDate,
    equity,
    cash,
    positions: JSON.parse(posJson),
    spy_close: spyClose,
    momentum_daily_return_pct: momentumDaily,
    spy_daily_return_pct: spyDaily,
    momentum_cumulative_return_pct: momentumCum,
    spy_cumulative_return_pct: spyCum,
    baseline_equity: baseline.equity,
    baseline_spy_close: baseline.spyClose,
  };
}

export async function listSnapshots(limit = 400): Promise<DailySnapshot[]> {
  if (!hasDb()) return [];
  await ensureSchema();
  return dbQuery<DailySnapshot>(
    `SELECT trading_date::text AS trading_date, equity::float8 AS equity, cash::float8 AS cash, positions,
      spy_close::float8 AS spy_close,
      momentum_daily_return_pct::float8 AS momentum_daily_return_pct,
      spy_daily_return_pct::float8 AS spy_daily_return_pct,
      momentum_cumulative_return_pct::float8 AS momentum_cumulative_return_pct,
      spy_cumulative_return_pct::float8 AS spy_cumulative_return_pct,
      baseline_equity::float8 AS baseline_equity,
      baseline_spy_close::float8 AS baseline_spy_close
     FROM daily_snapshots ORDER BY trading_date ASC LIMIT $1`,
    [limit],
  );
}

interface PortfolioHistoryPoint {
  timestamp: number;
  equity: number;
}

export async function backfillSnapshotsFromAlpaca(opts?: {
  start?: string;
  end?: string;
}): Promise<{ written: number }> {
  if (!hasDb()) return { written: 0 };
  await ensureSchema();

  const history = await alpaca.portfolioHistory('1A', '1D');
  const timestamps = history.timestamp ?? [];
  const equities = history.equity ?? [];
  const points: PortfolioHistoryPoint[] = timestamps
    .map((ts, i) => ({ timestamp: ts * 1000, equity: equities[i] }))
    .filter((p) => Number.isFinite(p.equity));

  const spyBars = (await alpaca.bars(['SPY'], '1Day', 400)).bars?.SPY ?? [];
  const start = opts?.start;
  const end = opts?.end;

  const inputs = points
    .map((p) => ({
      tradingDate: tradingDateEt(p.timestamp),
      equity: p.equity,
      spyClose: null as number | null,
    }))
    .filter((row) => {
      if (start && row.tradingDate < start) return false;
      if (end && row.tradingDate > end) return false;
      return true;
    });

  for (const row of inputs) {
    row.spyClose = await spyCloseForDate(row.tradingDate, spyBars);
  }

  if (inputs.length === 0) return { written: 0 };

  const baselineEquity = parseFloat(process.env.SNAPSHOT_BASELINE_EQUITY ?? '') || inputs[0].equity;
  const baselineSpy = inputs[0].spyClose;

  const computed = computeSnapshotSeries(inputs, baselineEquity, baselineSpy);

  for (const row of computed) {
    await dbRun(
      `INSERT INTO daily_snapshots (
        trading_date, equity, cash, positions, spy_close,
        momentum_daily_return_pct, spy_daily_return_pct,
        momentum_cumulative_return_pct, spy_cumulative_return_pct,
        baseline_equity, baseline_spy_close, updated_at
      ) VALUES ($1,$2,0,'[]'::jsonb,$3,$4,$5,$6,$7,$8,$9,NOW())
      ON CONFLICT (trading_date) DO UPDATE SET
        equity = EXCLUDED.equity,
        spy_close = EXCLUDED.spy_close,
        momentum_daily_return_pct = EXCLUDED.momentum_daily_return_pct,
        spy_daily_return_pct = EXCLUDED.spy_daily_return_pct,
        momentum_cumulative_return_pct = EXCLUDED.momentum_cumulative_return_pct,
        spy_cumulative_return_pct = EXCLUDED.spy_cumulative_return_pct,
        baseline_equity = EXCLUDED.baseline_equity,
        baseline_spy_close = EXCLUDED.baseline_spy_close,
        updated_at = NOW()`,
      [
        row.tradingDate,
        row.equity,
        row.spyClose,
        row.momentumDailyReturnPct,
        row.spyDailyReturnPct,
        row.momentumCumulativeReturnPct,
        row.spyCumulativeReturnPct,
        row.baselineEquity,
        row.baselineSpyClose,
      ],
    );
  }

  return { written: computed.length };
}
