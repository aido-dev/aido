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

const path = require('path');
const { DEFAULT_MODELS, generate, resolveModel } = require('../lib/providers');
const {
  getRepo,
  getPrNumberFromEvent,
  getPr,
  getPrFiles,
  getPrDiff,
  postComment,
} = require('../lib/github');
const { loadConfig } = require('../lib/config');
const { truncate, buildFilesSummary, fillTemplate, modelFooter } = require('../lib/text');

const CONFIG_PATH = path.join(__dirname, 'aido-test-config.json');

// Truncation limit to keep prompts under control
const DIFF_MAX_CHARS = 15000;

// Default configuration
const DEFAULT_CONFIG = {
  provider: 'GEMINI', // 'CHATGPT' | 'GEMINI' | 'CLAUDE'
  model: { ...DEFAULT_MODELS },
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

  if (config.promptTemplate && typeof config.promptTemplate === 'string') {
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
      testFocus: focusList,
      deliverFormat: config.deliverFormat || DEFAULT_CONFIG.deliverFormat,
    });
  }

  return parts.join('\n\n');
}

/**
 * Main entrypoint
 */
async function main() {
  const { owner, repo } = getRepo();

  const prNumber = getPrNumberFromEvent();
  if (!prNumber) throw new Error('No PR number found in event.');

  const config = loadConfig(
    CONFIG_PATH,
    DEFAULT_CONFIG,
    ['model', 'include', 'testFocus'],
    'Aido Test',
  );
  const provider = (config.provider || 'GEMINI').toUpperCase();
  const model = resolveModel(config, provider);

  // Build context
  const pr = await getPr(owner, repo, prNumber);
  const files = await getPrFiles(owner, repo, prNumber);
  const diff = config.include?.diff ? await getPrDiff(owner, repo, prNumber) : '';

  const prompt = buildPrompt(config, {
    prTitle: pr.title || '',
    prBody: pr.body || '',
    filesSummary: config.include?.filesSummary ? buildFilesSummary(files) : '',
    diff: truncate(diff, DIFF_MAX_CHARS),
  });

  // Generate test plan
  let testPlan = '';
  try {
    testPlan = await generate(provider, prompt, { model, maxTokens: 2000 });
  } catch (e) {
    await postComment(
      owner,
      repo,
      prNumber,
      `**[Aido Test ERROR]** Failed to generate test plan with provider '${provider}'.\n\nDetails: ${e.message || e}`,
    );
    throw e;
  }

  const header = '## ✅ Aido Test Plan & Gaps';
  await postComment(owner, repo, prNumber, `${header}\n\n${testPlan}${modelFooter(model)}`);
}

// Execute
main().catch((err) => {
  console.error('[Aido Test] Fatal error:', err);
  process.exit(1);
});
