/**
 * Shared AI provider wrappers for Aido scripts.
 *
 * All generators read their API key from the environment at call time:
 * - CHATGPT_API_KEY (OpenAI)
 * - GEMINI_API_KEY  (Google)
 * - CLAUDE_API_KEY  (Anthropic)
 *
 * Each generator throws if the key is missing or the provider returns no content,
 * so callers get an actionable error instead of an empty comment.
 */

const DEFAULT_MODELS = {
  CHATGPT: 'gpt-4o-mini',
  GEMINI: 'gemini-2.5-flash',
  CLAUDE: 'claude-3-5-sonnet-latest',
};

// Transient HTTP statuses worth retrying: rate limits and upstream/overload
// errors (Gemini's free tier returns 503 under load fairly often).
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Whether an error looks transient and worth retrying. Recognizes both a
 * numeric `status` (OpenAI/Anthropic SDK errors) and an "HTTP <code>" message
 * (our Gemini fetch wrapper).
 */
function isRetryable(err) {
  if (!err) return false;
  if (typeof err.status === 'number' && RETRYABLE_STATUS.has(err.status)) return true;
  const m = /\bHTTP (\d{3})\b/.exec(err.message || '');
  return m ? RETRYABLE_STATUS.has(Number(m[1])) : false;
}

/**
 * Run `fn`, retrying transient failures with exponential backoff.
 * Non-retryable errors (missing key, unknown provider, 4xx) throw immediately.
 * opts: { retries = 2, baseDelayMs = 500, onRetry }
 */
async function withRetry(fn, { retries = 2, baseDelayMs = 500, onRetry } = {}) {
  const note =
    onRetry ||
    ((err, attempt, delay) =>
      console.warn(
        `[Aido] Provider call failed (${err.message || err}); retry ${attempt}/${retries} in ${delay}ms`,
      ));
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !isRetryable(err)) throw err;
      const delay = baseDelayMs * 2 ** attempt;
      note(err, attempt + 1, delay);
      await sleep(delay);
    }
  }
  throw lastErr;
}

async function generateWithChatGPT(prompt, { model, temperature = 0.2 } = {}) {
  const apiKey = process.env.CHATGPT_API_KEY;
  if (!apiKey) throw new Error('CHATGPT_API_KEY is not set.');
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey });
  const resp = await client.chat.completions.create({
    model: model || DEFAULT_MODELS.CHATGPT,
    messages: [{ role: 'user', content: prompt }],
    temperature,
  });
  const text = resp.choices?.[0]?.message?.content;
  if (!text) throw new Error('ChatGPT returned no content.');
  return text;
}

/**
 * Generic OpenAI-compatible provider. Most third-party LLMs (DeepSeek, Kimi,
 * Grok, Mistral, OpenRouter, …) expose the OpenAI `/chat/completions` API, so a
 * single generator with a configurable `baseURL` covers all of them. The key
 * comes from OPENAI_API_KEY; `baseURL` and `model` are required (per-endpoint).
 */
async function generateWithOpenAICompatible(prompt, { model, baseURL, temperature } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set.');
  if (!baseURL)
    throw new Error('OPENAI provider requires a `baseURL` in config (the endpoint URL).');
  if (!model) throw new Error('OPENAI provider requires a `model` in config.');
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey, baseURL });
  const body = { model, messages: [{ role: 'user', content: prompt }] };
  // Opt-in only: some OpenAI-compatible endpoints (e.g. reasoning models)
  // reject a non-default temperature, so only send it when explicitly given.
  if (typeof temperature === 'number') body.temperature = temperature;
  const resp = await client.chat.completions.create(body);
  const text = resp.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI-compatible provider returned no content.');
  return text;
}

async function generateWithGemini(prompt, { model, temperature } = {}) {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set.');
  const endpointModel = model || DEFAULT_MODELS.GEMINI;
  const body = { contents: [{ parts: [{ text: prompt }] }] };
  // Opt-in only: when omitted, the API default is used (as before).
  if (typeof temperature === 'number') body.generationConfig = { temperature };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/${endpointModel}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const err = new Error(`Gemini HTTP ${res.status}: ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('\n') ||
    data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no content.');
  return text;
}

async function generateWithClaude(prompt, { model, maxTokens = 2000, temperature } = {}) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error('CLAUDE_API_KEY is not set.');
  let Anthropic;
  try {
    ({ Anthropic } = require('@anthropic-ai/sdk'));
  } catch {
    throw new Error("Claude selected but '@anthropic-ai/sdk' is not installed.");
  }
  const anthropic = new Anthropic({ apiKey });
  const params = {
    model: model || DEFAULT_MODELS.CLAUDE,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };
  // Opt-in only: newer Claude models (Opus 4.7+ / Fable 5) removed sampling
  // params and reject `temperature` with a 400, so only send it when a caller
  // explicitly asks for it. Mirrors the Gemini generator above.
  if (typeof temperature === 'number') params.temperature = temperature;
  const resp = await anthropic.messages.create(params);
  const text = (resp?.content || [])
    .filter((p) => p && (p.text || p.type === 'text'))
    .map((p) => p.text || '')
    .join('\n');
  if (!text) throw new Error('Claude returned no content.');
  return text;
}

/**
 * Dispatch to the given provider ('CHATGPT' | 'GEMINI' | 'CLAUDE' | 'OPENAI'),
 * retrying transient failures. 'OPENAI' is the generic OpenAI-compatible
 * provider — pass `baseURL` for the endpoint (DeepSeek, Kimi, Grok, …).
 * opts: { model, maxTokens, baseURL, temperature } — maxTokens applies to
 * Claude only, baseURL to OPENAI only — plus retry controls
 * { retries, baseDelayMs, onRetry }.
 */
async function generate(provider, prompt, opts = {}) {
  const { retries, baseDelayMs, onRetry, ...providerOpts } = opts;
  const call = () => {
    if (provider === 'CHATGPT') return generateWithChatGPT(prompt, providerOpts);
    if (provider === 'GEMINI') return generateWithGemini(prompt, providerOpts);
    if (provider === 'CLAUDE') return generateWithClaude(prompt, providerOpts);
    if (provider === 'OPENAI') return generateWithOpenAICompatible(prompt, providerOpts);
    return Promise.reject(new Error(`Unknown provider: ${provider}`));
  };
  return withRetry(call, { retries, baseDelayMs, onRetry });
}

/** Resolve the model for a provider from a config's model map, falling back to defaults. */
function resolveModel(config, provider) {
  return config?.model?.[provider] || DEFAULT_MODELS[provider];
}

module.exports = {
  DEFAULT_MODELS,
  generate,
  generateWithChatGPT,
  generateWithGemini,
  generateWithClaude,
  generateWithOpenAICompatible,
  resolveModel,
  isRetryable,
  withRetry,
};
