/**
 * Aido Suggest Script
 *
 * Purpose:
 * - Analyze a PR and propose concrete improvements and small refactors.
 * - Output should be actionable, scoped, and safe to apply incrementally.
 *
 * Behavior:
 * - Reads configuration from aido-suggest-config.json (co-located)
 * - Builds PR context (title, body, changed files, unified diff)
 * - Generates suggestions via selected provider: CHATGPT | GEMINI | CLAUDE
 * - Posts the suggestions as a PR comment
 *
 * Required env:
 * - GITHUB_TOKEN
 * - CHATGPT_API_KEY (if provider is CHATGPT)
 * - GEMINI_API_KEY (if provider is GEMINI)
 * - CLAUDE_API_KEY (if provider is CLAUDE)
 *
 * Notes:
 * - Designed to run in GitHub Actions on Node 20+ (fetch is global).
 * - Workflow should create a synthetic GITHUB_EVENT_PATH with { pull_request.number }.
 */

const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/rest');

// Environment
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const CHATGPT_API_KEY = process.env.CHATGPT_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const GITHUB_EVENT_PATH = process.env.GITHUB_EVENT_PATH;

// API client
const octokit = new Octokit({ auth: GITHUB_TOKEN });

// Local config
const CONFIG_FILENAME = 'aido-suggest-config.json';
const CONFIG_PATH = path.join(__dirname, CONFIG_FILENAME);

// Truncation limit to keep prompts manageable
const DIFF_MAX_CHARS = 15000;

// Default config
const DEFAULT_CONFIG = {
  provider: 'GEMINI', // 'CHATGPT' | 'GEMINI' | 'CLAUDE'
  model: {
    CHATGPT: 'gpt-4o-mini',
    GEMINI: 'gemini-2.5-flash',
    CLAUDE: 'claude-3-5-sonnet-latest',
  },
  language: 'English',
  tone: 'constructive, pragmatic, professional',
  length: 'medium', // 'short' | 'medium' | 'long'
  style: 'bullet-points', // 'bullet-points' | 'sections' | 'paragraph'
  include: {
    title: true,
    body: true,
    filesSummary: true,
    diff: true,
  },
  guardrails:
    'Focus on small, safe refactors and concrete improvements. Avoid large-scale rewrites unless trivially safe. Prefer clarity, maintainability, testability, and small performance wins. Respect existing patterns and conventions where reasonable.',
  deliverFormat:
    'Group suggestions by file when possible. For each suggestion: provide (1) a concise title, (2) a brief rationale, (3) concrete code changes in before/after or patch-like snippets, (4) estimated risk level (low/medium/high), (5) estimated effort (XS/S/M).',
  additionalInstructions:
    'Prefer standard patterns and idioms used in common ecosystems. Use clear code snippets. Avoid speculative or unverified claims.',
  // Optional custom template with placeholders:
  // {{language}}, {{tone}}, {{length}}, {{style}}, {{prTitle}}, {{prBody}}, {{filesSummary}}, {{diff}}, {{guardrails}}, {{deliverFormat}}
  promptTemplate: null,
};

// Read config with graceful fallback
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        model: { ...DEFAULT_CONFIG.model, ...(parsed.model || {}) },
        include: { ...DEFAULT_CONFIG.include, ...(parsed.include || {}) },
      };
    }
  } catch (e) {
    console.error(`[Aido Suggest] Failed to read/parse ${CONFIG_FILENAME}:`, e.message || e);
  }
  return DEFAULT_CONFIG;
}

// Build PR context
async function getPrContext(owner, repo, prNumber) {
  const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: prNumber });

  const files = await octokit.paginate(octokit.pulls.listFiles, {
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });

  const { data: diff } = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
    owner,
    repo,
    pull_number: prNumber,
    mediaType: { format: 'diff' },
  });

  return {
    prTitle: pr.title || '',
    prBody: pr.body || '',
    files,
    diff,
  };
}

// Compact list of files changed
function buildFilesSummary(files) {
  if (!files || files.length === 0) return 'No files changed.';
  const lines = files.map((f) => {
    const parts = [];
    if (typeof f.additions === 'number' && typeof f.deletions === 'number') {
      parts.push(`+${f.additions}/-${f.deletions}`);
    }
    if (f.status) parts.push(f.status);
    return `- ${f.filename} (${parts.join(', ')})`;
  });
  return lines.join('\n');
}

// Truncate large strings while preserving head and tail
function truncate(str, max) {
  if (!str) return '';
  if (str.length <= max) return str;
  const head = Math.floor(max * 0.7);
  const tail = max - head - 30;
  return `${str.slice(0, head)}\n...\n[truncated]\n...\n${str.slice(-tail)}`;
}

function fillTemplate(template, ctx) {
  return template
    .replace(/{{language}}/g, ctx.language || '')
    .replace(/{{tone}}/g, ctx.tone || '')
    .replace(/{{length}}/g, ctx.length || '')
    .replace(/{{style}}/g, ctx.style || '')
    .replace(/{{prTitle}}/g, ctx.prTitle || '')
    .replace(/{{prBody}}/g, ctx.prBody || '')
    .replace(/{{filesSummary}}/g, ctx.filesSummary || '')
    .replace(/{{diff}}/g, ctx.diff || '')
    .replace(/{{guardrails}}/g, ctx.guardrails || '')
    .replace(/{{deliverFormat}}/g, ctx.deliverFormat || '');
}

// Compose prompt for concrete suggestions/refactors
function buildPrompt(config, context) {
  const language = config.language || DEFAULT_CONFIG.language;
  const tone = config.tone || DEFAULT_CONFIG.tone;
  const length = config.length || DEFAULT_CONFIG.length;
  const style = config.style || DEFAULT_CONFIG.style;

  const include = config.include || {};
  const parts = [];

  parts.push(
    `You are an experienced senior engineer and code reviewer. In ${language}, provide ${style} suggestions with a ${tone} tone.`,
  );
  parts.push(`Target length: ${length}. Suggestions must be concrete and actionable.`);

  parts.push(`Guardrails:\n${config.guardrails || DEFAULT_CONFIG.guardrails}`);
  parts.push(
    `Deliver the output in this format:\n${config.deliverFormat || DEFAULT_CONFIG.deliverFormat}`,
  );

  if (include.title && context.prTitle) {
    parts.push(`PR Title:\n${context.prTitle}`);
  }
  if (include.body && context.prBody) {
    parts.push(`PR Description:\n${context.prBody}`);
  }
  if (include.filesSummary && context.filesSummary) {
    parts.push(`Files Changed:\n${context.filesSummary}`);
  }
  if (include.diff && context.diff) {
    parts.push(`Unified Diff (truncated):\n${context.diff}`);
  }

  parts.push(
    `Guidance:
- Prioritize clarity, maintainability, and testability.
- Use idiomatic patterns.
- Suggest small refactors, not sweeping rewrites, unless trivially safe.
- Include short code snippets (before/after or patch-like) to illustrate the change.
- When you show code, ALWAYS wrap non-suggestion code in fenced code blocks using tildes with a language hint when possible (e.g., ~~~js, ~~~ts, ~~~py, ~~~diff). Reserve triple backticks only for GitHub apply blocks using \`\`\`suggestion. Every fence must be closed.
- Do not interleave narrative text inside a code block. Keep narrative outside code fences.
- Prefer GitHub suggestion blocks (use \`\`\`suggestion fences) when proposing a concrete, directly applicable change to a single file/hunk. Never use regular triple backticks for non-suggestion code; use tildes (~) instead. Do not nest fences.
- Ensure all fences are balanced and closed; never leave unmatched fences.
- Use one suggestion block per discrete change; do not combine multiple files in a single block.
- Match exact file paths from the "Files Changed" list and use new-file line numbers.
- Keep suggestion blocks minimal and compilable/runnable where applicable.
- If showing before/after, use two separate fenced blocks labeled "Before:" and "After:".
- Call out potential risks and effort realistically.
- Avoid speculative or unverifiable claims.`,
  );

  const defaultPrompt = parts.join('\n\n');

  if (config.promptTemplate && typeof config.promptTemplate === 'string') {
    return fillTemplate(config.promptTemplate, {
      language,
      tone,
      length,
      style,
      prTitle: context.prTitle || '',
      prBody: context.prBody || '',
      filesSummary: context.filesSummary || '',
      diff: context.diff || '',
      guardrails: config.guardrails || DEFAULT_CONFIG.guardrails,
      deliverFormat: config.deliverFormat || DEFAULT_CONFIG.deliverFormat,
    });
  }

  return defaultPrompt;
}

// Providers

async function generateWithChatGPT(prompt, model) {
  if (!CHATGPT_API_KEY) throw new Error('CHATGPT_API_KEY is not set.');
  const { default: ChatGPT } = await import('openai');
  const chatgpt = new ChatGPT({ apiKey: CHATGPT_API_KEY });
  const resp = await chatgpt.chat.completions.create({
    model: model || DEFAULT_CONFIG.model.CHATGPT,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
  });
  const text = resp.choices?.[0]?.message?.content;
  if (!text) throw new Error('ChatGPT returned no content.');
  return text;
}

async function generateWithGemini(prompt, model) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set.');
  const endpointModel = model || DEFAULT_CONFIG.model.GEMINI;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/${endpointModel}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
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

async function generateWithClaude(prompt, model) {
  if (!CLAUDE_API_KEY) throw new Error('CLAUDE_API_KEY is not set.');
  let Anthropic;
  try {
    ({ Anthropic } = require('@anthropic-ai/sdk'));
  } catch {
    throw new Error("Claude selected but '@anthropic-ai/sdk' is not installed.");
  }
  const anthropic = new Anthropic({ apiKey: CLAUDE_API_KEY });
  const resp = await anthropic.messages.create({
    model: model || DEFAULT_CONFIG.model.CLAUDE,
    max_tokens: 1600,
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
  });
  const content = resp?.content || [];
  const text = content
    .filter((p) => p && (p.text || p.type === 'text'))
    .map((p) => p.text || '')
    .join('\n');
  if (!text) throw new Error('Claude returned no content.');
  return text;
}

/**
 * Ensure code fences are balanced to avoid broken code blocks in GitHub comments
 * - Preserve GitHub apply blocks (```suggestion)
 * - Convert non-suggestion triple backticks to tildes (~~~) to avoid fence collisions
 * - Balance fences to prevent rendering issues
 */
function sanitizeFences(text) {
  if (!text) return '';
  let out = text;

  // If there's an unmatched opening suggestion fence, add a closing fence first
  // so the tokenizer below can safely capture it.
  if (out.includes('```suggestion') && !/```suggestion[\s\S]*?```/.test(out)) {
    out += '\n```';
  }

  // Protect valid suggestion blocks by tokenizing them
  const stash = [];
  out = out.replace(/```suggestion[\s\S]*?```/g, (m) => {
    const key = `__AIDO_SUGGESTION_${stash.length}__`;
    stash.push(m);
    return key;
  });

  // Convert remaining triple-backtick code fences to tildes (~~~)
  // Preserve language header (may include attributes like "json title=...")
  out = out.replace(/```([^\r\n`]*)\r?\n/g, (m, header) => `~~~${header}\n`);
  // Any other stray ``` occurrences become ~~~
  out = out.replace(/```/g, '~~~');

  // Normalize overly long tilde fences like ~~~~ -> ~~~
  out = out.replace(/~~~~+/g, '~~~');

  // Balance tilde fences (avoid leaving an opening without a closing)
  const tildeCount = (out.match(/~~~/g) || []).length;
  if (tildeCount % 2 !== 0) {
    out += '\n~~~';
  }

  // Restore suggestion blocks
  stash.forEach((block, i) => {
    out = out.replace(`__AIDO_SUGGESTION_${i}__`, block);
  });

  // As a final guard, if any unmatched opening suggestion fence remains, close it
  const opens = (out.match(/```suggestion/g) || []).length;
  const closes = (out.match(/```/g) || []).length;
  if (opens > closes) {
    out += '\n```';
  }

  return out;
}

/**
 * Post a PR comment
 */
async function postComment(owner, repo, prNumber, body) {
  await octokit.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body,
  });
}

// Main
async function main() {
  const repoFull = process.env.GITHUB_REPOSITORY;
  if (!repoFull) throw new Error('GITHUB_REPOSITORY is not set.');
  const [owner, repo] = repoFull.split('/');

  // Get PR number from event
  let prNumber = null;
  if (GITHUB_EVENT_PATH && fs.existsSync(GITHUB_EVENT_PATH)) {
    const event = require(GITHUB_EVENT_PATH);
    if (event.pull_request && event.pull_request.number) {
      prNumber = event.pull_request.number;
    } else if (event.issue && event.issue.pull_request) {
      const url = event.issue.pull_request.url;
      prNumber = Number(url.split('/').pop());
    }
  }
  if (!prNumber) throw new Error('No PR number found in event.');

  // Load configuration
  const config = loadConfig();
  const provider = (config.provider || 'GEMINI').toUpperCase();

  // Build context
  const { prTitle, prBody, files, diff } = await getPrContext(owner, repo, prNumber);
  const filesSummary = buildFilesSummary(files);
  const truncatedDiff = config.include?.diff ? truncate(diff, DIFF_MAX_CHARS) : '';

  const prompt = buildPrompt(config, {
    prTitle,
    prBody,
    filesSummary: config.include?.filesSummary ? filesSummary : '',
    diff: config.include?.diff ? truncatedDiff : '',
  });

  // Generate suggestions
  let suggestions = '';
  try {
    if (provider === 'CHATGPT') {
      suggestions = await generateWithChatGPT(prompt, config.model?.CHATGPT);
    } else if (provider === 'GEMINI') {
      suggestions = await generateWithGemini(prompt, config.model?.GEMINI);
    } else if (provider === 'CLAUDE') {
      suggestions = await generateWithClaude(prompt, config.model?.CLAUDE);
    } else {
      throw new Error(`Unknown provider: ${provider}`);
    }
  } catch (e) {
    await postComment(
      owner,
      repo,
      prNumber,
      `**[Aido Suggest ERROR]** Failed to generate suggestions with provider '${provider}'.\n\nDetails: ${e.message || e}`,
    );
    throw e;
  }

  // Post result
  const header = '## ✨ Aido Suggestions (Concrete improvements & small refactors)';
  const safeSuggestions = sanitizeFences(suggestions);
  const modelUsed =
    provider === 'CHATGPT'
      ? config.model?.CHATGPT || DEFAULT_CONFIG.model.CHATGPT
      : provider === 'CLAUDE'
        ? config.model?.CLAUDE || DEFAULT_CONFIG.model.CLAUDE
        : config.model?.GEMINI || DEFAULT_CONFIG.model.GEMINI;
  const footer = `

  ---
  _Response generated using ${modelUsed}_`;
  await postComment(owner, repo, prNumber, `${header}\n\n${safeSuggestions}${footer}`);
}

// Execute
main().catch((err) => {
  console.error('[Aido Suggest] Fatal error:', err);
  process.exit(1);
});
