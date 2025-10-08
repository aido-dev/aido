/**
 * Aido Explain Script
 *
 * - Reads configuration from aido-explain-config.json (co-located)
 * - Builds PR context (title, body, files changed, and unified diff)
 * - Generates a pedagogical explanation of the diff via CHATGPT | GEMINI | CLAUDE
 * - Posts the explanation as a PR comment
 *
 * Required env:
 * - GITHUB_TOKEN
 * - CHATGPT_API_KEY (if provider is CHATGPT)
 * - GEMINI_API_KEY (if provider is GEMINI)
 * - CLAUDE_API_KEY (if provider is CLAUDE)
 *
 * Notes:
 * - Designed for GitHub Actions on Node 20+ (global fetch available)
 * - The workflow sets GITHUB_EVENT_PATH with a synthetic event containing pull_request.number
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
const CONFIG_FILENAME = 'aido-explain-config.json';
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
  tone: 'friendly, clear, pedagogical',
  length: 'medium', // 'short' | 'medium' | 'long'
  style: 'step-by-step', // 'step-by-step' | 'bullet-points' | 'paragraph'
  include: {
    title: true,
    body: true,
    filesSummary: true,
    diff: true,
  },
  additionalInstructions:
    'Target a teammate with limited context. Use plain language. Explain intent first, then walk through changes by file or module, and conclude with implications and how to test.',
  // Optional custom prompt template. Available placeholders:
  // {{language}}, {{tone}}, {{length}}, {{style}}, {{prTitle}}, {{prBody}}, {{filesSummary}}, {{diff}}
  promptTemplate: null,
};

/**
 * Load JSON config; fall back to defaults on error or missing file.
 */
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      const merged = {
        ...DEFAULT_CONFIG,
        ...parsed,
        model: { ...DEFAULT_CONFIG.model, ...(parsed.model || {}) },
        include: { ...DEFAULT_CONFIG.include, ...(parsed.include || {}) },
      };
      return merged;
    }
  } catch (e) {
    console.error(`[Aido Explain] Failed to read/parse ${CONFIG_FILENAME}:`, e.message || e);
  }
  return DEFAULT_CONFIG;
}

/**
 * Fetch PR details, changed files, and the unified diff.
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
 * Build a human-friendly summary of files changed.
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
 * Truncate string to max length (keep head and tail, ellipsis in the middle).
 */
function truncate(str, max) {
  if (!str) return '';
  if (str.length <= max) return str;
  const head = Math.floor(max * 0.7);
  const tail = max - head - 30; // leave room for ellipsis marker
  return `${str.slice(0, head)}\n...\n[truncated]\n...\n${str.slice(-tail)}`;
}

/**
 * Apply a template with placeholders.
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
 * Build the pedagogical explanation prompt.
 */
function buildPrompt(config, context) {
  const lang = config.language || DEFAULT_CONFIG.language;
  const tone = config.tone || DEFAULT_CONFIG.tone;
  const length = config.length || DEFAULT_CONFIG.length;
  const style = config.style || DEFAULT_CONFIG.style;

  const include = config.include || {};
  const sections = [];

  sections.push(
    `You are an experienced senior engineer and teacher. Produce a ${style} explanation in ${lang} with a ${tone} tone. The goal is to help a teammate understand the changes and their intent.`,
  );
  sections.push(
    `Target length: ${length}. Avoid excessive verbosity, but be thorough and approachable.`,
  );

  if (include.title && context.prTitle) {
    sections.push(`PR Title:\n${context.prTitle}`);
  }
  if (include.body && context.prBody) {
    sections.push(`PR Description:\n${context.prBody}`);
  }
  if (include.filesSummary && context.filesSummary) {
    sections.push(`Files Changed:\n${context.filesSummary}`);
  }
  if (include.diff && context.diff) {
    sections.push(`Unified Diff (truncated):\n${context.diff}`);
  }

  sections.push(
    `Explain like this:
1) High-level intent of the changes and the problem being solved.
2) Walkthrough of key changes by file or module, with small examples if helpful.
3) Notable design choices and trade-offs.
4) Potential risks, edge cases, and impacts on performance/security.
5) How to verify or test the changes manually and with automated tests.
6) Any follow-ups or recommended improvements.`,
  );

  if (config.additionalInstructions) {
    sections.push(`Additional instructions:\n${config.additionalInstructions}`);
  }

  const defaultPrompt = sections.join('\n\n');

  // If a custom template exists, apply it
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
 * Generate explanation with ChatGPT.
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
 * Generate explanation with Gemini (Google).
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
 * Generate explanation with Claude (Anthropic).
 */
async function generateWithClaude(prompt, model) {
  if (!CLAUDE_API_KEY) throw new Error('CLAUDE_API_KEY is not set.');
  let Anthropic;
  try {
    ({ Anthropic } = require('@anthropic-ai/sdk'));
  } catch (e) {
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
 * Post a comment on the PR.
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

  // Determine PR number from event file
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

  // Generate explanation
  let explanation = '';
  try {
    if (provider === 'CHATGPT') {
      explanation = await generateWithChatGPT(prompt, config.model?.CHATGPT);
    } else if (provider === 'GEMINI') {
      explanation = await generateWithGemini(prompt, config.model?.GEMINI);
    } else if (provider === 'CLAUDE') {
      explanation = await generateWithClaude(prompt, config.model?.CLAUDE);
    } else {
      throw new Error(`Unknown provider: ${provider}`);
    }
  } catch (e) {
    await postComment(
      owner,
      repo,
      prNumber,
      `**[Aido Explain ERROR]** Failed to generate explanation with provider '${provider}'.\n\nDetails: ${e.message || e}`,
    );
    throw e;
  }

  // Post result (append provider/model footer)
  const header = '## 📘 Aido PR Explanation';
  const modelUsed =
    provider === 'CHATGPT'
      ? config.model?.CHATGPT || DEFAULT_CONFIG.model.CHATGPT
      : provider === 'CLAUDE'
        ? config.model?.CLAUDE || DEFAULT_CONFIG.model.CLAUDE
        : config.model?.GEMINI || DEFAULT_CONFIG.model.GEMINI;
  const footer = `

  ---
  _Response generated using ${modelUsed}_`;
  await postComment(owner, repo, prNumber, `${header}\n\n${explanation}${footer}`);
}

// Execute
main().catch((err) => {
  console.error('[Aido Explain] Fatal error:', err);
  process.exit(1);
});
