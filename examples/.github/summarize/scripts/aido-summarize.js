/**
 * AIDO Summarize Script
 *
 * - Reads configuration from aido-summarize-config.json (co-located)
 * - Builds PR context (title, body, file changes, and diff)
 * - Generates a summary via configured provider (CHATGPT | GEMINI | CLAUDE)
 * - Posts the summary as a PR comment
 *
 * Required env:
 * - GITHUB_TOKEN
 * - CHATGPT_API_KEY (if provider is CHATGPT)
 * - GEMINI_API_KEY (if provider is GEMINI)
 * - CLAUDE_API_KEY (if provider is CLAUDE)
 *
 * Note:
 * - This script is designed to be executed in GitHub Actions with Node 20+.
 * - It expects GITHUB_EVENT_PATH to contain a JSON with pull_request.number,
 *   which the workflow creates as a synthetic event.
 */

const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/rest');

// Globals from environment
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const CHATGPT_API_KEY = process.env.CHATGPT_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const GITHUB_EVENT_PATH = process.env.GITHUB_EVENT_PATH;

// Instantiate Octokit
const octokit = new Octokit({ auth: GITHUB_TOKEN });

// Where to read the summarize config from
const CONFIG_FILENAME = 'aido-summarize-config.json';
const CONFIG_PATH = path.join(__dirname, CONFIG_FILENAME);

// Reasonable max size for diff to keep prompts under control
const DIFF_MAX_CHARS = 15000;

// Default configuration if aido-summarize-config.json is missing or incomplete
const DEFAULT_CONFIG = {
  provider: 'GEMINI', // 'CHATGPT' | 'GEMINI' | 'CLAUDE'
  model: {
    CHATGPT: 'gpt-4o-mini',
    GEMINI: 'gemini-2.5-flash',
    CLAUDE: 'claude-3-5-sonnet-latest',
  },
  language: 'English',
  tone: 'neutral, professional',
  length: 'medium', // 'short' | 'medium' | 'long'
  style: 'bullet-points', // 'bullet-points' | 'paragraph'
  include: {
    title: true,
    body: true,
    filesSummary: true,
    diff: true,
  },
  additionalInstructions:
    'Focus on the high-level intent of the changes, summarize key modifications, risks, test impact, and potential follow-ups.',
  // Optional custom prompt template. Available placeholders:
  // {{language}}, {{tone}}, {{length}}, {{style}}, {{prTitle}}, {{prBody}}, {{filesSummary}}, {{diff}}
  promptTemplate: null,
};

/**
 * Read and parse JSON config; fallback to defaults if not present or invalid.
 */
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      const parsed = JSON.parse(raw);

      // Merge with defaults (shallow + some deep parts)
      const merged = {
        ...DEFAULT_CONFIG,
        ...parsed,
        model: { ...DEFAULT_CONFIG.model, ...(parsed.model || {}) },
        include: { ...DEFAULT_CONFIG.include, ...(parsed.include || {}) },
      };
      return merged;
    }
  } catch (e) {
    console.error(`[AIDO Summarize] Failed to read/parse ${CONFIG_FILENAME}:`, e.message || e);
  }
  return DEFAULT_CONFIG;
}

/**
 * Fetch PR data, files, and diff.
 * @param {string} owner
 * @param {string} repo
 * @param {number} prNumber
 */
async function getPrContext(owner, repo, prNumber) {
  // PR details
  const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: prNumber });

  // Files changed
  const files = await octokit.paginate(octokit.pulls.listFiles, {
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });

  // Unified diff (entire PR)
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

/**
 * Build a compact files summary.
 */
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

/**
 * Truncate diff to a max number of characters.
 */
function truncate(str, max) {
  if (!str) return '';
  if (str.length <= max) return str;
  const head = Math.floor(max * 0.7);
  const tail = max - head - 30; // leave room for ellipsis marker
  return `${str.slice(0, head)}\n...\n[truncated]\n...\n${str.slice(-tail)}`;
}

/**
 * Fill a prompt template with context variables.
 */
function fillTemplate(template, ctx) {
  return template
    .replace(/{{language}}/g, ctx.language || '')
    .replace(/{{tone}}/g, ctx.tone || '')
    .replace(/{{length}}/g, ctx.length || '')
    .replace(/{{style}}/g, ctx.style || '')
    .replace(/{{prTitle}}/g, ctx.prTitle || '')
    .replace(/{{prBody}}/g, ctx.prBody || '')
    .replace(/{{filesSummary}}/g, ctx.filesSummary || '')
    .replace(/{{diff}}/g, ctx.diff || '');
}

/**
 * Compose the summarize prompt based on config and context.
 */
function buildPrompt(config, context) {
  const lang = config.language || DEFAULT_CONFIG.language;
  const tone = config.tone || DEFAULT_CONFIG.tone;
  const length = config.length || DEFAULT_CONFIG.length;
  const style = config.style || DEFAULT_CONFIG.style;

  const parts = [];
  parts.push(
    `You are an expert code reviewer. Produce a high-quality pull request summary in ${lang}.`,
  );
  parts.push(`Tone: ${tone}. Target length: ${length}. Preferred style: ${style}.`);
  parts.push(`Only summarize; do not propose code changes. Be accurate and concise.`);

  const include = config.include || {};
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
    `Focus points:
- What changed and why
- Key modules/files touched
- Potential risks or breaking changes
- Performance and security considerations (if any)
- Tests touched or required
- Follow-up items or TODOs`,
  );

  if (config.additionalInstructions) {
    parts.push(`Additional instructions:\n${config.additionalInstructions}`);
  }

  const defaultPrompt = parts.join('\n\n');

  // If a custom template is provided, apply it; otherwise return the default prompt.
  if (config.promptTemplate && typeof config.promptTemplate === 'string') {
    return fillTemplate(config.promptTemplate, {
      language: lang,
      tone,
      length,
      style,
      prTitle: context.prTitle || '',
      prBody: context.prBody || '',
      filesSummary: context.filesSummary || '',
      diff: context.diff || '',
    });
  }

  return defaultPrompt;
}

/**
 * Generate summary with ChatGPT (OpenAI)
 */
async function generateWithChatGPT(prompt, model) {
  if (!CHATGPT_API_KEY) {
    throw new Error('CHATGPT_API_KEY is not set.');
  }
  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({ apiKey: CHATGPT_API_KEY });
  const resp = await openai.chat.completions.create({
    model: model || DEFAULT_CONFIG.model.CHATGPT,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
  });
  const text = resp.choices?.[0]?.message?.content;
  if (!text) throw new Error('ChatGPT returned no content.');
  return text;
}

/**
 * Generate summary with Gemini (Google)
 */
async function generateWithGemini(prompt, model) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set.');
  }
  const endpointModel = model || DEFAULT_CONFIG.model.GEMINI;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/${endpointModel}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    },
  );
  if (!res.ok) {
    throw new Error(`Gemini HTTP ${res.status}: ${res.statusText}`);
  }
  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('\n') ||
    data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no content.');
  return text;
}

/**
 * Generate summary with Claude (Anthropic)
 */
async function generateWithClaude(prompt, model) {
  if (!CLAUDE_API_KEY) {
    throw new Error('CLAUDE_API_KEY is not set.');
  }
  let Anthropic;
  try {
    ({ Anthropic } = require('@anthropic-ai/sdk'));
  } catch (e) {
    throw new Error(
      "Claude selected but '@anthropic-ai/sdk' is not installed. Ensure the workflow installs it.",
    );
  }
  const anthropic = new Anthropic({ apiKey: CLAUDE_API_KEY });
  const resp = await anthropic.messages.create({
    model: model || DEFAULT_CONFIG.model.CLAUDE,
    max_tokens: 1000,
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
 * Post a comment on the PR
 */
async function postComment(owner, repo, prNumber, body) {
  await octokit.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body,
  });
}

/**
 * Entrypoint
 */
async function main() {
  const repoFull = process.env.GITHUB_REPOSITORY;
  if (!repoFull) throw new Error('GITHUB_REPOSITORY is not set.');
  const [owner, repo] = repoFull.split('/');

  // Determine PR number from event
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

  // Load config
  const config = loadConfig();
  const provider = (config.provider || 'GEMINI').toUpperCase();

  // Build PR context
  const { prTitle, prBody, files, diff } = await getPrContext(owner, repo, prNumber);
  const filesSummary = buildFilesSummary(files);
  const truncatedDiff = config.include?.diff ? truncate(diff, DIFF_MAX_CHARS) : '';

  const prompt = buildPrompt(config, {
    prTitle,
    prBody,
    filesSummary: config.include?.filesSummary ? filesSummary : '',
    diff: config.include?.diff ? truncatedDiff : '',
  });

  // Generate summary via selected provider
  let summaryText = '';
  try {
    if (provider === 'CHATGPT') {
      summaryText = await generateWithChatGPT(prompt, config.model?.CHATGPT);
    } else if (provider === 'GEMINI') {
      summaryText = await generateWithGemini(prompt, config.model?.GEMINI);
    } else if (provider === 'CLAUDE') {
      summaryText = await generateWithClaude(prompt, config.model?.CLAUDE);
    } else {
      throw new Error(`Unknown provider: ${provider}`);
    }
  } catch (e) {
    // Post error for visibility and rethrow
    await postComment(
      owner,
      repo,
      prNumber,
      `**[AIDO Summarize ERROR]** Failed to generate summary with provider '${provider}'.\n\nDetails: ${e.message || e}`,
    );
    throw e;
  }

  // Post summary (append provider/model footer)
  const header = '## 📝 AIDO PR Summary';
  const modelUsed =
    provider === 'CHATGPT'
      ? config.model?.CHATGPT || DEFAULT_CONFIG.model.CHATGPT
      : provider === 'CLAUDE'
        ? config.model?.CLAUDE || DEFAULT_CONFIG.model.CLAUDE
        : config.model?.GEMINI || DEFAULT_CONFIG.model.GEMINI;
  const footer = `\n\n---\n_Response generated using ${modelUsed}_`;
  await postComment(owner, repo, prNumber, `${header}\n\n${summaryText}${footer}`);
}

// Execute
main().catch((err) => {
  console.error('[AIDO Summarize] Fatal error:', err);
  process.exit(1);
});
