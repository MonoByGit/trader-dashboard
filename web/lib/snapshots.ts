import { computeSnapshotSeries } from '@snapshots/returns';
import { tradingDateEt } from '@scheduler/decide';
import { filterByAssetClass } from '@/lib/asset-class';
import { sleevesFromAlpacaLive } from '@/lib/sleeves';
import { alpaca, type AlpacaBar, type AlpacaPosition } from './alpaca';
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
    baseline_equity: string;
    baseline_spy_close: string | null;
    sleeves: { etf?: { baselineEquityUsd?: number }; crypto?: { baselineEquityUsd?: number; baselineBenchmarkClose?: number } } | null;
  }>(
    `SELECT baseline_equity, baseline_spy_close, sleeves FROM daily_snapshots ORDER BY trading_date ASC LIMIT 1`,
  );
  if (rows.length) {
    const s = rows[0].sleeves;
    return {
      equity: parseFloat(rows[0].baseline_equity),
      spyClose: rows[0].baseline_spy_close != null ? parseFloat(rows[0].baseline_spy_close) : null,
      btcClose: s?.crypto?.baselineBenchmarkClose ?? null,
    };
  }
  const configured = process.env.SNAPSHOT_BASELINE_EQUITY;
  if (configured) {
    return { equity: parseFloat(configured), spyClose: null, btcClose: null };
  }
  return { equity: 0, spyClose: null, btcClose: null };
}

async function closeForDate(tradingDate: string, bars: AlpacaBar[]): Promise<number | null> {
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

  const spyBars = (await alpaca.bars(['SPY'], '1Day', 400)).bars?.SPY ?? [];
  const btcBars = (await alpaca.cryptoBars(['BTC/USD'], '1Day', 400)).bars?.['BTC/USD'] ?? [];
  const spyClose = await closeForDate(tradingDate, spyBars);
  const btcClose = await closeForDate(tradingDate, btcBars);

  let baseline = await getBaseline();
  if (baseline.equity <= 0) {
    baseline = { equity, spyClose, btcClose };
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
  return dbQuery<DailySnapshot>(
    `SELECT trading_date::text AS trading_date, equity::float8 AS equity, cash::float8 AS cash, positions,
      spy_close::float8 AS spy_close, btc_close::float8 AS btc_close,
      momentum_daily_return_pct::float8 AS momentum_daily_return_pct,
      spy_daily_return_pct::float8 AS spy_daily_return_pct,
      momentum_cumulative_return_pct::float8 AS momentum_cumulative_return_pct,
      spy_cumulative_return_pct::float8 AS spy_cumulative_return_pct,
      baseline_equity::float8 AS baseline_equity,
      baseline_spy_close::float8 AS baseline_spy_close,
      sleeves
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
    row.spyClose = await closeForDate(row.tradingDate, spyBars);
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
