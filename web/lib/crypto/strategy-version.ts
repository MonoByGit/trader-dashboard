import crypto from 'crypto';
import cryptoStrategy from '@/crypto-strategy.json';

export function getCryptoStrategyVersion(): string {
  const v = (cryptoStrategy as { version?: string }).version;
  if (v && String(v).trim()) return String(v).trim();
  return crypto.createHash('sha256').update(JSON.stringify(cryptoStrategy)).digest('hex').slice(0, 12);
}
