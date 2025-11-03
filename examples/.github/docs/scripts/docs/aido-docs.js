/**
 * Aido Docs Script
 *
 * Drafts or augments documentation (README, function docs) for a PR.
 *
 * - Reads configuration from aido-docs-prompt.json (co-located)
 * - Collects PR context (title, description, changed files, unified diff)
 * - Generates documentation content with the configured provider:
 *     - CHATGPT | GEMINI | CLAUDE
 * - Posts the draft documentation as a PR comment
 *
 * Configuration supports:
 * - length (short | medium | long)
 * - style (e.g., "pedagogic", "technical", "succinct", etc.)
 * - language (e.g., "English")
 * - outputFormat (e.g., "markdown", "plain-text")
 * - include controls (title, body, filesSummary, diff)
 * - promptTemplate (optional) with placeholders
 *
 * Required env:
 * - GITHUB_TOKEN
 * - CHATGPT_API_KEY (if provider is CHATGPT)
 * - GEMINI_API_KEY (if provider is GEMINI)
 * - CLAUDE_API_KEY (if provider is CLAUDE)
 *
 * Notes:
 * - Designed for GitHub Actions on Node 20+ (global fetch available)
 * - The workflow creates a synthetic event file with pull_request.number
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

// Config file
const CONFIG_FILENAME = 'aido-docs-config.json';
const CONFIG_PATH = path.join(__dirname, CONFIG_FILENAME);

// Diff truncation to keep prompts reasonable
const DIFF_MAX_CHARS = 15000;

// Default configuration
const DEFAULT_CONFIG = {
  provider: 'GEMINI', // 'CHATGPT' | 'GEMINI' | 'CLAUDE'
  model: {
    CHATGPT: 'gpt-4o-mini',
    GEMINI: 'gemini-2.5-flash',
    CLAUDE: 'claude-3-5-sonnet-latest',
  },
  language: 'English',
  tone: 'clear, professional',
  style: 'pedagogic', // e.g., 'pedagogic', 'technical', 'succinct'
  length: 'medium', // 'short' | 'medium' | 'long'
  outputFormat: 'markdown', // 'markdown' | 'plain-text'
  include: {
    title: true,
    body: true,
    filesSummary: true,
    diff: true,
  },
  additionalInstructions:
    'Draft concise and helpful documentation that aids new contributors, highlights intent, and explains how to use or extend the changes. If needed, include example snippets.',
  // Optional custom prompt template. Available placeholders:
  // {{language}}, {{tone}}, {{style}}, {{length}}, {{outputFormat}},
  // {{prTitle}}, {{prBody}}, {{filesSummary}}, {{diff}}
  promptTemplate: null,
};

/**
 * Load JSON config with graceful fallback to defaults.
 */
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
    console.error(`[Aido Docs] Failed to read/parse ${CONFIG_FILENAME}:`, e.message || e);
  }
  return DEFAULT_CONFIG;
}

/**
 * Fetch PR details, changed files, and unified diff.
 */
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

/**
 * Create a compact summary of files changed.
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
 * Truncate large strings keeping head and tail with an ellipsis marker.
 */
function truncate(str, max) {
  if (!str) return '';
  if (str.length <= max) return str;
  const head = Math.floor(max * 0.7);
  const tail = max - head - 30;
  return `${str.slice(0, head)}\n...\n[truncated]\n...\n${str.slice(-tail)}`;
}

/**
 * Apply a template's placeholders.
 */
function fillTemplate(template, ctx) {
  return template
    .replace(/{{language}}/g, ctx.language || '')
    .replace(/{{tone}}/g, ctx.tone || '')
    .replace(/{{style}}/g, ctx.style || '')
    .replace(/{{length}}/g, ctx.length || '')
    .replace(/{{outputFormat}}/g, ctx.outputFormat || '')
    .replace(/{{prTitle}}/g, ctx.prTitle || '')
    .replace(/{{prBody}}/g, ctx.prBody || '')
    .replace(/{{filesSummary}}/g, ctx.filesSummary || '')
    .replace(/{{diff}}/g, ctx.diff || '');
}

/**
 * Build the docs drafting prompt from config + context.
 */
function buildPrompt(config, context) {
  const language = config.language || DEFAULT_CONFIG.language;
  const tone = config.tone || DEFAULT_CONFIG.tone;
  const style = config.style || DEFAULT_CONFIG.style;
  const length = config.length || DEFAULT_CONFIG.length;
  const outputFormat = (config.outputFormat || DEFAULT_CONFIG.outputFormat).toLowerCase();

  const include = config.include || {};
  const parts = [];

  parts.push(
    `You are an expert technical writer and senior engineer. In ${language}, draft or augment documentation for this pull request.`,
  );
  parts.push(
    `Audience: contributors and maintainers. Tone: ${tone}. Style: ${style}. Target length: ${length}. Output format: ${outputFormat}.`,
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

  // Guidance for documentation content
  parts.push(
    `Produce content for:
1) README updates: Explain the feature or changes, how to use it, examples, setup instructions if needed, and any caveats or limitations.
2) Function/module docs: For key functions/classes modified or added, provide purpose, parameters, return values, side effects, and examples of usage.
3) Migration or upgrade notes (if applicable): Outline steps for users upgrading from previous versions.

Requirements:
- Ensure the output is written in ${outputFormat}. If ${outputFormat} is 'markdown', use appropriate headings (##, ###), lists, and code fences. If 'plain-text', avoid markdown syntax.
- Be accurate, avoid speculation. Keep explanations concrete and helpful.
- If information is missing, call it out briefly without fabricating details.
- Keep examples minimal but illustrative.`,
  );

  if (config.additionalInstructions) {
    parts.push(`Additional instructions:\n${config.additionalInstructions}`);
  }

  const defaultPrompt = parts.join('\n\n');

  if (config.promptTemplate && typeof config.promptTemplate === 'string') {
    return fillTemplate(config.promptTemplate, {
      language,
      tone,
      style,
      length,
      outputFormat,
      prTitle: context.prTitle || '',
      prBody: context.prBody || '',
      filesSummary: context.filesSummary || '',
      diff: context.diff || '',
    });
  }

  return defaultPrompt;
}

/**
 * Provider: ChatGPT
 */
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

/**
 * Provider: Gemini
 */
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

/**
 * Provider: Claude
 */
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
    max_tokens: 2000,
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

/**
 * Main entrypoint
 */
async function main() {
  const repoFull = process.env.GITHUB_REPOSITORY;
  if (!repoFull) throw new Error('GITHUB_REPOSITORY is not set.');
  const [owner, repo] = repoFull.split('/');

  // Get PR number from synthetic event
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

  // Generate docs content
  let docs = '';
  try {
    if (provider === 'CHATGPT') {
      docs = await generateWithChatGPT(prompt, config.model?.CHATGPT);
    } else if (provider === 'GEMINI') {
      docs = await generateWithGemini(prompt, config.model?.GEMINI);
    } else if (provider === 'CLAUDE') {
      docs = await generateWithClaude(prompt, config.model?.CLAUDE);
    } else {
      throw new Error(`Unknown provider: ${provider}`);
    }
  } catch (e) {
    await postComment(
      owner,
      repo,
      prNumber,
      `**[Aido Docs ERROR]** Failed to generate documentation with provider '${provider}'.\n\nDetails: ${
        e.message || e
      }`,
    );
    throw e;
  }

  // Post result
  const header = '## 📚 Aido Docs Draft';
  const footer =
    '\n\n---\n_This is an AI-generated documentation draft. Please review, edit, and commit changes as appropriate._\n\n_Response generated using ' +
    (provider === 'CHATGPT'
      ? config.model?.CHATGPT || DEFAULT_CONFIG.model.CHATGPT
      : provider === 'CLAUDE'
        ? config.model?.CLAUDE || DEFAULT_CONFIG.model.CLAUDE
        : config.model?.GEMINI || DEFAULT_CONFIG.model.GEMINI) +
    '_';
  await postComment(owner, repo, prNumber, `${header}\n\n${docs}${footer}`);
}

// Execute
main().catch((err) => {
  console.error('[Aido Docs] Fatal error:', err);
  process.exit(1);
});
