const now = new Date('2026-04-18T13:42:18-04:00');
const ago = (mins: number) => new Date(now.getTime() - mins * 60000).toISOString();
const days = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();

function buildEquityCurve(n = 30, start = 100000): { t: number; v: number }[] {
  const pts = [];
  let v = start;
  for (let i = 0; i < n; i++) {
    v += 180 + Math.sin(i / 3) * 60;
    pts.push({ t: i, v: Math.round(v) });
  }
  pts[pts.length - 1].v = 104682;
  return pts;
}

function buildIntraday(): { t: number; v: number; label: string }[] {
  const pts = [];
  const start = 104134;
  let v = start;
  for (let i = 0; i < 51; i++) {
    const phase = i / 51;
    const trend = Math.sin(phase * Math.PI * 1.4) * 420 + phase * 380;
    v = Math.round(start + trend + (i % 7) * 20 - 50);
    const h = Math.floor((9 * 60 + 30 + i * 5) / 60);
    const m = (9 * 60 + 30 + i * 5) % 60;
    pts.push({ t: i, v, label: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}` });
  }
  pts[pts.length - 1].v = 104682;
  return pts;
}

export const MOCK = {
  now,
  equityDaily: buildEquityCurve(),
  equityIntraday: buildIntraday(),

  portfolioActive: {
    totalEquity: 104682.00,
    cashBalance: 56902.74,
    dayStartEquity: 104134.18,
    dailyPnl: 547.82,
    dailyPnlPct: 0.526,
    allTimePnl: 4682.00,
    allTimePnlPct: 4.682,
    tradingEnabled: true,
    circuitBreakerTripped: false,
    positions: [
      {
        symbol: 'QQQ', name: 'Invesco Nasdaq-100', sector: 'Tech / Growth',
        qty: 58, avgEntryPrice: 441.82, currentPrice: 446.15, highWatermark: 447.90,
        entryAt: '2026-04-17T09:37:14-04:00',
        stopLoss: 432.98, trailingStop: 434.46, takeProfit: 463.91, sma20: 435.60,
        marketValue: 58 * 446.15, costBasis: 58 * 441.82,
        unrealizedPnl: +(446.15 - 441.82) * 58,
        unrealizedPnlPct: +((446.15 - 441.82) / 441.82 * 100).toFixed(2),
        sparkline: [441.8, 442.3, 443.1, 442.8, 444.0, 445.5, 446.9, 447.9, 446.2, 446.15],
      },
      {
        symbol: 'XLK', name: 'Technology Select Sector', sector: 'Technology',
        qty: 122, avgEntryPrice: 238.44, currentPrice: 237.08, highWatermark: 239.12,
        entryAt: '2026-04-17T09:37:52-04:00',
        stopLoss: 233.67, trailingStop: 231.95, takeProfit: 250.36, sma20: 234.10,
        marketValue: 122 * 237.08, costBasis: 122 * 238.44,
        unrealizedPnl: +(237.08 - 238.44) * 122,
        unrealizedPnlPct: +((237.08 - 238.44) / 238.44 * 100).toFixed(2),
        sparkline: [238.4, 238.9, 239.1, 238.5, 237.9, 237.3, 237.6, 238.1, 237.5, 237.08],
      },
    ],
  },

  portfolioEmpty: {
    totalEquity: 100000.00, cashBalance: 100000.00, dayStartEquity: 100000.00,
    dailyPnl: 0, dailyPnlPct: 0, allTimePnl: 0, allTimePnlPct: 0,
    tradingEnabled: true, circuitBreakerTripped: false, positions: [],
  },

  watchlist: [
    { symbol: 'SPY', name: 'S&P 500', price: 512.44, sma20: 508.10, sma50: 502.60, fiveDayHigh: 513.80, rsi14: 58.2, volRatio: 0.94, open: false },
    { symbol: 'QQQ', name: 'Nasdaq-100', price: 446.15, sma20: 435.60, sma50: 428.90, fiveDayHigh: 440.80, rsi14: 64.1, volRatio: 1.12, open: true },
    { symbol: 'IWM', name: 'Russell 2000', price: 201.12, sma20: 203.50, sma50: 206.20, fiveDayHigh: 204.10, rsi14: 41.8, volRatio: 0.82, open: false },
    { symbol: 'DIA', name: 'Dow Jones', price: 388.70, sma20: 387.10, sma50: 384.50, fiveDayHigh: 391.20, rsi14: 52.4, volRatio: 0.88, open: false },
    { symbol: 'XLF', name: 'Financials', price: 43.88, sma20: 43.20, sma50: 42.60, fiveDayHigh: 44.10, rsi14: 55.9, volRatio: 1.04, open: false },
    { symbol: 'XLE', name: 'Energy', price: 91.50, sma20: 89.20, sma50: 87.40, fiveDayHigh: 92.10, rsi14: 58.2, volRatio: 1.14, open: false },
    { symbol: 'XLK', name: 'Technology', price: 237.08, sma20: 234.10, sma50: 228.30, fiveDayHigh: 236.20, rsi14: 59.4, volRatio: 1.16, open: true },
    { symbol: 'XLV', name: 'Health Care', price: 148.22, sma20: 149.80, sma50: 150.50, fiveDayHigh: 150.90, rsi14: 44.2, volRatio: 0.76, open: false },
    { symbol: 'XLI', name: 'Industrials', price: 133.41, sma20: 132.80, sma50: 131.40, fiveDayHigh: 134.20, rsi14: 53.6, volRatio: 0.91, open: false },
    { symbol: 'XLY', name: 'Consumer Discr.', price: 197.05, sma20: 194.50, sma50: 191.80, fiveDayHigh: 196.80, rsi14: 62.1, volRatio: 1.08, open: false },
  ],

  decisions: [
    { id: 'd-0012', ts: '2026-04-17T12:30:04-04:00', routine: 'midday', symbol: 'QQQ', decision: 'HOLD', agentNote: 'QQQ trekt door. High watermark naar $447.90. Ik laat de trailing stop ademen.', criteria: null, gates: null, orderId: null },
    { id: 'd-0011', ts: '2026-04-17T12:30:02-04:00', routine: 'midday', symbol: 'XLK', decision: 'HOLD', agentNote: 'XLK koelt even af. Nog $3.41 boven de hard stop. Ik wacht.', criteria: null, gates: null, orderId: null },
    { id: 'd-0010', ts: '2026-04-17T12:30:00-04:00', routine: 'midday', symbol: 'XLY', decision: 'NO_GO', agentNote: 'XLY zag er goed uit, maar ik zit vol — positiecap is 3.', criteria: { price_above_sma20: 'pass', price_above_sma50: 'pass', breakout_above_5d_high: 'pass', volume_confirmation: 'pass', rsi_in_range: 'pass', no_existing_position: 'pass' }, gates: null, orderId: null },
    { id: 'd-0009', ts: '2026-04-17T09:38:02-04:00', routine: 'market-open', symbol: 'XLE', decision: 'NO_GO', agentNote: 'XLE bijna daar, maar nog 60 cent onder de breakout. Niet chasen.', criteria: { price_above_sma20: 'pass', price_above_sma50: 'pass', breakout_above_5d_high: 'fail', volume_confirmation: 'pass', rsi_in_range: 'pass', no_existing_position: 'pass' }, gates: { vix_below_30: 'pass', not_earnings_day: 'pass', not_open_buffer: 'pass', not_pre_close: 'pass', not_half_day: 'pass' }, orderId: null },
    { id: 'd-0008', ts: '2026-04-17T09:37:52-04:00', routine: 'market-open', symbol: 'XLK', decision: 'BUY', agentNote: 'XLK: trend + breakout + volume aligned. 122 shares in.', criteria: { price_above_sma20: 'pass', price_above_sma50: 'pass', breakout_above_5d_high: 'pass', volume_confirmation: 'pass', rsi_in_range: 'pass', no_existing_position: 'pass' }, gates: { vix_below_30: 'pass', not_earnings_day: 'pass', not_open_buffer: 'pass', not_pre_close: 'pass', not_half_day: 'pass' }, orderId: 'f7d2a91e-8c30-4b5c-9e2a-1f44a8db09c1' },
    { id: 'd-0007', ts: '2026-04-17T09:37:14-04:00', routine: 'market-open', symbol: 'QQQ', decision: 'BUY', agentNote: 'QQQ breekt door de 5-day high met 1.12× volume. Instap genomen.', criteria: { price_above_sma20: 'pass', price_above_sma50: 'pass', breakout_above_5d_high: 'pass', volume_confirmation: 'pass', rsi_in_range: 'pass', no_existing_position: 'pass' }, gates: { vix_below_30: 'pass', not_earnings_day: 'pass', not_open_buffer: 'pass', not_pre_close: 'pass', not_half_day: 'pass' }, orderId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
    { id: 'd-0006', ts: '2026-04-17T09:36:58-04:00', routine: 'market-open', symbol: 'SPY', decision: 'NO_GO', agentNote: 'SPY had de trend, maar het volume kwam niet opdagen. Skip.', criteria: { price_above_sma20: 'pass', price_above_sma50: 'pass', breakout_above_5d_high: 'fail', volume_confirmation: 'fail', rsi_in_range: 'pass', no_existing_position: 'pass' }, gates: { vix_below_30: 'pass', not_earnings_day: 'pass', not_open_buffer: 'pass', not_pre_close: 'pass', not_half_day: 'pass' }, orderId: null },
    { id: 'd-0005', ts: '2026-04-17T09:36:40-04:00', routine: 'market-open', symbol: 'IWM', decision: 'NO_GO', agentNote: 'IWM zit in een downtrend. Niet voor ons.', criteria: { price_above_sma20: 'fail', price_above_sma50: 'fail', breakout_above_5d_high: 'fail', volume_confirmation: 'fail', rsi_in_range: 'fail', no_existing_position: 'pass' }, gates: null, orderId: null },
    { id: 'd-0004', ts: '2026-04-17T09:35:12-04:00', routine: 'market-open', symbol: '—', decision: 'GATE_CHECK', agentNote: 'Markt is kalm. VIX 18.4. Ik ga de watchlist af.', criteria: null, gates: { vix_below_30: 'pass', not_earnings_day: 'pass', not_open_buffer: 'pass', not_pre_close: 'pass', not_half_day: 'pass' }, orderId: null },
    { id: 'd-0003', ts: '2026-04-17T08:30:08-04:00', routine: 'premarket', symbol: '—', decision: 'WATCHLIST', agentNote: 'Premarket klaar. 3 kandidaten met sterke setup: QQQ, XLK, XLE.', criteria: null, gates: null, orderId: null },
  ],

  routines: [
    { id: 'premarket', name: 'Premarket Scan', time: '08:30 ET', status: 'done', lastRun: '2026-04-17T08:30:08-04:00', nextRun: '2026-04-18T08:30:00-04:00', summary: '10 symbols scanned, 3 candidates flagged' },
    { id: 'market-open', name: 'Market Open', time: '09:35 ET', status: 'done', lastRun: '2026-04-17T09:35:12-04:00', nextRun: '2026-04-18T09:35:00-04:00', summary: '2 BUY orders executed (QQQ, XLK)' },
    { id: 'midday', name: 'Midday Check', time: '12:30 ET', status: 'done', lastRun: '2026-04-17T12:30:04-04:00', nextRun: '2026-04-18T12:30:00-04:00', summary: 'Stops updated, 0 new entries' },
    { id: 'close', name: 'End-of-Day Close', time: '16:10 ET', status: 'next', lastRun: '2026-04-16T16:10:00-04:00', nextRun: '2026-04-17T16:10:00-04:00', summary: 'In 2h 28m — closes all open positions' },
    { id: 'weekly', name: 'Weekly Review', time: 'Fri 16:30', status: 'scheduled', lastRun: '2026-04-11T16:30:00-04:00', nextRun: '2026-04-18T16:30:00-04:00', summary: 'Strategy drift check' },
  ],

  guards: {
    tradingEnabled: true,
    circuitBreakerTripped: false,
    dailyDrawdownPct: -0.42,
    dailyDrawdownLimit: -3.0,
    peakDrawdownPct: -0.68,
    peakDrawdownLimit: -5.0,
    consecLosses: 0,
    consecLossesLimit: 3,
    tradesLast10Min: 0,
    tradesLast10MinLimit: 5,
    openPositions: 2,
    maxOpenPositions: 3,
    dailyTrades: 2,
    maxDailyTrades: 10,
    maxOrderSize: 30000,
    minOrderSize: 500,
    cashReservePct: 54.3,
    cashReserveMin: 10,
  },

  strategyConfig: {
    strategyName: 'Momentum Breakout',
    approvedSymbols: ['SPY','QQQ','IWM','DIA','XLF','XLE','XLK','XLV','XLI','XLY'],
    hold_overnight: false,
    max_positions: 3,
    position_size_pct: 0.25,
    hard_stop_pct: 0.02,
    trailing_stop_pct: 0.03,
    take_profit_pct: 0.05,
    vix_threshold: 30,
    breakout_chase_limit_pct: 0.03,
    cash_floor_pct: 0.10,
  },

  tradeHistory: [
    { symbol: 'XLY', side: 'long', qty: 145, entry: 193.22, exit: 196.44, pnl: 466.90, pnlPct: 1.67, closedAt: '2026-04-16T16:10:00-04:00', reason: 'EOD close', duration: '6h 33m' },
    { symbol: 'SPY', side: 'long', qty: 52, entry: 509.88, exit: 512.10, pnl: 115.44, pnlPct: 0.44, closedAt: '2026-04-16T16:10:00-04:00', reason: 'EOD close', duration: '5h 12m' },
    { symbol: 'XLK', side: 'long', qty: 118, entry: 234.80, exit: 230.10, pnl: -554.60, pnlPct: -2.00, closedAt: '2026-04-15T11:42:00-04:00', reason: 'Hard stop', duration: '2h 07m' },
    { symbol: 'XLF', side: 'long', qty: 604, entry: 42.90, exit: 43.85, pnl: 573.80, pnlPct: 2.21, closedAt: '2026-04-15T16:10:00-04:00', reason: 'EOD close', duration: '6h 40m' },
    { symbol: 'QQQ', side: 'long', qty: 61, entry: 438.10, exit: 441.20, pnl: 189.10, pnlPct: 0.71, closedAt: '2026-04-14T16:10:00-04:00', reason: 'EOD close', duration: '6h 33m' },
    { symbol: 'XLE', side: 'long', qty: 284, entry: 90.40, exit: 94.92, pnl: 1283.68, pnlPct: 5.00, closedAt: '2026-04-11T14:22:00-04:00', reason: 'Take profit', duration: '4h 47m' },
    { symbol: 'DIA', side: 'long', qty: 66, entry: 385.20, exit: 383.50, pnl: -112.20, pnlPct: -0.44, closedAt: '2026-04-10T13:15:00-04:00', reason: 'Trailing stop', duration: '3h 40m' },
    { symbol: 'XLI', side: 'long', qty: 193, entry: 131.60, exit: 131.92, pnl: 61.76, pnlPct: 0.24, closedAt: '2026-04-09T16:10:00-04:00', reason: 'EOD close', duration: '6h 35m' },
  ],

  agentActivity: [
    { id: 'a1', ts: ago(12), symbol: 'QQQ', decision: 'HOLD', note: 'QQQ trekt door. High watermark naar $447.90. Trailing stop aangetrokken.', iconKind: 'accent' },
    { id: 'a2', ts: ago(12), symbol: 'XLK', decision: 'HOLD', note: 'XLK koelt even af. Nog boven alle stops. Ik wacht.', iconKind: 'muted' },
    { id: 'a3', ts: ago(15), symbol: 'XLY', decision: 'NO_GO', note: 'XLY zag er goed uit, maar ik zit vol — positiecap is 3.', iconKind: 'neg' },
    { id: 'a4', ts: ago(244), symbol: 'XLK', decision: 'BUY', note: 'XLK: trend + breakout + volume aligned. 122 shares in.', iconKind: 'pos' },
    { id: 'a5', ts: ago(245), symbol: 'QQQ', decision: 'BUY', note: 'QQQ breekt door de 5-day high met 1.12× volume. Instap genomen.', iconKind: 'pos' },
    { id: 'a6', ts: ago(246), symbol: 'XLE', decision: 'NO_GO', note: 'XLE bijna daar, maar nog 60 cent onder de breakout. Niet chasen.', iconKind: 'neg' },
  ],

  news: [
    { time: '10:42', sym: 'QQQ', headline: 'Fed minutes tonen hawkish toon; tech reageert neutraal' },
    { time: '10:15', sym: 'XLK', headline: 'Semiconductor orders stijgen 8% MoM volgens SEMI-rapport' },
    { time: '09:45', sym: 'SPY', headline: 'S&P 500 opent hoger na sterke ADP payrolls' },
    { time: '08:30', sym: 'XLE', headline: 'Olievoorraden dalen meer dan verwacht; energie geeft na' },
  ],

  threads: [
    {
      id: 't-005', kind: 'agent_initiated',
      title: 'Dinsdag-entries presteren 20% slechter — onderzoeken?',
      tags: ['#pattern', '#research'], status: 'open', unread: 2,
      createdAt: ago(38), lastAt: ago(38),
      messages: [
        { from: 'agent', at: ago(38), body: 'Ik zag net iets in de history. Onze laatste 14 entries op dinsdagen hebben een gemiddeld rendement van +0.24%, versus +0.92% op andere weekdagen. Kleine sample, maar het patroon is consistent genoeg dat ik het niet wil negeren.\n\nMogelijke oorzaken: Monday-overhang volume bias, gedempte openingsranges, options expiration effects eerder in de week. Wil je dat ik hier een research brief van maak? Ik zou 3 maanden data erbij pakken en kijken of het statistisch houdt.' },
      ],
    },
    {
      id: 't-004', kind: 'user_initiated',
      title: 'Semiconductors toevoegen aan universe?',
      tags: ['#universe', '#research'], status: 'open', unread: 0,
      createdAt: days(1), lastAt: ago(90),
      messages: [
        { from: 'user', at: days(1), body: 'Ik zie dat semiconductors de laatste weken heel sterk zijn. Kun je SMH en SOXX eens tegen elkaar zetten? Eventueel toevoegen.' },
        { from: 'agent', at: days(1), body: 'Gecheckt na market close gisteren. SMH toont sterker momentum (+4.2% 5-day) maar hogere volatiliteit. SOXX is liquider voor onze ordersize — gemiddelde spread 2 cent vs 5 cent bij SMH.\n\nBeide passen binnen onze 10-symbol cap alleen als we iets verwijderen. XLE heeft 6/10 losses afgelopen 30 dagen, logische kandidaat. Wil je dat ik een swap voorstel doe?' },
        { from: 'user', at: ago(92), body: 'Ja, stel voor. Maar eerst een week paper testen voor live.' },
        { from: 'agent', at: ago(90), body: 'Akkoord. Paper-trading vanaf maandag, review volgende vrijdag in de Weekly Review routine. Ik log beide universes parallel zodat we uitkomsten kunnen vergelijken.' },
      ],
    },
    {
      id: 't-003', kind: 'user_initiated',
      title: 'Waarom RSI-bovengrens op 75 en niet 80?',
      tags: ['#strategy', '#learn'], status: 'open', unread: 1,
      createdAt: days(2), lastAt: ago(220),
      messages: [
        { from: 'user', at: days(2), body: 'Ik zie dat RSI 75-80 regelmatig de reden is voor NO_GO. Is 75 niet te streng?' },
        { from: 'agent', at: ago(220), body: 'Goede vraag. De 75-grens komt uit de originele strategie — boven 75 is momentum historisch uitgeput en een pullback waarschijnlijker. Afgelopen 30 dagen: 12 NO_GOs wegens RSI>75, 8× volgde inderdaad een pullback >1% binnen 2 dagen (67% hit rate).\n\nIk zou een bredere backtest doen (6 maanden, verschillende regimes) voor ik adviseer het aan te passen. Wil je een research brief?' },
      ],
    },
    {
      id: 't-002', kind: 'agent_initiated',
      title: 'Halve dag voor Goede Vrijdag — wat doen we?',
      tags: ['#calendar', '#strategy'], status: 'closed', unread: 0,
      createdAt: days(3), lastAt: days(2),
      messages: [
        { from: 'agent', at: days(3), body: 'Morgen (Goede Vrijdag) is de markt dicht. Maar donderdag is een halve dag — close om 13:00 ET in plaats van 16:00. Mijn standaard close-routine om 16:10 zou te laat zijn.\n\nOpties: (1) close-routine vervroegen naar 12:50 voor één dag, (2) donderdag overslaan. Advies?' },
        { from: 'user', at: days(3), body: 'Optie 1. Vervroeg de close-routine. Gebruik dit patroon vaker — check de market calendar automatisch.' },
        { from: 'agent', at: days(2), body: 'Begrepen. Market calendar check toegevoegd aan de premarket-routine — detecteert halve dagen automatisch en schuift close op. Gemerkeerd als strategie-update.' },
      ],
    },
    {
      id: 't-001', kind: 'user_initiated',
      title: 'Let op earnings week voor tech',
      tags: ['#note'], status: 'closed', unread: 0,
      createdAt: days(5), lastAt: days(5),
      messages: [
        { from: 'user', at: days(5), body: 'Volgende week rapporteren meeste big tech. Wees voorzichtig met QQQ en XLK.' },
        { from: 'agent', at: days(5), body: 'Genoteerd. Earnings-filter staat al aan, maar ik zal extra streng zijn op momentum-entries deze week — volume moet >1.3× in plaats van 1.1×. Teruggezet naar normaal na earnings-week.' },
      ],
    },
  ],

  lessons: [
    { id: 'L-012', title: 'Niet chasen als breakout al 3%+ boven entry zit', description: 'Drie trades in de laatste twee weken waarbij ik te laat binnen was. Nieuwe regel: als de prijs al >3% boven de breakout-trigger staat, skip de setup.', category: 'entry', status: 'active', source: 'agent', confidence: 0.84, createdAt: '2026-04-10T14:22:00-04:00', lastAppliedAt: '2026-04-17T10:08:00-04:00', hits: 7, pnlImpact: 1842.30, pnlImpactSaved: true, trigger: { human: 'Als (prijs − breakout_trigger) / breakout_trigger > 3%', code: 'price > trigger * 1.03', gateLabel: 'Chase check' }, relatedTrades: [{ id: 'T-1134', symbol: 'TSLA', date: '2026-04-08', pnl: -418.20 }, { id: 'T-1127', symbol: 'SMH', date: '2026-04-03', pnl: -612.40 }] },
    { id: 'L-011', title: 'Geen nieuwe entries in earnings-week voor het aandeel', description: 'Earnings beweging is onvoorspelbaar en maakt technische setups onbetrouwbaar. Filter: als earnings binnen 5 handelsdagen valt, zet het aandeel op NO_GO.', category: 'risk', status: 'active', source: 'user', confidence: 0.95, createdAt: '2026-03-22T09:14:00-04:00', lastAppliedAt: '2026-04-16T09:40:00-04:00', hits: 12, pnlImpact: 2940.00, pnlImpactSaved: true, trigger: { human: 'Earnings date − today ≤ 5 trading days', code: 'daysUntilEarnings <= 5', gateLabel: 'Earnings buffer' }, relatedTrades: [] },
    { id: 'L-010', title: 'Trailing stop aantrekken na 2R winst', description: 'Wanneer een positie 2× de initiële risk heeft opgebouwd, trek de trailing stop naar break-even + 0.5R.', category: 'exit', status: 'active', source: 'agent', confidence: 0.78, createdAt: '2026-03-15T11:30:00-04:00', lastAppliedAt: '2026-04-17T12:15:00-04:00', hits: 9, pnlImpact: 1210.55, pnlImpactSaved: false, trigger: { human: 'Als unrealized_R ≥ 2, trail op entry + 0.5R', code: 'unrealizedR >= 2 => trail = entry + 0.5 * initialRisk', gateLabel: '2R trail-up' }, relatedTrades: [{ id: 'T-1142', symbol: 'QQQ', date: '2026-04-14', pnl: 890.10 }] },
    { id: 'L-009', title: 'Max 2 correlated sector-exposures tegelijk', description: 'Op 12 maart had ik QQQ, XLK en SMH open — allemaal tech/semis. Markt zakte, P&L tikte -2.1% op één dag.', category: 'risk', status: 'active', source: 'agent', confidence: 0.91, createdAt: '2026-03-13T16:45:00-04:00', lastAppliedAt: '2026-04-15T09:38:00-04:00', hits: 4, pnlImpact: 0, pnlImpactSaved: true, trigger: { human: 'Bij nieuwe entry: tel posities met ρ > 0.7 aan zelfde sector; skip als ≥ 2', code: 'sectorCorrelatedCount(ρ > 0.7) >= 2 => NO_GO', gateLabel: 'Sector cap' }, relatedTrades: [] },
    { id: 'L-008', title: 'Eerste 15 min: geen market orders', description: 'Spreads zijn wijd, volume onregelmatig, veel whipsaws. Tussen 09:30 en 09:45 alleen limit orders of geen entry.', category: 'entry', status: 'active', source: 'user', confidence: 1.0, createdAt: '2026-02-28T08:00:00-05:00', lastAppliedAt: '2026-04-17T09:32:00-04:00', hits: 18, pnlImpact: 840.00, pnlImpactSaved: true, trigger: { human: 'Tijd < 09:45 ET en order_type == market', code: 'minutesSinceOpen < 15 && orderType == "market"', gateLabel: 'Open buffer' }, relatedTrades: [] },
    { id: 'L-007', title: 'Revenge trading na 2 losses op rij: pauze 60 min', description: 'Patroon gezien: na twee losses op rij nam ik impulsieve entries zonder volledige checklist. Forceer nu 60 min cooldown.', category: 'psychology', status: 'active', source: 'agent', confidence: 0.72, createdAt: '2026-02-14T15:30:00-05:00', lastAppliedAt: '2026-04-09T13:20:00-04:00', hits: 3, pnlImpact: 410.00, pnlImpactSaved: true, trigger: { human: 'Laatste 2 closes < 0 => trading_lock(60 min)', code: 'lastTwoTrades.every(t => t.pnl < 0) => cooldown(60)', gateLabel: 'Cooldown' }, relatedTrades: [] },
    { id: 'L-005', title: 'VIX > 28: halveer positie-grootte', description: 'In hoge-vol regimes zijn mijn stops sneller geraakt. Halve size zorgt voor gelijk dollar-risico.', category: 'risk', status: 'paused', source: 'agent', confidence: 0.68, createdAt: '2026-01-10T11:00:00-05:00', lastAppliedAt: '2026-02-05T14:00:00-05:00', hits: 2, pnlImpact: -180.00, pnlImpactSaved: false, trigger: { human: 'VIX_spot > 28 bij entry', code: 'vix > 28 => size *= 0.5', gateLabel: 'Vol regime' }, relatedTrades: [] },
  ],

  lessonProposals: [
    { id: 'LP-003', title: 'Gap-up > 2%: wacht op pullback naar VWAP', description: 'Drie trades deze maand waar ik een gap-up chased en terugzakte naar VWAP. Suggestie: bij gap-up > 2% wachten tot prijs VWAP ± 0.3% raakt.', category: 'entry', confidence: 0.71, proposedAt: ago(54), relatedTrades: [{ id: 'T-1143', symbol: 'NVDA', date: '2026-04-15', pnl: -245.80 }, { id: 'T-1141', symbol: 'SMH', date: '2026-04-10', pnl: -188.40 }] },
    { id: 'LP-002', title: 'XLE en XLF lage hitrate — verlaag allocatie', description: 'Laatste 8 setups in XLE/XLF: 2 winnaars, 6 verliezers. Gem. R = -0.4.', category: 'risk', confidence: 0.62, proposedAt: ago(1290), relatedTrades: [{ id: 'T-1135', symbol: 'XLE', date: '2026-04-09', pnl: -290.00 }] },
  ],

  reports: [
    {
      id: 'R-2026-04-17', date: '2026-04-17', label: 'Vrijdag 17 april 2026',
      status: 'final',
      kpis: { sessionPnl: 5635.42, sessionPnlPct: 5.37, equityStart: 106132.70, equityEnd: 111768.12, tradesOpened: 2, tradesClosed: 0, winRate: null, avgR: null, maxDrawdown: -0.42 },
      summary: `Vanochtend een rustige start — VIX op 18.4, geen earnings in de watchlist. Om 09:37 nam ik QQQ op een breakout boven $440.50 met 1.12× volume, entry $441.82 voor 58 shares. Even later XLK op $238.44 (122 shares), ook een clean breakout.\n\nAllebei in range gebleven. Trailing stops zijn aangetikt naar break-even + 0.5R nadat QQQ 2R bereikte rond 12:15 (lesson L-010 in actie). XLK hangt nog lager in de range, hard stop blijft op $233.67.\n\nGeen nieuwe entries na 11:00 — de gap-up les (voorstel LP-003) hield me van een late NVDA-instap. Sessie eindigt +$5,635 (+5.4%).`,
      trades: [
        { id: 'T-1146', symbol: 'QQQ', side: 'BUY', qty: 58, entry: 441.82, exit: null, pnl: 269.70, pnlPct: 1.05, r: 1.0, time: '09:37:14', status: 'open', note: 'Breakout nam door met 1.12× volume.' },
        { id: 'T-1145', symbol: 'XLK', side: 'BUY', qty: 122, entry: 238.44, exit: null, pnl: -119.56, pnlPct: -0.41, r: -0.3, time: '09:52:03', status: 'open', note: 'Ietwat vroeg binnen, maar binnen stops.' },
      ],
      lessonsApplied: [
        { id: 'L-008', title: 'Eerste 15 min: geen market orders', hits: 1, outcome: 'Wachtte tot 09:37 voor QQQ entry (limit).' },
        { id: 'L-010', title: 'Trailing stop aantrekken na 2R winst', hits: 1, outcome: 'QQQ trail aangetrokken naar $434.46 om 12:15 na +2.1R.' },
      ],
      lessonsLearned: [{ id: 'LP-003', title: 'Gap-up > 2%: wacht op pullback naar VWAP', status: 'proposed', why: 'Drie recente chases die terugkwamen naar VWAP — patroon helder.' }],
      riskEvents: [{ time: '10:42', kind: 'info', text: 'VIX even naar 19.2 — geen actie nodig.' }],
      gates: [
        { label: 'Market regime', state: 'pass', note: 'VIX 18.4 < 30' },
        { label: 'Earnings buffer', state: 'pass', note: 'Geen earnings binnen 5 dagen' },
        { label: 'Cash floor', state: 'pass', note: '50.9% cash, floor = 10%' },
        { label: 'Sector cap', state: 'pass', note: 'Max 1 tech-positie geraakt (limit 2)' },
      ],
    },
    {
      id: 'R-2026-04-16', date: '2026-04-16', label: 'Donderdag 16 april 2026',
      status: 'final',
      kpis: { sessionPnl: -212.30, sessionPnlPct: -0.20, equityStart: 106345.00, equityEnd: 106132.70, tradesOpened: 1, tradesClosed: 1, winRate: 0, avgR: -0.5, maxDrawdown: -0.82 },
      summary: `Choppy dag. SPY was traag open, geen volume-confirmatie op de eerste breakouts. Om 10:14 nam ik IWM op $201.12 voor 41 shares, maar die tikte de stop aan om 14:22 voor -$168 (-0.8%, -0.5R). De les uit die trade: volume-ratio was 0.94 bij entry — onder mijn drempel van 1.1.\n\nGeen andere entries. Sessie -$212 (-0.2%), equity $106,132.`,
      trades: [{ id: 'T-1144', symbol: 'IWM', side: 'BUY', qty: 41, entry: 201.12, exit: 197.02, pnl: -168.10, pnlPct: -2.04, r: -0.5, time: '10:14', status: 'closed', note: 'Volume-ratio was maar 0.94 — niet ideaal.' }],
      lessonsApplied: [{ id: 'L-008', title: 'Eerste 15 min: geen market orders', hits: 1, outcome: 'Wachtte tot 10:14 — geen open-drift risk.' }],
      lessonsLearned: [],
      riskEvents: [{ time: '14:22', kind: 'stop', text: 'IWM hard stop geraakt op $197.02. -0.5R, binnen plan.' }],
      gates: [{ label: 'Market regime', state: 'pass', note: 'VIX 19.1 < 30' }, { label: 'Volume check', state: 'weak', note: 'IWM ratio 0.94 (limit 1.1)' }],
    },
    {
      id: 'R-2026-04-15', date: '2026-04-15', label: 'Woensdag 15 april 2026',
      status: 'final',
      kpis: { sessionPnl: 782.40, sessionPnlPct: 0.74, equityStart: 105562.60, equityEnd: 106345.00, tradesOpened: 2, tradesClosed: 2, winRate: 1.0, avgR: 1.0, maxDrawdown: -0.05 },
      summary: `Sterke dag. Twee posities genomen, allebei winners. XLK breakout om 09:48 bracht +$420 (+1.2R), SPY op 10:22 een kleinere maar schone 0.8R. Beide posities gesloten voor 15:00 op trailing stops.\n\nMarket was "risk on" — VIX naar 17.5, equal-weight indices leidend. De sector-spreiding-les (L-009) kwam langs toen ik overwoog om XLF ook te pakken — al 2 correlated long, dus skip. Goede discipline.`,
      trades: [
        { id: 'T-1143', symbol: 'XLK', side: 'BUY', qty: 120, entry: 237.10, exit: 240.60, pnl: 420.00, pnlPct: 1.48, r: 1.2, time: '09:48', status: 'closed', note: 'Clean breakout, 1.4× volume.' },
        { id: 'T-1142', symbol: 'SPY', side: 'BUY', qty: 85, entry: 511.80, exit: 516.02, pnl: 358.70, pnlPct: 0.82, r: 0.8, time: '10:22', status: 'closed', note: 'Gevolgd op macro-bounce.' },
      ],
      lessonsApplied: [{ id: 'L-009', title: 'Max 2 correlated sector-exposures tegelijk', hits: 1, outcome: 'XLF geskipt — al XLK + SPY long.' }],
      lessonsLearned: [],
      riskEvents: [],
      gates: [{ label: 'Market regime', state: 'pass', note: 'VIX 17.5 < 30' }, { label: 'Sector cap', state: 'engaged', note: 'XLF geblokkeerd, 2 correlated al open' }],
    },
  ],
};

export type Portfolio = typeof MOCK.portfolioActive;
export type Position = (typeof MOCK.portfolioActive.positions)[0];
export type Decision = (typeof MOCK.decisions)[0];
export type Routine = (typeof MOCK.routines)[0];
export type Thread = (typeof MOCK.threads)[0];
export type Lesson = (typeof MOCK.lessons)[0];
export type Report = (typeof MOCK.reports)[0];
