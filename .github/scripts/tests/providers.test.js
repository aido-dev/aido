const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_MODELS,
  generate,
  generateWithGemini,
  resolveModel,
  isRetryable,
  withRetry,
} = require('../lib/providers');

function withEnv(overrides, fn) {
  const saved = {};
  for (const [key, value] of Object.entries(overrides)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const restore = () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  const result = fn();
  if (result && typeof result.finally === 'function') return result.finally(restore);
  restore();
  return result;
}

async function withMockedFetch(impl, fn) {
  const original = global.fetch;
  global.fetch = impl;
  try {
    return await fn();
  } finally {
    global.fetch = original;
  }
}

test('resolveModel prefers the config model map', () => {
  assert.equal(resolveModel({ model: { GEMINI: 'gemini-custom' } }, 'GEMINI'), 'gemini-custom');
});

test('resolveModel falls back to defaults for missing config', () => {
  assert.equal(resolveModel({}, 'CLAUDE'), DEFAULT_MODELS.CLAUDE);
  assert.equal(resolveModel(undefined, 'CHATGPT'), DEFAULT_MODELS.CHATGPT);
  // Legacy string-valued model config (review) falls through to defaults
  assert.equal(resolveModel({ model: 'gemini-2.5-flash' }, 'GEMINI'), DEFAULT_MODELS.GEMINI);
});

test('generate rejects unknown providers', async () => {
  await assert.rejects(generate('BOGUS', 'prompt'), /Unknown provider: BOGUS/);
});

test('generate rejects when the provider API key is missing', async () => {
  await withEnv({ CHATGPT_API_KEY: undefined }, () =>
    assert.rejects(generate('CHATGPT', 'prompt'), /CHATGPT_API_KEY is not set/),
  );
  await withEnv({ CLAUDE_API_KEY: undefined }, () =>
    assert.rejects(generate('CLAUDE', 'prompt'), /CLAUDE_API_KEY is not set/),
  );
  await withEnv({ GEMINI_API_KEY: undefined }, () =>
    assert.rejects(generate('GEMINI', 'prompt'), /GEMINI_API_KEY is not set/),
  );
});

test('generateWithGemini posts the prompt and returns joined text parts', async () => {
  await withEnv({ GEMINI_API_KEY: 'test-key' }, () =>
    withMockedFetch(
      async (url, opts) => {
        assert.ok(String(url).includes('/models/gemini-test:generateContent'));
        assert.ok(String(url).includes('key=test-key'));
        const body = JSON.parse(opts.body);
        assert.equal(body.contents[0].parts[0].text, 'the prompt');
        assert.equal(body.generationConfig, undefined); // no temperature by default
        return {
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'hello' }, { text: 'world' }] } }],
          }),
        };
      },
      async () => {
        const text = await generateWithGemini('the prompt', { model: 'gemini-test' });
        assert.equal(text, 'hello\nworld');
      },
    ),
  );
});

test('generateWithGemini sends generationConfig only when temperature is given', async () => {
  await withEnv({ GEMINI_API_KEY: 'test-key' }, () =>
    withMockedFetch(
      async (url, opts) => {
        const body = JSON.parse(opts.body);
        assert.deepEqual(body.generationConfig, { temperature: 0.2 });
        return {
          ok: true,
          json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
        };
      },
      () => generateWithGemini('p', { temperature: 0.2 }),
    ),
  );
});

test('generateWithGemini throws on HTTP errors', async () => {
  await withEnv({ GEMINI_API_KEY: 'test-key' }, () =>
    withMockedFetch(
      async () => ({ ok: false, status: 429, statusText: 'Too Many Requests' }),
      () => assert.rejects(generateWithGemini('p'), /Gemini HTTP 429/),
    ),
  );
});

test('generateWithGemini throws when the response has no content', async () => {
  await withEnv({ GEMINI_API_KEY: 'test-key' }, () =>
    withMockedFetch(
      async () => ({ ok: true, json: async () => ({ candidates: [] }) }),
      () => assert.rejects(generateWithGemini('p'), /Gemini returned no content/),
    ),
  );
});

test('isRetryable recognizes transient statuses and messages', () => {
  assert.equal(isRetryable({ status: 503 }), true);
  assert.equal(isRetryable({ status: 429 }), true);
  assert.equal(isRetryable(new Error('Gemini HTTP 502: Bad Gateway')), true);
  assert.equal(isRetryable({ status: 400 }), false);
  assert.equal(isRetryable(new Error('GEMINI_API_KEY is not set.')), false);
  assert.equal(isRetryable(null), false);
});

test('withRetry retries transient failures then succeeds', async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls++;
      if (calls < 3) {
        const e = new Error('overloaded');
        e.status = 503;
        throw e;
      }
      return 'ok';
    },
    { baseDelayMs: 0 },
  );
  assert.equal(result, 'ok');
  assert.equal(calls, 3); // failed twice, succeeded on the third
});

test('withRetry gives up after exhausting retries', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls++;
        const e = new Error('still down');
        e.status = 503;
        throw e;
      },
      { retries: 2, baseDelayMs: 0 },
    ),
    /still down/,
  );
  assert.equal(calls, 3); // initial + 2 retries
});

test('withRetry does not retry non-transient errors', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls++;
        throw new Error('bad request'); // no status, not an HTTP 5xx/429 message
      },
      { baseDelayMs: 0 },
    ),
    /bad request/,
  );
  assert.equal(calls, 1);
});

test('generate retries a transient Gemini 503 then returns text', async () => {
  await withEnv({ GEMINI_API_KEY: 'test-key' }, () => {
    let calls = 0;
    return withMockedFetch(
      async () => {
        calls++;
        if (calls === 1) return { ok: false, status: 503, statusText: 'Service Unavailable' };
        return {
          ok: true,
          json: async () => ({ candidates: [{ content: { parts: [{ text: 'recovered' }] } }] }),
        };
      },
      async () => {
        const text = await generate('GEMINI', 'p', { baseDelayMs: 0 });
        assert.equal(text, 'recovered');
        assert.equal(calls, 2);
      },
    );
  });
});

test('generate still rejects unknown providers without retrying', async () => {
  await assert.rejects(generate('BOGUS', 'p', { baseDelayMs: 0 }), /Unknown provider: BOGUS/);
});
