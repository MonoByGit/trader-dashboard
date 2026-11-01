import {
  AiJsonParseError,
  completeJsonWithRetries,
  extractJsonPayload,
  jsonMaxTokensFromEnv,
  parseJsonPayload,
  shouldRetryJson,
  unwrapJsonArray,
} from './json-response.js';

describe('extractJsonPayload', () => {
  it('pulls fenced json', () => {
    expect(extractJsonPayload('x ```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('finds bare object', () => {
    expect(extractJsonPayload('note {"ok":true}')).toBe('{"ok":true}');
  });
});

describe('parseJsonPayload', () => {
  it('parses array', () => {
    expect(parseJsonPayload('[1,2]')).toEqual([1, 2]);
  });
});

describe('unwrapJsonArray', () => {
  it('unwraps decisions wrapper (premarket shape)', () => {
    const inner = [{ symbol: 'QQQ', decision: 'HOLD' }];
    expect(unwrapJsonArray({ decisions: inner })).toEqual(inner);
  });

  it('unwraps candidates wrapper (crypto-scan shape)', () => {
    const inner = [{ symbol: 'BTC/USD', action: 'skip' }];
    expect(unwrapJsonArray({ candidates: inner })).toEqual(inner);
  });

  it('accepts bare array', () => {
    expect(unwrapJsonArray([{ a: 1 }])).toEqual([{ a: 1 }]);
  });

  it('returns null for invalid object', () => {
    expect(unwrapJsonArray({ meta: 'only' })).toBeNull();
  });
});

/** Same normalize+validate pipeline as agentJsonArray (premarket / crypto-scan). */
async function parseRoutineListJson(text: string): Promise<unknown[]> {
  const { value } = await completeJsonWithRetries<unknown[]>(
    async () => ({ text, finishReason: 'stop' }),
    {
      maxTokens: 1024,
      maxRetries: 0,
      normalize: (parsed) => unwrapJsonArray(parsed) ?? parsed,
      validate: (parsed) => Array.isArray(parsed),
    },
  );
  return value;
}

describe('premarket / crypto-scan list JSON', () => {
  it('parses object-wrapped decisions', async () => {
    const rows = await parseRoutineListJson(
      '{"decisions":[{"symbol":"QQQ","decision":"NO_GO"}]}',
    );
    expect(rows).toHaveLength(1);
  });

  it('parses object-wrapped candidates', async () => {
    const rows = await parseRoutineListJson(
      '{"candidates":[{"symbol":"BTC/USD","action":"skip"}]}',
    );
    expect(rows[0]).toMatchObject({ symbol: 'BTC/USD' });
  });

  it('parses bare array (legacy)', async () => {
    const rows = await parseRoutineListJson('[{"symbol":"SPY","decision":"HOLD"}]');
    expect(rows).toHaveLength(1);
  });

  it('rejects invalid non-array payload', async () => {
    await expect(parseRoutineListJson('{"note":"no list"}')).rejects.toBeInstanceOf(AiJsonParseError);
  });
});

describe('shouldRetryJson', () => {
  it('retries on length', () => {
    expect(shouldRetryJson('length', false, false)).toBe(true);
  });
  it('retries on parse error', () => {
    expect(shouldRetryJson('stop', true, false)).toBe(true);
  });
});

describe('jsonMaxTokensFromEnv', () => {
  const prev = process.env.AI_JSON_MAX_TOKENS;
  afterEach(() => {
    if (prev === undefined) delete process.env.AI_JSON_MAX_TOKENS;
    else process.env.AI_JSON_MAX_TOKENS = prev;
  });

  it('defaults to 4096', () => {
    delete process.env.AI_JSON_MAX_TOKENS;
    expect(jsonMaxTokensFromEnv()).toBe(4096);
  });

  it('reads env', () => {
    process.env.AI_JSON_MAX_TOKENS = '8192';
    expect(jsonMaxTokensFromEnv()).toBe(8192);
  });
});

describe('completeJsonWithRetries', () => {
  it('returns parsed JSON on first success', async () => {
    const result = await completeJsonWithRetries<{ x: number }>(
      async () => ({ text: '{"x":1}', finishReason: 'stop' }),
      { maxTokens: 1024, maxRetries: 1 },
    );
    expect(result.value).toEqual({ x: 1 });
    expect(result.attempts).toBe(1);
  });

  it('retries once on invalid JSON then succeeds', async () => {
    let n = 0;
    const result = await completeJsonWithRetries<number[]>(
      async () => {
        n++;
        if (n === 1) return { text: '{broken', finishReason: 'length' };
        return { text: '[1,2]', finishReason: 'stop' };
      },
      { maxTokens: 1024, maxRetries: 2 },
    );
    expect(result.value).toEqual([1, 2]);
    expect(result.attempts).toBe(2);
  });

  it('throws AiJsonParseError when retries exhausted', async () => {
    await expect(
      completeJsonWithRetries(async () => ({ text: 'not-json', finishReason: 'stop' }), {
        maxTokens: 512,
        maxRetries: 1,
      }),
    ).rejects.toBeInstanceOf(AiJsonParseError);
  });

  it('increases token budget on retry', async () => {
    const budgets: number[] = [];
    let n = 0;
    await completeJsonWithRetries(
      async (_attempt, maxTokens) => {
        budgets.push(maxTokens);
        n++;
        if (n === 1) return { text: '{', finishReason: 'length' };
        return { text: '{"ok":true}', finishReason: 'stop' };
      },
      { maxTokens: 1000, maxRetries: 2 },
    );
    expect(budgets[0]).toBe(1000);
    expect(budgets[1]).toBe(1500);
  });
});
