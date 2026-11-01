/**
 * Integration-style tests (mocked I/O) for PR 31 blockers.
 * @jest-environment node
 */
import { jest } from '@jest/globals';

describe('PR31 integration (mocked)', () => {
  it('tryBeginRoutineRun returns slotKey and verifyRoutineRunLock respects owner', async () => {
    jest.resetModules();
    const locks = new Map<string, { run_id: string }>();
    const mockQuery = async (sql: string, params?: unknown[]) => {
      if (sql.includes('FOR UPDATE') && sql.includes('acquired_at > NOW()')) {
        const key = `${params?.[0]}:${params?.[1]}`;
        return { rows: locks.has(key) ? [locks.get(key)] : [], rowCount: locks.has(key) ? 1 : 0 };
      }
      if (sql.includes('INSERT INTO routine_run_locks')) {
        const key = `${params?.[0]}:${params?.[1]}`;
        if (locks.has(key)) return { rows: [], rowCount: 0 };
        locks.set(key, { run_id: params?.[2] as string });
        return { rows: [{ run_id: params?.[2] }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO routine_runs')) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('SELECT 1') && sql.includes('run_id = $1')) {
        const runId = params?.[0];
        const owned = [...locks.values()].some((v) => v.run_id === runId);
        return { rows: owned ? [{ ok: '1' }] : [], rowCount: owned ? 1 : 0 };
      }
      if (sql.includes('DELETE FROM routine_run_locks WHERE run_id')) {
        const runId = params?.[0];
        for (const [k, v] of locks.entries()) {
          if (v.run_id === runId) locks.delete(k);
        }
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    };

    jest.unstable_mockModule('@/lib/db', () => ({
      hasDb: () => true,
      dbTransaction: async (fn: (q: typeof mockQuery) => Promise<unknown>) => fn(mockQuery),
      dbRun: async (sql: string, params?: unknown[]) => {
        await mockQuery(sql, params);
      },
      dbQuery: async (sql: string, params?: unknown[]) => {
        const r = await mockQuery(sql, params);
        return r.rows;
      },
    }));
    jest.unstable_mockModule('@/lib/migrate', () => ({ ensureSchema: async () => {} }));

    const { tryBeginRoutineRun, verifyRoutineRunLock, releaseRoutineRunLock } = await import(
      '@/lib/routine-runs'
    );

    const a = await tryBeginRoutineRun('market-open', '2026-11-01', Date.parse('2026-11-01T14:05:00Z'));
    expect('runId' in a).toBe(true);
    if (!('runId' in a)) return;
    expect(await verifyRoutineRunLock(a.runId)).toBe(true);

    const b = await tryBeginRoutineRun('market-open', '2026-11-01', Date.parse('2026-11-01T14:06:00Z'));
    expect(b).toEqual({ blocked: true, reason: 'Routine run lock held for this slot' });

    await releaseRoutineRunLock(a.runId);
    expect(await verifyRoutineRunLock(a.runId)).toBe(false);
  });

  it('flattenEtfPositionAtEod retries close and places restop on failure', async () => {
    jest.resetModules();
    const placeOrder = jest.fn(async () => ({ id: 'stop-1' }));
    let closeAttempts = 0;
    jest.unstable_mockModule('@/lib/strategy-versions', () => ({
      getActiveStrategyContent: async () => ({
        rules: { hard_stop_pct: 0.02, take_profit_pct: 0.05, max_positions: 3 },
        symbols: ['QQQ'],
        name: 't',
      }),
    }));
    jest.unstable_mockModule('@/lib/alpaca', () => ({
      alpaca: {
        closePosition: async () => {
          closeAttempts += 1;
          throw new Error('insufficient qty');
        },
        positions: async () => [
          {
            symbol: 'QQQ',
            qty: '10',
            qty_available: '10',
            current_price: '100',
            avg_entry_price: '99',
            market_value: '1000',
            cost_basis: '990',
            unrealized_pl: '10',
            unrealized_plpc: '0.01',
            unrealized_intraday_pl: '1',
            unrealized_intraday_plpc: '0.001',
            side: 'long',
            asset_class: 'us_equity',
            change_today: '0.01',
          },
        ],
        placeOrder,
      },
    }));
    jest.unstable_mockModule('@/lib/alpaca-orders', () => ({
      cancelSellLegsAndWait: async () => ({ cancelled: 1, ready: true, remainingLegs: [] }),
    }));
    jest.unstable_mockModule('@/lib/guards/service', () => ({
      logGuardEvent: async () => {},
    }));

    const { flattenEtfPositionAtEod } = await import('@/lib/eod-flatten');
    const result = await flattenEtfPositionAtEod('QQQ');
    expect(result.ok).toBe(false);
    expect(closeAttempts).toBe(3);
    expect(placeOrder).toHaveBeenCalled();
    if (!result.ok) expect(result.restopPlaced).toBe(true);
  });

  it('checkLessonsForBuy fail-closed when AI throws', async () => {
    jest.resetModules();
    jest.unstable_mockModule('@/lib/ai', () => ({
      agentJson: async () => {
        throw new Error('network');
      },
    }));
    jest.unstable_mockModule('@/lib/migrate', () => ({ ensureSchema: async () => {} }));
    jest.unstable_mockModule('@/lib/db', () => ({
      hasDb: () => false,
      dbQuery: async () => [],
      dbRun: async () => {},
      initDb: async () => {},
    }));

    const { checkLessonsForBuy } = await import('@/lib/lessons');
    const gate = await checkLessonsForBuy('QQQ', 'test', [
      { id: 'L1', title: 't', description: 'd', category: 'c' },
    ]);
    expect(gate.veto).toBe(true);
  });

});
