import { executeCryptoBacktest } from '../web/lib/backtest-crypto-runner.ts';

const start = process.argv[2] ?? '2024-01-01';
const end = process.argv[3] ?? '2024-06-01';

const result = await executeCryptoBacktest({ periodStart: start, periodEnd: end });
console.log(JSON.stringify({ metrics: result.metrics, trades: result.trades.length }, null, 2));
