/**
 * Aido Summarize Script
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

const CONFIG_PATH = path.join(__dirname, 'aido-summarize-config.json');

// Reasonable max size for diff to keep prompts under control
const DIFF_MAX_CHARS = 15000;

// Default configuration if aido-summarize-config.json is missing or incomplete
const DEFAULT_CONFIG = {
  provider: 'GEMINI', // 'CHATGPT' | 'GEMINI' | 'CLAUDE'
  model: { ...DEFAULT_MODELS },
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

  return parts.join('\n\n');
}

/**
 * Entrypoint
 */
async function main() {
  const { owner, repo } = getRepo();

  const prNumber = getPrNumberFromEvent();
  if (!prNumber) throw new Error('No PR number found in event.');

  const config = loadConfig(CONFIG_PATH, DEFAULT_CONFIG, ['model', 'include'], 'Aido Summarize');
  const provider = (config.provider || 'GEMINI').toUpperCase();
  const model = resolveModel(config, provider);

  // Build PR context
  const pr = await getPr(owner, repo, prNumber);
  const files = await getPrFiles(owner, repo, prNumber);
  const diff = config.include?.diff ? await getPrDiff(owner, repo, prNumber) : '';

  const prompt = buildPrompt(config, {
    prTitle: pr.title || '',
    prBody: pr.body || '',
    filesSummary: buildFilesSummary(files),
    diff: truncate(diff, DIFF_MAX_CHARS),
  });

  // Generate summary via selected provider
  let summaryText = '';
  try {
    summaryText = await generate(provider, prompt, { model, maxTokens: 1000 });
  } catch (e) {
    // Post error for visibility and rethrow
    await postComment(
      owner,
      repo,
      prNumber,
      `**[Aido Summarize ERROR]** Failed to generate summary with provider '${provider}'.\n\nDetails: ${e.message || e}`,
    );
    throw e;
  }

  const header = '## 📝 Aido PR Summary';
  await postComment(owner, repo, prNumber, `${header}\n\n${summaryText}${modelFooter(model)}`);
}

// Execute
main().catch((err) => {
  console.error('[Aido Summarize] Fatal error:', err);
  process.exit(1);
});
