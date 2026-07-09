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
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${res.statusText}`);
  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('\n') ||
    data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no content.');
  return text;
}

async function generateWithClaude(prompt, { model, maxTokens = 2000, temperature = 0.2 } = {}) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error('CLAUDE_API_KEY is not set.');
  let Anthropic;
  try {
    ({ Anthropic } = require('@anthropic-ai/sdk'));
  } catch {
    throw new Error("Claude selected but '@anthropic-ai/sdk' is not installed.");
  }
  const anthropic = new Anthropic({ apiKey });
  const resp = await anthropic.messages.create({
    model: model || DEFAULT_MODELS.CLAUDE,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = (resp?.content || [])
    .filter((p) => p && (p.text || p.type === 'text'))
    .map((p) => p.text || '')
    .join('\n');
  if (!text) throw new Error('Claude returned no content.');
  return text;
}

/**
 * Dispatch to the given provider ('CHATGPT' | 'GEMINI' | 'CLAUDE').
 * opts: { model, maxTokens, temperature } — maxTokens applies to Claude only.
 */
async function generate(provider, prompt, opts = {}) {
  if (provider === 'CHATGPT') return generateWithChatGPT(prompt, opts);
  if (provider === 'GEMINI') return generateWithGemini(prompt, opts);
  if (provider === 'CLAUDE') return generateWithClaude(prompt, opts);
  throw new Error(`Unknown provider: ${provider}`);
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
  resolveModel,
};
