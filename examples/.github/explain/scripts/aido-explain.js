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

const CONFIG_PATH = path.join(__dirname, 'aido-explain-config.json');

// Diff truncation to keep prompts reasonable
const DIFF_MAX_CHARS = 15000;

// Default configuration
const DEFAULT_CONFIG = {
  provider: 'GEMINI', // 'CHATGPT' | 'GEMINI' | 'CLAUDE'
  model: { ...DEFAULT_MODELS },
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

  return sections.join('\n\n');
}

/**
 * Main entrypoint
 */
async function main() {
  const { owner, repo } = getRepo();

  const prNumber = getPrNumberFromEvent();
  if (!prNumber) throw new Error('No PR number found in event.');

  const config = loadConfig(CONFIG_PATH, DEFAULT_CONFIG, ['model', 'include'], 'Aido Explain');
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

  // Generate explanation
  let explanation = '';
  try {
    explanation = await generate(provider, prompt, { model, maxTokens: 1600 });
  } catch (e) {
    await postComment(
      owner,
      repo,
      prNumber,
      `**[Aido Explain ERROR]** Failed to generate explanation with provider '${provider}'.\n\nDetails: ${e.message || e}`,
    );
    throw e;
  }

  const header = '## 📘 Aido PR Explanation';
  await postComment(owner, repo, prNumber, `${header}\n\n${explanation}${modelFooter(model)}`);
}

// Execute
main().catch((err) => {
  console.error('[Aido Explain] Fatal error:', err);
  process.exit(1);
});
