/**
 * Aido Test Script
 *
 * Generates a structured test plan for a PR:
 * - Proposed test cases (functional, negative, edge cases)
 * - Identified test gaps
 * - Additional test-related tasks (fixtures, mocks, regression updates)
 *
 * - Reads configuration from aido-test-config.json (co-located)
 * - Builds PR context (title, description, files list, unified diff)
 * - Uses the configured provider (CHATGPT | GEMINI | CLAUDE) to produce output
 * - Posts the test plan as a PR comment
 *
 * Required env:
 * - GITHUB_TOKEN
 * - CHATGPT_API_KEY (if provider is CHATGPT)
 * - GEMINI_API_KEY (if provider is GEMINI)
 * - CLAUDE_API_KEY (if provider is CLAUDE)
 *
 * Notes:
 * - Designed for GitHub Actions with Node 20+ (global fetch available)
 * - The workflow creates a synthetic GITHUB_EVENT_PATH containing pull_request.number
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

// Configuration
const CONFIG_FILENAME = 'aido-test-config.json';
const CONFIG_PATH = path.join(__dirname, CONFIG_FILENAME);

// Truncation limit to keep prompts under control
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
  tone: 'pragmatic, quality-focused',
  length: 'medium', // 'short' | 'medium' | 'long'
  style: 'structured', // 'structured' | 'bullet-points' | 'narrative'
  outputFormat: 'markdown', // 'markdown' | 'plain-text'
  include: {
    title: true,
    body: true,
    filesSummary: true,
    diff: true,
  },
  testFocus: {
    unit: true,
    integration: true,
    e2e: true,
    regression: true,
    performance: false,
    security: false,
    accessibility: false,
  },
  deliverFormat:
    'Provide: (1) Test Plan Overview, (2) Test Matrix/Checklist, (3) Detailed Test Cases, (4) Gaps & TODOs, (5) Fixtures & Data Setup, (6) Mocks/Stubs, (7) Automation Notes, (8) Regression Suite Updates.',
  additionalInstructions:
    'Keep suggestions specific, actionable, and safe to implement incrementally. Use concise steps and clear expected results. Avoid speculation.',
  // Optional custom prompt template with placeholders:
  // {{language}}, {{tone}}, {{length}}, {{style}}, {{outputFormat}},
  // {{prTitle}}, {{prBody}}, {{filesSummary}}, {{diff}},
  // {{testFocus}}, {{deliverFormat}}
  promptTemplate: null,
};

/**
 * Load configuration with graceful fallback to defaults.
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
        testFocus: { ...DEFAULT_CONFIG.testFocus, ...(parsed.testFocus || {}) },
      };
    }
  } catch (e) {
    console.error(`[Aido Test] Failed to read/parse ${CONFIG_FILENAME}:`, e.message || e);
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
 * Create compact files summary.
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
 * Truncate long strings keeping head and tail.
 */
function truncate(str, max) {
  if (!str) return '';
  if (str.length <= max) return str;
  const head = Math.floor(max * 0.7);
  const tail = max - head - 30;
  return `${str.slice(0, head)}\n...\n[truncated]\n...\n${str.slice(-tail)}`;
}

/**
 * Apply placeholders to a template.
 */
function fillTemplate(template, ctx) {
  return template
    .replace(/{{language}}/g, ctx.language || '')
    .replace(/{{tone}}/g, ctx.tone || '')
    .replace(/{{length}}/g, ctx.length || '')
    .replace(/{{style}}/g, ctx.style || '')
    .replace(/{{outputFormat}}/g, ctx.outputFormat || '')
    .replace(/{{prTitle}}/g, ctx.prTitle || '')
    .replace(/{{prBody}}/g, ctx.prBody || '')
    .replace(/{{filesSummary}}/g, ctx.filesSummary || '')
    .replace(/{{diff}}/g, ctx.diff || '')
    .replace(/{{testFocus}}/g, ctx.testFocus || '')
    .replace(/{{deliverFormat}}/g, ctx.deliverFormat || '');
}

/**
 * Compose the test plan prompt.
 */
function buildPrompt(config, context) {
  const language = config.language || DEFAULT_CONFIG.language;
  const tone = config.tone || DEFAULT_CONFIG.tone;
  const length = config.length || DEFAULT_CONFIG.length;
  const style = config.style || DEFAULT_CONFIG.style;
  const outputFormat = (config.outputFormat || DEFAULT_CONFIG.outputFormat).toLowerCase();

  const focus = config.testFocus || {};
  const focusList =
    Object.entries(focus)
      .filter(([, v]) => !!v)
      .map(([k]) => k)
      .join(', ') || 'unit, integration, e2e, regression';

  const include = config.include || {};
  const parts = [];

  parts.push(
    `You are a senior SDET and QA strategist. In ${language}, produce a ${style} test plan with a ${tone} tone.`,
  );
  parts.push(
    `Target length: ${length}. Output format: ${outputFormat}. Primary focus areas: ${focusList}.`,
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
    `Deliverables:
- ${config.deliverFormat || DEFAULT_CONFIG.deliverFormat}

Structure and guidance:
1) Test Plan Overview & Risk Areas
   - Summarize what needs testing and key risks/assumptions.
2) Test Matrix / Checklist
   - Provide a checklist grouped by focus area (unit, integration, e2e, etc).
   - Include negative and edge cases.
3) Detailed Test Cases
   - For each case: Title, Preconditions, Steps, Expected Result.
   - Include examples for tricky logic, parsing, validation, and error handling.
4) Gaps & TODOs
   - Identify missing coverage and priority follow-ups.
5) Fixtures & Data Setup
   - Outline test data, fixtures, and seeding steps needed.
6) Mocks / Stubs
   - Recommend where to mock external services or slow/unstable dependencies.
7) Automation Notes
   - Suggest where to place tests and any CI configuration hints.
8) Regression Suite Updates
   - Call out tests to add/update to prevent future regressions.

Requirements:
- Be accurate; if information is missing, call it out without inventing details.
- Prefer concise bullet points and headings if outputFormat is 'markdown'; avoid markdown syntax if outputFormat is 'plain-text'.
- Keep steps actionable and unambiguous.`,
  );

  if (config.additionalInstructions) {
    parts.push(`Additional instructions:\n${config.additionalInstructions}`);
  }

  const defaultPrompt = parts.join('\n\n');

  if (config.promptTemplate && typeof config.promptTemplate === 'string') {
    const testFocusSerialized = focusList;
    return fillTemplate(config.promptTemplate, {
      language,
      tone,
      length,
      style,
      outputFormat,
      prTitle: context.prTitle || '',
      prBody: context.prBody || '',
      filesSummary: context.filesSummary || '',
      diff: context.diff || '',
      testFocus: testFocusSerialized,
      deliverFormat: config.deliverFormat || DEFAULT_CONFIG.deliverFormat,
    });
  }

  return defaultPrompt;
}

/**
 * Provider: ChatGPT
 */
async function generateWithChatGPT(prompt, model) {
  if (!CHATGPT_API_KEY) throw new Error('CHATGPT_API_KEY is not set.');
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
 * Provider: Claude (Anthropic)
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

  // Determine PR number from synthetic event
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

  // Generate test plan
  let testPlan = '';
  try {
    if (provider === 'CHATGPT') {
      testPlan = await generateWithChatGPT(prompt, config.model?.CHATGPT);
    } else if (provider === 'GEMINI') {
      testPlan = await generateWithGemini(prompt, config.model?.GEMINI);
    } else if (provider === 'CLAUDE') {
      testPlan = await generateWithClaude(prompt, config.model?.CLAUDE);
    } else {
      throw new Error(`Unknown provider: ${provider}`);
    }
  } catch (e) {
    await postComment(
      owner,
      repo,
      prNumber,
      `**[Aido Test ERROR]** Failed to generate test plan with provider '${provider}'.\n\nDetails: ${e.message || e}`,
    );
    throw e;
  }

  // Post result (append provider/model footer)
  const header = '## ✅ Aido Test Plan & Gaps';
  const modelUsed =
    provider === 'CHATGPT'
      ? config.model?.CHATGPT || DEFAULT_CONFIG.model.CHATGPT
      : provider === 'CLAUDE'
        ? config.model?.CLAUDE || DEFAULT_CONFIG.model.CLAUDE
        : config.model?.GEMINI || DEFAULT_CONFIG.model.GEMINI;
  const footer = `

  ---
  _Response generated using ${modelUsed}_`;
  await postComment(owner, repo, prNumber, `${header}\n\n${testPlan}${footer}`);
}

// Execute
main().catch((err) => {
  console.error('[Aido Test] Fatal error:', err);
  process.exit(1);
});
