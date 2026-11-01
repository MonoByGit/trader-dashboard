import { alpaca } from '@/lib/alpaca';
import { agentNewsLookup, AiJsonParseError, claudeJsonArray, claudeText, MODELS } from '@/lib/ai';
import { dbQuery, dbRun, initDb, hasDb } from '@/lib/db';
import { saveDecision } from '@/lib/decisions';
import { registerRoutineHandler } from '@/lib/routine-dispatch';
import { syncRecentOrders } from '@/lib/orders-store';
import { writeDailySnapshot } from '@/lib/snapshots';
import { sendMessage, buyMessage, stopHitMessage, eodDigestMessage } from '@/lib/telegram';
import { captureEvent } from '@/lib/openbrain';
import { computePositionSize } from '@/lib/sizing';
import { openOrAppendThread } from '@/lib/threads';
import {
  checkOrderAgainstLimits,
  countDailyTrades,
  getEffectiveGuardConfig,
  logGuardEvent,
  refreshCircuitBreaker,
} from '@/lib/guards/service';
import { blocksNewEntries, planEodClose, loadGuardConfig } from '@guards/index';
import { getActiveStrategyContent } from '@/lib/strategy-versions';
import type { StrategyContent } from '../../src/strategy/content';
import {
  checkLessonsForBuy,
  getActiveLessons,
  marketOpenLessonsSystemSuffix,
  recordLessonInfluence,
} from '@/lib/lessons';
import { postMortemFromEodClose, postMortemFromFilledSell } from '@/lib/postmortem';
import { hasOpenBuyOrderForSymbol, isStopFill, isTakeProfitFill } from '@/lib/alpaca-orders';
import { flattenEtfPositionAtEod } from '@/lib/eod-flatten';
import { loadPremarketDecisionsForTradingDate } from '@/lib/premarket-store';
import { premarketApprovedBuySymbols } from '../../src/strategy/market-open-premarket';
import { nextDailyTradeCount } from '../../src/guards/daily-trades';
import { tradingDateEt } from '@scheduler/decide';
import { runWeeklyReview } from '@/lib/weekly-review';
import strategy from '@/strategy.json';
import { filterByAssetClass } from '@/lib/asset-class';
import { snapshotFromDailyBars } from '../../src/indicators/live-snapshot';
import {
  applyPremarketDecisionRules,
  momentumRsiRuleText,
  newsContextPrompt,
  newsIsUsable,
} from '../../src/strategy/premarket-decisions';
import { loadVolStressSnapshot } from '@/lib/vol-stress';
import { isSoftStartEnabled } from '@/lib/strategy-versions';

async function liveStrategy(): Promise<StrategyContent> {
  try {
    return await getActiveStrategyContent();
  } catch {
    return strategy as StrategyContent;
  }
}

// Detect filled stop-loss legs today and ping Telegram once per order.
// Dedup uses the settings table (key = notified:<orderId>) so midday and eod
// never double-notify. Fully fail-safe.
async function notifyStopFills() {
  if (!hasDb()) return;
  try {
    await initDb();
    const orders = await alpaca.orders(50);
    const today = new Date().toISOString().split('T')[0];
    for (const o of orders) {
      if (o.side !== 'sell' || o.status !== 'filled' || !o.filled_at) continue;
      if (!o.filled_at.startsWith(today)) continue;
      const isStop = isStopFill(o);
      const isTp = isTakeProfitFill(o);
      if (!isStop && !isTp) continue;
      const key = `notified:${o.id}`;
      const seen = await dbQuery(`SELECT 1 FROM settings WHERE key=$1`, [key]);
      if (seen.length) continue;
      const exit = parseFloat(o.filled_avg_price ?? o.stop_price ?? '0');
      if (isStop) await sendMessage(stopHitMessage(o.symbol, exit));
      await postMortemFromFilledSell(o, isStop ? 'stop' : 'take_profit').catch((e) => console.error('[postMortem]', e));
      await dbRun(`INSERT INTO settings (key, value) VALUES ($1, '1') ON CONFLICT (key) DO NOTHING`, [key]);
    }
  } catch (e) {
    console.error('[notifyStopFills]', e);
  }
}

async function runPremarket() {
  const strat = await liveStrategy();
  const watchlist = strat.symbols;
  const accountEarly = await alpaca.account();
  await refreshCircuitBreaker(parseFloat(accountEarly.equity));
  const [barsData, account, positions, clock] = await Promise.all([
    alpaca.bars(watchlist, '1Day', 30),
    alpaca.account(),
    alpaca.positions(),
    alpaca.clock(),
  ]);

  const bars = barsData.bars ?? {};
  const equity = parseFloat(account.equity);
  const openSymbols = positions.map(p => p.symbol);

  const volStress = await loadVolStressSnapshot();
  const snapshots = watchlist
    .map((symbol) => snapshotFromDailyBars(symbol, bars[symbol] ?? []))
    .filter(Boolean);

  const newsPrompt = `Today ${new Date().toISOString().split('T')[0]}. For ETFs ${watchlist.join(',')}: any earnings risks or major negative news TODAY? JSON only: {"QQQ":"safe/risky: reason",...}`;
  const newsResult = await agentNewsLookup(newsPrompt, {
    routine: 'premarket-news',
    assetClass: 'etf',
  });
  const news = newsResult.json;
  const newsUsable = newsIsUsable(newsResult.status);
  if (newsResult.error) {
    console.error('[premarket] news pre-call failed:', newsResult.error);
  } else if (!newsUsable) {
    console.warn('[premarket] news pre-call unusable', {
      status: newsResult.status,
      finishReason: newsResult.finishReason,
    });
  }

  const softStartEnabled = await isSoftStartEnabled();
  const rsiMin = strat.rules.rsi_min ?? 50;
  const rsiMax = strat.rules.rsi_max ?? 75;

  let decisions: Record<string, unknown>[];
  try {
    decisions = await claudeJsonArray<Record<string, unknown>>(
      MODELS.sonnet,
      `Je bent Momentum. Strategie: ${strat.name}. Equity: $${equity.toFixed(0)}. Open: ${openSymbols.join(',') || 'geen'}.
Criteria: trend_above_sma20, ${momentumRsiRuleText(rsiMin, rsiMax)}, volume_above_avg(>1.1), vix_below_limit (VIXY stress ratio ≤ ${volStress.maxRatio}, nu ${volStress.ratio?.toFixed(2) ?? 'n/a'}), no_earnings_risk, news_sentiment (pass|fail|unknown).
Max ${strat.rules.max_positions} posities. Geen BUY voor al open symbolen.`,
      `${newsContextPrompt(newsResult.status)}\nVol stress: ${JSON.stringify(volStress)}\nData:\n${JSON.stringify(snapshots)}\nNieuws:\n${news}\nGeef JSON-object: {"decisions":[{"symbol":"QQQ","decision":"BUY"|"HOLD"|"NO_GO","criteria":{...pass/fail/unknown},"rationale":"2 zinnen","agentNote":"1 zin","confidence":0.0-1.0}]}`,
    );
  } catch (e) {
    const msg = e instanceof AiJsonParseError ? e.message : String(e);
    console.error('[premarket] AI call failed — marking run failed for retry:', msg);
    throw new Error(`[premarket] ${msg}`);
  }

  const normalized: Record<string, unknown>[] = [];
  for (const d of decisions) {
    const symbol = String(d.symbol ?? '');
    const snap = snapshots.find((s) => s && s.symbol === symbol);
    const ruled = applyPremarketDecisionRules(
      {
        symbol,
        decision: String(d.decision ?? 'NO_GO'),
        criteria: (d.criteria as Record<string, unknown>) ?? {},
      },
      {
        newsUsable,
        softStartEnabled,
        rsi: snap?.rsi ?? null,
        rsiMin,
        rsiMax,
      },
    );
    const row = { ...d, decision: ruled.decision, criteria: ruled.criteria };
    normalized.push(row);
    await saveDecision({ routine: 'premarket', ...row });
  }

  return {
    routine: 'premarket',
    decisions: normalized,
    newsStatus: newsResult.status,
    equity,
    openPositions: openSymbols,
    marketOpen: clock.is_open,
  };
}

async function runMarketOpen() {
  const strat = await liveStrategy();
  const watchlist = strat.symbols;
  const [account, positions, clock] = await Promise.all([
    alpaca.account(),
    alpaca.positions(),
    alpaca.clock(),
  ]);

  if (!clock.is_open) return { skipped: true, reason: 'Market closed' };

  const equity = parseFloat(account.equity);
  const availableCash = parseFloat(account.cash);
  const guardState = await refreshCircuitBreaker(equity);
  if (blocksNewEntries({
    routine: 'market-open',
    emergencyStop: guardState.emergencyStop,
    tradingEnabled: guardState.tradingEnabled,
    circuitBreakerTripped: guardState.circuitBreakerTripped,
  })) {
    const reason = guardState.emergencyStop
      ? 'Emergency stop active'
      : guardState.circuitBreakerTripped
        ? `Circuit breaker: ${guardState.circuitBreakerReason ?? 'tripped'}`
        : 'Kill switch activated';
    return { skipped: true, reason };
  }

  const etfPositions = filterByAssetClass(positions, 'etf');
  const openSymbols = etfPositions.map(p => p.symbol);
  const totalExposure = etfPositions.reduce((s, p) => s + parseFloat(p.market_value), 0);
  let dailyTrades = await countDailyTrades();
  const config = await getEffectiveGuardConfig();

  if (openSymbols.length >= config.maxPositions) {
    return { skipped: true, reason: 'Max ETF positions reached' };
  }

  const barsData = await alpaca.bars(watchlist, '1Day', 30);
  const bars = barsData.bars ?? {};

  const tradingDate = tradingDateEt(Date.now());
  const premarketRows = await loadPremarketDecisionsForTradingDate(tradingDate);
  const rsiMinOpen = strat.rules.rsi_min ?? 50;
  const rsiMaxOpen = strat.rules.rsi_max ?? 75;
  const rsiBySymbol: Record<string, number> = {};
  for (const s of watchlist) {
    const b = bars[s] ?? [];
    if (b.length >= 15) {
      const snap = snapshotFromDailyBars(s, b);
      if (snap?.rsi != null) rsiBySymbol[s] = snap.rsi;
    }
  }
  const approvedPremarket = new Set(
    premarketApprovedBuySymbols(premarketRows, {
      newsUsable: true,
      rsiBySymbol,
      rsiMin: rsiMinOpen,
      rsiMax: rsiMaxOpen,
    }),
  );

  // Last known prices for server-side position sizing guard
  const lastPrices: Record<string, number> = {};
  for (const s of watchlist) {
    const b = bars[s] ?? [];
    if (b.length > 0) lastPrices[s] = b[b.length - 1].c;
  }

  const activeLessons = await getActiveLessons();
  const lessonSuffix = marketOpenLessonsSystemSuffix(activeLessons);

  let candidates: { symbol: string; action: 'buy' | 'skip'; qty: number; reason: string }[];
  try {
    candidates = await claudeJsonArray<{ symbol: string; action: 'buy' | 'skip'; qty: number; reason: string }>(
      MODELS.sonnet,
      `Je bent Momentum. Bepaal entry orders. Equity: $${equity.toFixed(0)}. Al open: ${openSymbols.join(',') || 'geen'}. Max ${strat.rules.max_positions} posities. Position size: ${(strat.rules.position_size_pct ?? 0.25) * 100}% equity. Cash floor: ${(strat.rules.cash_floor_pct ?? 0.1) * 100}%.${lessonSuffix}`,
      `Bars data:\n${JSON.stringify(Object.fromEntries(watchlist.map(s => [s, (bars[s] ?? []).slice(-5)])))}\nGeef JSON-object: {"candidates":[{"symbol":"QQQ","action":"buy","qty":25,"reason":"reden"}]}`,
    );
  } catch (e) {
    const msg = e instanceof AiJsonParseError ? e.message : String(e);
    console.error('[market-open] AI call failed — marking run failed for retry:', msg);
    throw new Error(`[market-open] ${msg}`);
  }

  const orders: { symbol: string; qty: number; orderId: string; stop?: number; takeProfit?: number }[] = [];
  const skippedNotPremarket: string[] = [];
  for (const c of candidates) {
    if (c.action !== 'buy' || openSymbols.includes(c.symbol)) continue;
    if (!approvedPremarket.has(c.symbol)) {
      skippedNotPremarket.push(c.symbol);
      await saveDecision({
        routine: 'market-open',
        symbol: c.symbol,
        decision: 'NO_GO',
        rationale: 'Geen premarket BUY met alle zes criteria voor vandaag.',
        agentNote: 'Market-open gebonden aan premarket besluit.',
        confidence: 0,
      });
      continue;
    }
    if (openSymbols.length + orders.length >= config.maxPositions) break;

    const tradeSlot = nextDailyTradeCount(dailyTrades, config.maxDailyTrades);
    if (!tradeSlot.allowed) {
      await saveDecision({
        routine: 'market-open',
        symbol: c.symbol,
        decision: 'NO_GO',
        rationale: `Max daily trades (${config.maxDailyTrades}) reached`,
        agentNote: 'Portfolio limits guard rejected order.',
        confidence: 0,
      });
      break;
    }

    if (await hasOpenBuyOrderForSymbol(c.symbol)) {
      await saveDecision({
        routine: 'market-open',
        symbol: c.symbol,
        decision: 'NO_GO',
        rationale: 'Open buy order already exists for symbol.',
        agentNote: 'Idempotency: skip duplicate entry.',
        confidence: 0,
      });
      continue;
    }

    // Volatility-targeting position sizing (vervangt de vaste 25%-cap).
    // Bepaalt de grootte op basis van de beweeglijkheid van het symbool, met
    // de basis-cap, een fractionele Kelly-limiet en de cash-bodem als grenzen.
    // (Kelly-historie volgt zodra er genoeg gesloten trades zijn; tot dan
    // sized het op vol-target of de basis-cap.)
    const lastPrice = lastPrices[c.symbol];
    if (!lastPrice) {
      await saveDecision({ routine: 'market-open', symbol: c.symbol, decision: 'NO_GO', rationale: 'Geen prijsdata beschikbaar.', agentNote: 'Sizing overgeslagen, geen laatste prijs.', confidence: 0 });
      continue;
    }
    const sizing = computePositionSize({
      symbol: c.symbol,
      closes: (bars[c.symbol] ?? []).map((b: { c: number }) => b.c),
      price: lastPrice,
      equity,
      availableCash,
      maxPositionSizePct: config.maxPositionSizePct,
    });
    if (sizing.shares <= 0) {
      await saveDecision({ routine: 'market-open', symbol: c.symbol, decision: 'NO_GO', rationale: sizing.note, agentNote: sizing.note, confidence: 0 });
      continue;
    }
    c.qty = sizing.shares;

    const orderValue = c.qty * lastPrice;
    const symbolExposure = etfPositions
      .filter(p => p.symbol === c.symbol)
      .reduce((s, p) => s + parseFloat(p.market_value), 0);
    const limits = await checkOrderAgainstLimits({
      equity,
      cash: availableCash,
      openPositionCount: openSymbols.length + orders.length,
      dailyTrades,
      proposedOrderValueUsd: orderValue,
      currentSymbolExposureUsd: symbolExposure,
      totalExposureUsd: totalExposure + orders.reduce((s, o) => s + o.qty * (lastPrices[o.symbol] ?? 0), 0),
    });
    if (!limits.allowed) {
      await saveDecision({
        routine: 'market-open',
        symbol: c.symbol,
        decision: 'NO_GO',
        rationale: limits.failReasons.join('; '),
        agentNote: 'Portfolio limits guard rejected order.',
        confidence: 0,
      });
      await logGuardEvent('portfolio_limits', limits.failReasons.join('; '), {
        symbol: c.symbol,
        orderValue,
      });
      continue;
    }

    const gate = await checkLessonsForBuy(c.symbol, c.reason, activeLessons);
    if (gate.veto) {
      const decId = await saveDecision({
        routine: 'market-open',
        symbol: c.symbol,
        decision: 'NO_GO',
        rationale: gate.reason || 'Geblokkeerd door goedgekeurde les.',
        agentNote: `Lesson gate veto${gate.lessonId ? ` (${gate.lessonId})` : ''}.`,
        confidence: 0.9,
      });
      const vetoIds = gate.influencedLessonIds.length
        ? gate.influencedLessonIds
        : gate.lessonId
          ? [gate.lessonId]
          : [];
      await recordLessonInfluence(vetoIds, decId, c.symbol, 'veto');
      continue;
    }

    // Broker-enforced hard stop (2%) and take profit (5%) via bracket order.
    // These fire at Alpaca even if no cron runs — the hard stop is never bypassable.
    const stopPrice = +(lastPrice * (1 - strat.rules.hard_stop_pct)).toFixed(2);
    const takeProfitPrice = +(lastPrice * (1 + strat.rules.take_profit_pct)).toFixed(2);

    try {
      const order = await alpaca.placeOrder({
        symbol: c.symbol, qty: c.qty, side: 'buy',
        type: 'market', time_in_force: 'day',
        order_class: 'bracket',
        stop_loss: { stop_price: stopPrice },
        take_profit: { limit_price: takeProfitPrice },
      });
      orders.push({ symbol: c.symbol, qty: c.qty, orderId: order.id, stop: stopPrice, takeProfit: takeProfitPrice });
      dailyTrades = tradeSlot.next;
      const decId = await saveDecision({
        routine: 'market-open', symbol: c.symbol, decision: 'BUY', rationale: c.reason,
        agentNote: `${sizing.note} Bracket: hard stop $${stopPrice}, take profit $${takeProfitPrice}. ${gate.reason ? `Lessons: ${gate.reason}. ` : ''}${c.reason}`,
        confidence: 0.8, orderId: order.id,
      });
      if (gate.influencedLessonIds.length) {
        await recordLessonInfluence(gate.influencedLessonIds, decId, c.symbol, 'passed_check');
      } else if (activeLessons.length) {
        await recordLessonInfluence(
          activeLessons.map((l) => l.id),
          decId,
          c.symbol,
          'prompt',
        );
      }
      await sendMessage(buyMessage(c.symbol, c.qty, lastPrice, stopPrice, takeProfitPrice));
      // Verankering: open een draad bij elke nieuwe positie (beurt -> Dusty).
      await openOrAppendThread({
        title: `Nieuwe positie: ${c.symbol}`,
        type: 'gesprek',
        anchorType: 'decision', anchorId: decId,
        summary: `BUY ${c.qty} ${c.symbol} @ $${lastPrice} · stop $${stopPrice} · target $${takeProfitPrice}`,
        tags: [`#${c.symbol.toLowerCase()}`, '#positie'],
        body: `Ik heb ${c.qty} ${c.symbol} gekocht rond $${lastPrice}. ${c.reason}\n\nMijn harde stop ligt op $${stopPrice} (-2%) en de take-profit op $${takeProfitPrice} (+5%). Wil je dat ik iets aan deze positie verander, of zal ik hem laten lopen?`,
      }).catch(() => {});
    } catch (e) {
      const decId = await saveDecision({ routine: 'market-open', symbol: c.symbol, decision: 'NO_GO', rationale: String(e), agentNote: 'Order mislukt.', confidence: 0 });
      // Verankering: een gefaalde order is een opvallende beslissing.
      await openOrAppendThread({
        title: `Order mislukt: ${c.symbol}`,
        type: 'gesprek', priority: 'hoog',
        anchorType: 'decision', anchorId: decId,
        summary: `NO_GO ${c.symbol} · order faalde`,
        tags: [`#${c.symbol.toLowerCase()}`, '#nogo'],
        body: `Ik wilde ${c.symbol} kopen, maar de order faalde: ${String(e)}. Ik heb niets ingelegd. Wil je dat ik het later opnieuw probeer?`,
      }).catch(() => {});
    }
  }
  return {
    routine: 'market-open',
    orders,
    premarketApproved: Array.from(approvedPremarket),
    skippedNotPremarket,
  };
}

async function runMidday() {
  const strat = await liveStrategy();
  const account = await alpaca.account();
  await refreshCircuitBreaker(parseFloat(account.equity));
  await notifyStopFills();
  const positions = await alpaca.positions();
  if (positions.length === 0) return { routine: 'midday', note: 'Geen posities.' };
  const notes = positions.map(p => `${p.symbol}: entry $${p.avg_entry_price}, now $${p.current_price}, P&L ${p.unrealized_pl}`);
  const note = await claudeText(MODELS.sonnet,
    `Je bent Momentum. Midday check. Geef een korte update (max 2 zinnen per positie) over de status van de stops en of actie nodig is. Schrijf in het Nederlands.`,
    notes.join('\n'), 512);
  for (const p of positions) {
    await saveDecision({ routine: 'midday', symbol: p.symbol, decision: 'HOLD', rationale: note, agentNote: `Stop: $${(parseFloat(p.current_price) * (1 - (strat.rules.trailing_stop_pct ?? 0.03))).toFixed(2)}`, confidence: 0.9 });
  }
  return { routine: 'midday', positions: positions.length, note };
}

async function runEod() {
  await notifyStopFills();
  const [clock, allPositions] = await Promise.all([alpaca.clock(), alpaca.positions()]);
  const positions = filterByAssetClass(allPositions, 'etf');
  const guardConfig = loadGuardConfig();
  const eodPlan = planEodClose(clock, positions.length > 0, guardConfig);
  const closed: string[] = [];
  const eodNote = eodPlan.reason;

  const flattenFailures: string[] = [];
  if (eodPlan.action === 'flatten') {
    for (const p of positions) {
      const qty = parseFloat(p.qty);
      const entry = parseFloat(p.avg_entry_price);
      const exitPx = parseFloat(p.current_price);
      const result = await flattenEtfPositionAtEod(p.symbol);
      if (result.ok) {
        closed.push(p.symbol);
        await saveDecision({
          routine: 'eod',
          symbol: p.symbol,
          decision: 'CLOSE',
          rationale: 'EOD — geen overnight holding per strategie.',
          agentNote: `Gesloten op $${p.current_price}`,
          confidence: 1,
        });
        await postMortemFromEodClose(p.symbol, qty, entry, exitPx).catch((e) => console.error('[postMortem eod]', e));
      } else {
        flattenFailures.push(`${p.symbol}: ${result.error}`);
        await saveDecision({
          routine: 'eod',
          symbol: p.symbol,
          decision: 'HOLD',
          rationale: 'EOD flatten mislukt — positie mogelijk nog open.',
          agentNote: result.error,
          confidence: 1,
        });
      }
    }
  } else if (positions.length > 0) {
    await logGuardEvent('eod_clock', eodPlan.reason, {
      action: eodPlan.action,
      symbols: positions.map(p => p.symbol),
    });
    for (const p of positions) {
      await saveDecision({
        routine: 'eod',
        symbol: p.symbol,
        decision: 'HOLD',
        rationale: 'EOD flatten overgeslagen — bracket stops blijven actief.',
        agentNote: eodPlan.reason,
        confidence: 1,
      });
    }
  }

  const account = await alpaca.account();
  await refreshCircuitBreaker(parseFloat(account.equity));

  let guardEventsSummary = '';
  if (hasDb()) {
    await initDb();
    const events = await dbQuery<{ kind: string; reason: string }>(
      `SELECT kind, reason FROM guard_events
       WHERE (ts AT TIME ZONE 'America/New_York')::date = (NOW() AT TIME ZONE 'America/New_York')::date
       ORDER BY ts DESC LIMIT 10`
    );
    if (events.length) {
      guardEventsSummary = `\nGuard events vandaag:\n${events.map(e => `- ${e.kind}: ${e.reason}`).join('\n')}`;
    }
  }
  const equity = parseFloat(account.equity);
  const lastEquity = parseFloat(account.last_equity);
  const report = await claudeText(MODELS.sonnet,
    'Je bent Momentum. Schrijf een EOD rapport in het Nederlands. Max 3 alinea\'s. Wat is er gebeurd, wat zijn de lessen, wat kijk ik naar morgen.',
    `Dag P&L: $${(equity - lastEquity).toFixed(2)} (${((equity - lastEquity) / lastEquity * 100).toFixed(2)}%). Equity: $${lastEquity.toFixed(0)} → $${equity.toFixed(0)}. Gesloten: ${closed.join(', ') || 'niets'}. EOD: ${eodNote}.${guardEventsSummary}`,
    1024);

  const reportId = `report-${Date.now()}`;
  if (hasDb()) {
    await initDb();
    await dbRun(
      `INSERT INTO agent_reports (id, date, generated_at, kpis, narrative) VALUES ($1,NOW()::DATE,NOW(),$2,$3)`,
      [reportId, JSON.stringify({ equityStart: lastEquity, equityEnd: equity, closed }), report]
    );
  }

  // Daily Telegram digest.
  await sendMessage(eodDigestMessage(lastEquity, equity, closed, report));

  // Significant P&L event to Open Brain (drawdown or spike beyond 1.5%).
  const dayPct = lastEquity > 0 ? ((equity - lastEquity) / lastEquity) * 100 : 0;
  if (Math.abs(dayPct) >= 1.5) {
    await captureEvent(
      `Dag-P&L ${dayPct >= 0 ? '+' : ''}${dayPct.toFixed(2)}% ($${(equity - lastEquity).toFixed(2)}). Equity $${lastEquity.toFixed(0)} naar $${equity.toFixed(0)}. Gesloten: ${closed.join(', ') || 'niets'}.`
    );
  }

  // Verankering: open een draad bij het dagrapport (beurt -> Dusty).
  const bigDay = Math.abs(dayPct) >= 1.5;
  await openOrAppendThread({
    title: `Dagrapport ${new Date().toLocaleDateString('nl-NL')}`,
    type: 'gesprek', priority: bigDay ? 'hoog' : 'normaal',
    anchorType: 'report', anchorId: reportId,
    summary: `P&L ${dayPct >= 0 ? '+' : ''}${dayPct.toFixed(2)}% · ${closed.length} gesloten`,
    tags: ['#dagrapport'],
    body: `${report}\n\nResultaat vandaag: ${dayPct >= 0 ? '+' : ''}${dayPct.toFixed(2)}%. ${bigDay ? 'Dit was een opvallende dag. ' : ''}Wil je dat ik ergens dieper op inga?`,
  }).catch(() => {});

  await syncRecentOrders().catch((e) => console.error('[syncOrders]', e));
  const snap = await writeDailySnapshot().catch((e) => {
    console.error('[dailySnapshot]', e);
    return null;
  });

  const sleeveNote = snap?.sleeves
    ? `\nSleeves: ETF ${snap.sleeves.etf.equityUsd.toFixed(0)} (${snap.sleeves.etf.dailyReturnPct?.toFixed(2) ?? '—'}% vs SPY ${snap.sleeves.etf.benchmarkDailyReturnPct?.toFixed(2) ?? '—'}%) · Crypto ${snap.sleeves.crypto.equityUsd.toFixed(0)} (${snap.sleeves.crypto.dailyReturnPct?.toFixed(2) ?? '—'}% vs BTC ${snap.sleeves.crypto.benchmarkDailyReturnPct?.toFixed(2) ?? '—'}%) · Totaal ${snap.equity.toFixed(0)}.`
    : '';

  return {
    routine: 'eod',
    closed,
    flattenFailures,
    equity,
    eodPlan: eodPlan.action,
    report: report.slice(0, 200),
    sleeves: snap?.sleeves ?? null,
    sleeveNote,
  };
}

registerRoutineHandler('premarket', runPremarket);
registerRoutineHandler('market-open', runMarketOpen);
registerRoutineHandler('midday', runMidday);
registerRoutineHandler('eod', runEod);
registerRoutineHandler('weekly', runWeeklyReview);
