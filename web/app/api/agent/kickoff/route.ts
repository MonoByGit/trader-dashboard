import { NextResponse } from 'next/server';
import { dbQuery, initDb, hasDb } from '@/lib/db';
import { alpaca } from '@/lib/alpaca';
import { claudeJson, geminiText, MODELS } from '@/lib/ai';
import strategy from '@/strategy.json';

export interface KickoffOption {
  symbol: string;
  thesis: string;
  rationale: string;
  confidence: number;
  criteria: Record<string, 'pass' | 'fail'>;
  entryZone: string;
  stopLevel: string;
}

export async function GET() {
  try {
    // Try to use today's premarket decisions from DB first
    if (hasDb()) {
      await initDb();
      const today = new Date().toISOString().split('T')[0];
      const rows = await dbQuery<{
        symbol: string; decision: string; rationale: string;
        agent_note: string; confidence: number; criteria: Record<string, string>;
      }>(
        `SELECT symbol, decision, rationale, agent_note, confidence, criteria
         FROM decisions
         WHERE routine='premarket' AND ts::date = $1::date AND decision IN ('BUY','HOLD')
         ORDER BY confidence DESC LIMIT 3`,
        [today]
      );
      if (rows.length >= 1) {
        const options: KickoffOption[] = rows.map(r => ({
          symbol: r.symbol,
          thesis: r.agent_note || r.rationale.split('.')[0],
          rationale: r.rationale,
          confidence: r.confidence ?? 0.7,
          criteria: (r.criteria as Record<string, 'pass' | 'fail'>) ?? {},
          entryZone: 'market price',
          stopLevel: `−${(strategy.rules.hard_stop_pct * 100).toFixed(0)}% hard stop`,
        }));
        return NextResponse.json({ options, source: 'premarket' });
      }
    }

    // No premarket data yet — generate fresh suggestions from live bars
    const barsData = await alpaca.bars(strategy.symbols, '1Day', 20);
    const bars = barsData.bars ?? {};
    const account = await alpaca.account().catch(() => null);
    const equity = account ? parseFloat(account.equity) : 100000;

    const snapshots = strategy.symbols.map(symbol => {
      const b = bars[symbol] ?? [];
      if (b.length < 5) return null;
      const closes = b.slice(-20).map((x: { c: number }) => x.c);
      const sma20 = closes.reduce((a: number, v: number) => a + v, 0) / closes.length;
      const last = closes[closes.length - 1];
      const vols = b.slice(-20).map((x: { v: number }) => x.v);
      const avgVol = vols.slice(0, -1).reduce((a: number, v: number) => a + v, 0) / (vols.length - 1);
      const gains: number[] = [], losses: number[] = [];
      for (let i = closes.length - 14; i < closes.length; i++) {
        const d = closes[i] - closes[i - 1];
        if (d >= 0) gains.push(d); else losses.push(-d);
      }
      const ag = gains.reduce((a, v) => a + v, 0) / 14;
      const al = losses.reduce((a, v) => a + v, 0) / 14;
      const rsi = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
      const pct5d = ((last - closes[closes.length - 6]) / closes[closes.length - 6] * 100);
      return { symbol, last: +last.toFixed(2), sma20: +sma20.toFixed(2), aboveSma20: last > sma20, rsi: +rsi.toFixed(1), volRatio: +(vols[vols.length - 1] / avgVol).toFixed(2), pct5d: +pct5d.toFixed(2) };
    }).filter(Boolean);

    let newsCtx = '{}';
    try {
      const r = await geminiText(MODELS.flash, `Today ${new Date().toISOString().split('T')[0]}. For ETFs ${strategy.symbols.join(',')}: any major risks today? JSON {"QQQ":"safe/risky",...}`);
      const m = r.match(/\{[\s\S]*\}/); if (m) newsCtx = m[0];
    } catch {}

    const options = await claudeJson<KickoffOption[]>(
      MODELS.sonnet,
      `Je bent Momentum. Equity: $${equity.toFixed(0)}. Selecteer precies 3 ETFs voor de sessie van vandaag. Kies de beste setups op basis van momentum, trend en volume.`,
      `Data: ${JSON.stringify(snapshots)}\nNieuws: ${newsCtx}\n\nGeef JSON array met precies 3 items: [{"symbol":"QQQ","thesis":"1-zin thesis","rationale":"2-zin onderbouwing","confidence":0.0-1.0,"criteria":{"trend_above_sma20":"pass/fail","momentum_rsi":"pass/fail","volume_above_avg":"pass/fail","vix_below_limit":"pass/fail","no_earnings_risk":"pass/fail","news_sentiment":"pass/fail"},"entryZone":"prijszone bijv $470-$472","stopLevel":"stop bijv $460 (−2%)"}]`,
      1024
    );

    return NextResponse.json({ options, source: 'live' });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
