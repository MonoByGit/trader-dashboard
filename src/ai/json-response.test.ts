import {
  AiJsonParseError,
  completeJsonWithRetries,
  extractJsonPayload,
  jsonMaxTokensFromEnv,
  parseJsonPayload,
  shouldRetryJson,
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
