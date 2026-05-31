import { NextResponse } from 'next/server';
import { alpaca } from '@/lib/alpaca';
import { claudeJson, geminiText, MODELS } from '@/lib/ai';

const WATCHLIST = ['QQQ', 'SPY', 'XLK', 'XLI', 'XLY', 'IWM', 'XLF', 'XLE', 'XLV', 'XLU'];

interface CriteriaResult {
  trend_above_sma20: 'pass' | 'fail';
  momentum_rsi: 'pass' | 'fail';
  volume_above_avg: 'pass' | 'fail';
  vix_below_limit: 'pass' | 'fail';
  no_earnings_risk: 'pass' | 'fail';
  news_sentiment: 'pass' | 'fail';
}

interface ScanDecision {
  symbol: string;
  decision: 'BUY' | 'HOLD' | 'NO_GO';
  criteria: CriteriaResult;
  rationale: string;
  agentNote: string;
  confidence: number;
}

export async function POST() {
  try {
    const [barsData, account, positions, clock] = await Promise.all([
      alpaca.bars(WATCHLIST, '1Day', 30),
      alpaca.account(),
      alpaca.positions(),
      alpaca.clock(),
    ]);

    const bars = barsData.bars;
    const equity = parseFloat(account.equity);
    const openSymbols = positions.map(p => p.symbol);

    // Step 1: Gemini Flash — fast market data analysis per symbol
    const marketSnapshots = await Promise.all(
      WATCHLIST.map(async (symbol) => {
        const symbolBars = bars[symbol] ?? [];
        if (symbolBars.length < 5) return { symbol, skip: true };

        const recent = symbolBars.slice(-20);
        const closes = recent.map(b => b.c);
        const sma20 = closes.reduce((a, b) => a + b, 0) / closes.length;
        const lastClose = closes[closes.length - 1];
        const volumes = recent.map(b => b.v);
        const avgVol = volumes.slice(0, -1).reduce((a, b) => a + b, 0) / (volumes.length - 1);
        const lastVol = volumes[volumes.length - 1];

        // RSI(14) approximation
        const gains: number[] = [];
        const losses: number[] = [];
        for (let i = 1; i < Math.min(15, closes.length); i++) {
          const diff = closes[i] - closes[i - 1];
          if (diff >= 0) gains.push(diff); else losses.push(-diff);
        }
        const avgGain = gains.reduce((a, b) => a + b, 0) / 14;
        const avgLoss = losses.reduce((a, b) => a + b, 0) / 14;
        const rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

        return {
          symbol,
          lastClose,
          sma20: +sma20.toFixed(2),
          aboveSma20: lastClose > sma20,
          rsi: +rsi.toFixed(1),
          volumeRatio: +(lastVol / avgVol).toFixed(2),
          pct5d: +((lastClose - closes[closes.length - 6]) / closes[closes.length - 6] * 100).toFixed(2),
        };
      })
    );

    // Step 2: Gemini Flash — quick news/sentiment check
    const newsPrompt = `You are a market analyst. Today is ${new Date().toISOString().split('T')[0]}.
For each of these ETFs: ${WATCHLIST.join(', ')}, assess in 1 sentence each whether there are any known earnings risks, major macro events, or negative sector news TODAY that would make trading risky.
Format as JSON: { "QQQ": "safe/risky: <reason>", ... }`;

    let newsContext = '{}';
    try {
      newsContext = await geminiText(MODELS.flash, newsPrompt);
      const match = newsContext.match(/\{[\s\S]*\}/);
      newsContext = match ? match[0] : '{}';
    } catch { newsContext = '{}'; }

    let parsedNews: Record<string, string> = {};
    try { parsedNews = JSON.parse(newsContext); } catch { parsedNews = {}; }

    // Step 3: agent (smart tier) — make the actual trading decisions
    const marketData = marketSnapshots
      .filter(s => !('skip' in s && s.skip))
      .map(s => JSON.stringify(s))
      .join('\n');

    const system = `You are Momentum, an autonomous trading agent for US ETF paper trading.
Strategy: Momentum breakout on large-cap US ETFs. Paper trading, $${equity.toFixed(0)} equity.
Max 3 open positions. Currently open: ${openSymbols.length > 0 ? openSymbols.join(', ') : 'none'}.
Market is ${clock.is_open ? 'OPEN' : 'CLOSED'}.

ENTRY CRITERIA (all 6 must pass for BUY):
1. trend_above_sma20: price > 20-day SMA
2. momentum_rsi: RSI between 50-75 (momentum zone, not overbought)
3. volume_above_avg: volume ratio > 1.1 (above average)
4. vix_below_limit: VIX proxy — if SPY RSI < 30 or recent drop > 3%, FAIL
5. no_earnings_risk: no earnings or major events for underlying holdings today
6. news_sentiment: no major negative sector news

POSITION SIZING: 25% of equity per position max.
Do NOT recommend BUY for symbols already in open positions.
If ${openSymbols.length} >= 3 positions open, output HOLD for all — no new entries.`;

    const userPrompt = `Market data:\n${marketData}\n\nNews context:\n${JSON.stringify(parsedNews, null, 2)}\n\nEvaluate all ${WATCHLIST.length} symbols. Return JSON array:
[{"symbol":"QQQ","decision":"BUY"|"HOLD"|"NO_GO","criteria":{"trend_above_sma20":"pass"|"fail","momentum_rsi":"pass"|"fail","volume_above_avg":"pass"|"fail","vix_below_limit":"pass"|"fail","no_earnings_risk":"pass"|"fail","news_sentiment":"pass"|"fail"},"rationale":"<2 sentences>","agentNote":"<1 short sentence for display>","confidence":0.0-1.0}]`;

    const decisions = await claudeJson<ScanDecision[]>(MODELS.sonnet, system, userPrompt, 2048);

    return NextResponse.json({
      decisions,
      scannedAt: new Date().toISOString(),
      marketOpen: clock.is_open,
      equity,
      openPositions: openSymbols,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
