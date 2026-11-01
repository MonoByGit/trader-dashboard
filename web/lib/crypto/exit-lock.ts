import { randomUUID } from 'crypto';
import { dbQuery, dbRun, hasDb } from '@/lib/db';
import { ensureSchema } from '@/lib/migrate';
import { alpacaPositionSymbol } from '../../../src/alpaca/symbol-path';
import { logGuardEvent } from '@/lib/guards/service';

const inProcessExitLocks = new Set<string>();

export function exitLockKey(symbol: string): string {
  return `crypto_exit_lock:${alpacaPositionSymbol(symbol)}`;
}

export async function acquireExitLock(symbol: string): Promise<{ acquired: boolean; owner: string | null }> {
  const compact = alpacaPositionSymbol(symbol);
  if (inProcessExitLocks.has(compact)) {
    await logGuardEvent('crypto_exit_locked', 'In-process exit lock held', { symbol });
    return { acquired: false, owner: null };
  }

  const owner = randomUUID();
  inProcessExitLocks.add(compact);
  try {
    if (hasDb()) {
      await ensureSchema();
      const rows = await dbQuery<{ key: string }>(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value, updated_at = NOW()
         WHERE settings.updated_at < NOW() - INTERVAL '2 minutes'
         RETURNING key`,
        [exitLockKey(symbol), owner],
      );
      if (!rows.length) {
        inProcessExitLocks.delete(compact);
        await logGuardEvent('crypto_exit_locked', 'Exit lock held by another worker', { symbol });
        return { acquired: false, owner: null };
      }
    }
    return { acquired: true, owner };
  } catch (e) {
    inProcessExitLocks.delete(compact);
    throw e;
  }
}

export async function releaseExitLock(symbol: string, owner: string): Promise<void> {
  const compact = alpacaPositionSymbol(symbol);
  inProcessExitLocks.delete(compact);
  if (!hasDb()) return;
  await dbRun(`DELETE FROM settings WHERE key=$1 AND value=$2`, [exitLockKey(symbol), owner]);
}

/** Test helper */
export function clearInProcessExitLocksForTests(): void {
  inProcessExitLocks.clear();
}
