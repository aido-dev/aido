/**
 * Aido Docs Script
 *
 * Drafts or augments documentation (README, function docs) for a PR.
 *
 * - Reads configuration from aido-docs-config.json (co-located)
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
const { truncate, buildFilesSummary, fillTemplate } = require('../lib/text');

const CONFIG_PATH = path.join(__dirname, 'aido-docs-config.json');

// Diff truncation to keep prompts reasonable
const DIFF_MAX_CHARS = 15000;

// Default configuration
const DEFAULT_CONFIG = {
  provider: 'GEMINI', // 'CHATGPT' | 'GEMINI' | 'CLAUDE'
  model: { ...DEFAULT_MODELS },
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

  return parts.join('\n\n');
}

/**
 * Main entrypoint
 */
async function main() {
  const { owner, repo } = getRepo();

  const prNumber = getPrNumberFromEvent();
  if (!prNumber) throw new Error('No PR number found in event.');

  const config = loadConfig(CONFIG_PATH, DEFAULT_CONFIG, ['model', 'include'], 'Aido Docs');
  const provider = (config.provider || 'GEMINI').toUpperCase();
  const model = resolveModel(config, provider);

  // Build PR context
  const pr = await getPr(owner, repo, prNumber);
  const files = await getPrFiles(owner, repo, prNumber);
  const diff = config.include?.diff ? await getPrDiff(owner, repo, prNumber) : '';

  const prompt = buildPrompt(config, {
    prTitle: pr.title || '',
    prBody: pr.body || '',
    filesSummary: config.include?.filesSummary ? buildFilesSummary(files) : '',
    diff: truncate(diff, DIFF_MAX_CHARS),
  });

  // Generate docs content
  let docs = '';
  try {
    docs = await generate(provider, prompt, { model, maxTokens: 2000 });
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
  const footer = `\n\n---\n_This is an AI-generated documentation draft. Please review, edit, and commit changes as appropriate._\n\n_Response generated using ${model}_`;
  await postComment(owner, repo, prNumber, `${header}\n\n${docs}${footer}`);
}

// Execute
main().catch((err) => {
  console.error('[Aido Docs] Fatal error:', err);
  process.exit(1);
});
