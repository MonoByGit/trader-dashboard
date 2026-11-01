import crypto from 'crypto';
import strategy from '@/strategy.json';

/** Sync label from strategy.json (fallback when DB unavailable). */
export function getStrategyVersion(): string {
  const v = (strategy as { version?: string }).version;
  if (v && String(v).trim()) return String(v).trim();
  return crypto.createHash('sha256').update(JSON.stringify(strategy)).digest('hex').slice(0, 12);
}
