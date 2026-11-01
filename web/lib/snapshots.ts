import {
  baselineFromSnapshotRow,
  firstNonZeroEquity,
  resolveSnapshotBaselineEquity,
  snapshotsForChart,
} from '@snapshots/baseline';
import { computeSnapshotSeries } from '@snapshots/returns';
import { tradingDateEt } from '@scheduler/decide';
import { filterByAssetClass } from '@/lib/asset-class';
import { sleevesFromAlpacaLive } from '@/lib/sleeves';
import { alpaca, type AlpacaBar, type AlpacaPosition } from './alpaca';
import { fetchCryptoBars, fetchStockDailyBars } from './alpaca-bars';
import { dbQuery, dbRun, hasDb } from './db';
import { ensureSchema } from './migrate';

export interface SleeveSnapshotRow {
  equityUsd: number;
  exposureUsd: number;
  allocatedCashUsd: number;
  unrealizedPlUsd: number;
  dailyReturnPct: number | null;
  cumulativeReturnPct: number | null;
  benchmarkSymbol: string;
  benchmarkClose: number | null;
  benchmarkDailyReturnPct: number | null;
  benchmarkCumulativeReturnPct: number | null;
  baselineEquityUsd: number | null;
  baselineBenchmarkClose: number | null;
}

function addCalendarDaysYmd(ymd: string, deltaDays: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

async function fetchSpyBarsForRange(start: string, end: string): Promise<AlpacaBar[]> {
  const bars = await fetchStockDailyBars({
    symbols: ['SPY'],
    start: addCalendarDaysYmd(start, -15),
    end,
    adjustment: 'split',
  });
  return bars.SPY ?? [];
}

async function fetchBtcBarsForRange(start: string, end: string): Promise<AlpacaBar[]> {
  const bars = await fetchCryptoBars({
    symbols: ['BTC/USD'],
    start: addCalendarDaysYmd(start, -15),
    end,
  });
  return bars['BTC/USD'] ?? [];
}

export interface DailySnapshot {
  trading_date: string;
  equity: number;
  cash: number;
  positions: unknown;
  spy_close: number | null;
  btc_close: number | null;
  momentum_daily_return_pct: number | null;
  spy_daily_return_pct: number | null;
  momentum_cumulative_return_pct: number | null;
  spy_cumulative_return_pct: number | null;
  baseline_equity: number | null;
  baseline_spy_close: number | null;
  sleeves: {
    combined: { equityUsd: number; dailyReturnPct: number | null; cumulativeReturnPct: number | null };
    etf: SleeveSnapshotRow;
    crypto: SleeveSnapshotRow;
  } | null;
}

async function getBaseline(): Promise<{ equity: number; spyClose: number | null; btcClose: number | null }> {
  const rows = await dbQuery<{
    equity: string;
    baseline_equity: string;
    baseline_spy_close: string | null;
    sleeves: { etf?: { baselineEquityUsd?: number }; crypto?: { baselineEquityUsd?: number; baselineBenchmarkClose?: number } } | null;
  }>(
    `SELECT equity, baseline_equity, baseline_spy_close, sleeves
     FROM daily_snapshots
     WHERE equity > 0
     ORDER BY trading_date ASC
     LIMIT 1`,
  );
  if (rows.length) {
    return baselineFromSnapshotRow({
      equity: parseFloat(rows[0].equity),
      baseline_equity: parseFloat(rows[0].baseline_equity),
      baseline_spy_close:
        rows[0].baseline_spy_close != null ? parseFloat(rows[0].baseline_spy_close) : null,
      sleeves: rows[0].sleeves,
    });
  }
  const configured = process.env.SNAPSHOT_BASELINE_EQUITY;
  if (configured) {
    return { equity: parseFloat(configured), spyClose: null, btcClose: null };
  }
  return { equity: 0, spyClose: null, btcClose: null };
}

function closeForDate(tradingDate: string, bars: AlpacaBar[]): number | null {
  const bar = bars.find((b) => b.t.slice(0, 10) === tradingDate);
  if (bar) return bar.c;
  const prior = [...bars].reverse().find((b) => b.t.slice(0, 10) <= tradingDate);
  return prior?.c ?? null;
}

function positionsSummary(positions: AlpacaPosition[]) {
  return positions.map((p) => ({
    symbol: p.symbol,
    assetClass: p.asset_class,
    qty: parseFloat(p.qty),
    marketValue: parseFloat(p.market_value),
    unrealizedPl: parseFloat(p.unrealized_pl),
  }));
}

function sleeveReturns(
  currentEquity: number,
  prevEquity: number | null,
  baselineEquity: number,
): { daily: number | null; cumulative: number | null } {
  const daily =
    prevEquity != null && prevEquity > 0 ? ((currentEquity - prevEquity) / prevEquity) * 100 : null;
  const cumulative =
    baselineEquity > 0 ? ((currentEquity - baselineEquity) / baselineEquity) * 100 : null;
  return { daily, cumulative };
}

function benchReturns(
  close: number | null,
  prevClose: number | null,
  baselineClose: number | null,
): { daily: number | null; cumulative: number | null } {
  const daily =
    close != null && prevClose != null && prevClose > 0 ? ((close - prevClose) / prevClose) * 100 : null;
  const cumulative =
    close != null && baselineClose != null && baselineClose > 0
      ? ((close - baselineClose) / baselineClose) * 100
      : null;
  return { daily, cumulative };
}

export async function writeDailySnapshot(forDate?: string): Promise<DailySnapshot | null> {
  if (!hasDb()) return null;
  await ensureSchema();

  const account = await alpaca.account();
  const positions = await alpaca.positions();
  const tradingDate = forDate ?? tradingDateEt(Date.now());
  const equity = parseFloat(account.equity);
  const cash = parseFloat(account.cash);

  const spyBars = await fetchSpyBarsForRange(
    addCalendarDaysYmd(tradingDate, -400),
    tradingDate,
  );
  const btcBars = await fetchBtcBarsForRange(
    addCalendarDaysYmd(tradingDate, -400),
    tradingDate,
  );
  const spyClose = closeForDate(tradingDate, spyBars);
  const btcClose = closeForDate(tradingDate, btcBars);

  let baseline = await getBaseline();
  if (baseline.equity <= 0) {
    baseline = { equity, spyClose, btcClose };
  } else {
    if (baseline.spyClose == null && spyClose != null) {
      baseline = { ...baseline, spyClose };
    }
    if (baseline.btcClose == null && btcClose != null) {
      baseline = { ...baseline, btcClose };
    }
  }

  const prev = await dbQuery<{ equity: string; spy_close: string | null; btc_close: string | null; sleeves: DailySnapshot['sleeves'] }>(
    `SELECT equity, spy_close, btc_close, sleeves FROM daily_snapshots WHERE trading_date < $1::date ORDER BY trading_date DESC LIMIT 1`,
    [tradingDate],
  );
  const prevEquity = prev.length ? parseFloat(prev[0].equity) : null;
  const prevSpy = prev.length && prev[0].spy_close != null ? parseFloat(prev[0].spy_close) : null;
  const prevBtc = prev.length && prev[0].btc_close != null ? parseFloat(prev[0].btc_close) : null;
  const prevSleeves = prev.length ? prev[0].sleeves : null;

  const momentumDaily =
    prevEquity != null && prevEquity > 0 ? ((equity - prevEquity) / prevEquity) * 100 : null;
  const spyDaily =
    spyClose != null && prevSpy != null && prevSpy > 0 ? ((spyClose - prevSpy) / prevSpy) * 100 : null;
  const momentumCum =
    baseline.equity > 0 ? ((equity - baseline.equity) / baseline.equity) * 100 : null;
  const spyCum =
    spyClose != null && baseline.spyClose != null && baseline.spyClose > 0
      ? ((spyClose - baseline.spyClose) / baseline.spyClose) * 100
      : null;

  const books = await sleevesFromAlpacaLive(equity, cash, positions);
  const etfBaseline =
    prevSleeves?.etf.baselineEquityUsd ?? books.etf.equityUsd;
  const cryptoBaseline =
    prevSleeves?.crypto.baselineEquityUsd ?? books.crypto.equityUsd;
  const btcBaseline = prevSleeves?.crypto.baselineBenchmarkClose ?? btcClose;

  const etfRet = sleeveReturns(books.etf.equityUsd, prevSleeves?.etf.equityUsd ?? null, etfBaseline);
  const cryptoRet = sleeveReturns(
    books.crypto.equityUsd,
    prevSleeves?.crypto.equityUsd ?? null,
    cryptoBaseline,
  );
  const spyBench = benchReturns(spyClose, prevSpy, baseline.spyClose ?? spyClose);
  const btcBench = benchReturns(btcClose, prevBtc, btcBaseline);

  const sleeves = {
    combined: {
      equityUsd: equity,
      dailyReturnPct: momentumDaily,
      cumulativeReturnPct: momentumCum,
    },
    etf: {
      equityUsd: books.etf.equityUsd,
      exposureUsd: books.etf.exposureUsd,
      allocatedCashUsd: books.etf.allocatedCashUsd,
      unrealizedPlUsd: books.etf.unrealizedPlUsd,
      dailyReturnPct: etfRet.daily,
      cumulativeReturnPct: etfRet.cumulative,
      benchmarkSymbol: 'SPY',
      benchmarkClose: spyClose,
      benchmarkDailyReturnPct: spyBench.daily,
      benchmarkCumulativeReturnPct: spyBench.cumulative,
      baselineEquityUsd: etfBaseline,
      baselineBenchmarkClose: baseline.spyClose ?? spyClose,
    },
    crypto: {
      equityUsd: books.crypto.equityUsd,
      exposureUsd: books.crypto.exposureUsd,
      allocatedCashUsd: books.crypto.allocatedCashUsd,
      unrealizedPlUsd: books.crypto.unrealizedPlUsd,
      dailyReturnPct: cryptoRet.daily,
      cumulativeReturnPct: cryptoRet.cumulative,
      benchmarkSymbol: 'BTC/USD',
      benchmarkClose: btcClose,
      benchmarkDailyReturnPct: btcBench.daily,
      benchmarkCumulativeReturnPct: btcBench.cumulative,
      baselineEquityUsd: cryptoBaseline,
      baselineBenchmarkClose: btcBaseline,
    },
  };

  const etfPositions = filterByAssetClass(positions, 'etf');
  const posJson = JSON.stringify({
    all: positionsSummary(positions),
    etf: positionsSummary(etfPositions),
    crypto: positionsSummary(filterByAssetClass(positions, 'crypto')),
  });

  await dbRun(
    `INSERT INTO daily_snapshots (
      trading_date, equity, cash, positions, spy_close, btc_close,
      momentum_daily_return_pct, spy_daily_return_pct,
      momentum_cumulative_return_pct, spy_cumulative_return_pct,
      baseline_equity, baseline_spy_close, sleeves, updated_at
    ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,NOW())
    ON CONFLICT (trading_date) DO UPDATE SET
      equity = EXCLUDED.equity,
      cash = EXCLUDED.cash,
      positions = EXCLUDED.positions,
      spy_close = EXCLUDED.spy_close,
      btc_close = EXCLUDED.btc_close,
      momentum_daily_return_pct = EXCLUDED.momentum_daily_return_pct,
      spy_daily_return_pct = EXCLUDED.spy_daily_return_pct,
      momentum_cumulative_return_pct = EXCLUDED.momentum_cumulative_return_pct,
      spy_cumulative_return_pct = EXCLUDED.spy_cumulative_return_pct,
      baseline_equity = EXCLUDED.baseline_equity,
      baseline_spy_close = EXCLUDED.baseline_spy_close,
      sleeves = EXCLUDED.sleeves,
      updated_at = NOW()`,
    [
      tradingDate,
      equity,
      cash,
      posJson,
      spyClose,
      btcClose,
      momentumDaily,
      spyDaily,
      momentumCum,
      spyCum,
      baseline.equity,
      baseline.spyClose,
      JSON.stringify(sleeves),
    ],
  );

  return {
    trading_date: tradingDate,
    equity,
    cash,
    positions: JSON.parse(posJson),
    spy_close: spyClose,
    btc_close: btcClose,
    momentum_daily_return_pct: momentumDaily,
    spy_daily_return_pct: spyDaily,
    momentum_cumulative_return_pct: momentumCum,
    spy_cumulative_return_pct: spyCum,
    baseline_equity: baseline.equity,
    baseline_spy_close: baseline.spyClose,
    sleeves,
  };
}

export async function listSnapshots(limit = 400): Promise<DailySnapshot[]> {
  if (!hasDb()) return [];
  await ensureSchema();
  const rows = await dbQuery<DailySnapshot>(
    `SELECT trading_date::text AS trading_date, equity::float8 AS equity, cash::float8 AS cash, positions,
      spy_close::float8 AS spy_close, btc_close::float8 AS btc_close,
      momentum_daily_return_pct::float8 AS momentum_daily_return_pct,
      spy_daily_return_pct::float8 AS spy_daily_return_pct,
      momentum_cumulative_return_pct::float8 AS momentum_cumulative_return_pct,
      spy_cumulative_return_pct::float8 AS spy_cumulative_return_pct,
      baseline_equity::float8 AS baseline_equity,
      baseline_spy_close::float8 AS baseline_spy_close,
      sleeves
     FROM daily_snapshots
     WHERE equity > 0
     ORDER BY trading_date ASC LIMIT $1`,
    [limit],
  );
  return snapshotsForChart(rows);
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

  if (inputs.length === 0) return { written: 0 };

  const rangeStart = inputs[0]!.tradingDate;
  const rangeEnd = inputs[inputs.length - 1]!.tradingDate;
  const spyBars = await fetchSpyBarsForRange(rangeStart, rangeEnd);
  const btcBars = await fetchBtcBarsForRange(rangeStart, rangeEnd);

  for (const row of inputs) {
    row.spyClose = closeForDate(row.tradingDate, spyBars);
  }

  const configuredBaseline = parseFloat(process.env.SNAPSHOT_BASELINE_EQUITY ?? '');
  const baselineEquity = resolveSnapshotBaselineEquity(
    inputs,
    Number.isFinite(configuredBaseline) && configuredBaseline > 0 ? configuredBaseline : null,
  );
  const fundedRow = firstNonZeroEquity(inputs);
  const baselineSpy =
    fundedRow?.spyClose ?? inputs.find((r) => r.spyClose != null)?.spyClose ?? null;

  const computed = computeSnapshotSeries(inputs, baselineEquity, baselineSpy);

  for (const row of computed) {
    const btcClose = closeForDate(row.tradingDate, btcBars);
    await dbRun(
      `INSERT INTO daily_snapshots (
        trading_date, equity, cash, positions, spy_close, btc_close,
        momentum_daily_return_pct, spy_daily_return_pct,
        momentum_cumulative_return_pct, spy_cumulative_return_pct,
        baseline_equity, baseline_spy_close, updated_at
      ) VALUES ($1,$2,0,'[]'::jsonb,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
      ON CONFLICT (trading_date) DO UPDATE SET
        equity = EXCLUDED.equity,
        spy_close = EXCLUDED.spy_close,
        btc_close = EXCLUDED.btc_close,
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
        btcClose,
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

/** Fill SPY close + benchmark returns on existing snapshot rows (chart backfill). */
export async function backfillSpyClosesForExistingRows(opts?: {
  start?: string;
  end?: string;
}): Promise<{ updated: number }> {
  if (!hasDb()) return { updated: 0 };
  await ensureSchema();

  const full = await listSnapshots(2000);
  if (full.length === 0) return { updated: 0 };

  const rangeStart = opts?.start ?? full[0]!.trading_date;
  const rangeEnd = opts?.end ?? full[full.length - 1]!.trading_date;
  const spyBars = await fetchSpyBarsForRange(rangeStart, rangeEnd);

  const baselineEquity =
    full[0]!.baseline_equity ?? full[0]!.equity;
  let baselineSpy = full[0]!.baseline_spy_close;

  const inputs = full.map((row) => ({
    tradingDate: row.trading_date,
    equity: row.equity,
    spyClose: closeForDate(row.trading_date, spyBars) ?? row.spy_close,
  }));

  if (baselineSpy == null) {
    baselineSpy = inputs.find((r) => r.spyClose != null)?.spyClose ?? null;
  }

  const computed = computeSnapshotSeries(inputs, baselineEquity, baselineSpy);

  let updated = 0;
  for (const row of computed) {
    if (row.tradingDate < rangeStart || row.tradingDate > rangeEnd) continue;
    await dbRun(
      `UPDATE daily_snapshots SET
        spy_close = $2,
        spy_daily_return_pct = $3,
        spy_cumulative_return_pct = $4,
        baseline_spy_close = COALESCE(baseline_spy_close, $5),
        updated_at = NOW()
       WHERE trading_date = $1::date`,
      [
        row.tradingDate,
        row.spyClose,
        row.spyDailyReturnPct,
        row.spyCumulativeReturnPct,
        row.baselineSpyClose,
      ],
    );
    updated += 1;
  }

  return { updated };
}
