// Telegram outbound notifications for Momentum.
// Uses the Cosmo Bot (outbound-only channel) via TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID.
// Every call is fail-safe: a notification failure must never break a trading routine.

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export function telegramConfigured(): boolean {
  return !!TOKEN && !!CHAT_ID;
}

/**
 * Send a plain-text message to Dusty's Telegram. Never throws.
 * Returns true if the message was accepted by Telegram.
 */
export async function sendMessage(text: string): Promise<boolean> {
  if (!telegramConfigured()) {
    console.warn('[telegram] not configured (TELEGRAM_BOT_TOKEN/CHAT_ID missing), skipping:', text.slice(0, 80));
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.error('[telegram] send failed:', res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error('[telegram] send error:', e);
    return false;
  }
}

// --- Message builders (Nederlands, Mono-stijl, geen em-dashes) ---

export function buyMessage(symbol: string, qty: number, price: number, stop: number, takeProfit: number): string {
  return [
    `<b>Momentum kocht ${qty}x ${symbol}</b> op $${price.toFixed(2)}.`,
    `Hard stop $${stop.toFixed(2)} (-2%), take profit $${takeProfit.toFixed(2)} (+5%).`,
    `Beide staan als bracket-order bij Alpaca, dus ze vuren automatisch.`,
  ].join('\n');
}

export function stopHitMessage(symbol: string, price: number, pnl?: number): string {
  const base = `<b>${symbol} stop geraakt</b> op $${price.toFixed(2)}.`;
  if (pnl == null) return `${base} Realized P&amp;L volgt in de EOD-samenvatting.`;
  const sign = pnl >= 0 ? '+' : '';
  return `${base} P&amp;L ${sign}$${pnl.toFixed(2)}.`;
}

export function killSwitchMessage(enabled: boolean, who = 'Dusty'): string {
  return enabled
    ? `<b>Kill switch UIT gezet</b> door ${who}. Trading is weer actief.`
    : `<b>Kill switch AAN gezet</b> door ${who}. Alle nieuwe orders zijn gestopt.`;
}

export function eodDigestMessage(equityStart: number, equityEnd: number, closed: string[], narrative: string): string {
  const pnl = equityEnd - equityStart;
  const pct = equityStart > 0 ? (pnl / equityStart) * 100 : 0;
  const sign = pnl >= 0 ? '+' : '';
  const head = `<b>EOD ${new Date().toLocaleDateString('nl-NL')}</b>\nDag P&amp;L ${sign}$${pnl.toFixed(2)} (${sign}${pct.toFixed(2)}%). Equity $${equityEnd.toFixed(0)}.`;
  const positions = closed.length ? `\nGesloten: ${closed.join(', ')}.` : `\nGeen posities gesloten.`;
  // Keep the narrative short for Telegram.
  const reflection = narrative ? `\n\n${narrative.slice(0, 600)}` : '';
  return head + positions + reflection;
}
