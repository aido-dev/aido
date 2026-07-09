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
 * Output format (strict, per changed file):
 *
 * <short title>
 *
 * Rationale: <one sentence>
 *
 * File: <filename>
 * Replace this:
 * ```
 * <old code>
 * ```
 *
 * With this:
 * ```
 * <new code>
 * ```
 *
 * Estimated Risk: <Low|Medium|High>
 * Estimated Effort: <XS|S|M|L>
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
 * - Uses triple backticks, no diff fences, no suggestion fences.
 */

const path = require('path');
const { DEFAULT_MODELS, generate, resolveModel } = require('../lib/providers');
const { getRepo, getPrNumberFromEvent, getPr, getPrFiles, postComment } = require('../lib/github');
const { loadConfig } = require('../lib/config');
const { truncate, buildFilesSummary, modelFooter } = require('../lib/text');

const CONFIG_PATH = path.join(__dirname, 'aido-suggest-config.json');

// Truncation to keep prompts manageable (per file)
const DIFF_MAX_CHARS = 6000;

// Default config
const DEFAULT_CONFIG = {
  provider: 'GEMINI', // 'CHATGPT' | 'GEMINI' | 'CLAUDE'
  model: { ...DEFAULT_MODELS },
  language: 'English',
  tone: 'constructive, pragmatic, professional',
  length: 'medium',
  style: 'bullet-points',
  include: {
    title: true,
    body: true,
    filesSummary: true,
    diff: true,
  },
  guardrails:
    'Focus on small, safe refactors and concrete improvements. Avoid large-scale rewrites unless trivially safe. Prefer clarity, maintainability, testability, and small performance wins. Respect existing patterns and conventions where reasonable.',
  // Natural Replace/With format w/ triple backticks
  deliverFormat:
    'Each suggestion must follow this exact structure:\n\n' +
    '<short, clear title>\n\n' +
    'Rationale: <short, one-sentence rationale>\n\n' +
    'File: <filename>\n' +
    'Replace this:\n' +
    '```\n<old code>\n```\n\n' +
    'With this:\n' +
    '```\n<new code>\n```\n\n' +
    'Estimated Risk: <Low|Medium|High>\n' +
    'Estimated Effort: <XS|S|M|L>',
  additionalInstructions:
    'Use clear, minimal code blocks. No diff fences. No suggestion fences. No HTML. Keep code runnable where applicable.',
  promptTemplate: null,
};

// Strict output contract & example
const OUTPUT_CONTRACT = `
 You must output one or more suggestions. For EACH suggestion, use this exact structure:

 <short, clear title>

 Rationale: <short, one-sentence rationale>

 File: <filename>
 Replace this:
 \`\`\`
 <old code>
 \`\`\`

 With this:
 \`\`\`
 <new code>
 \`\`\`

 Estimated Risk: <Low|Medium|High>
 Estimated Effort: <XS|S|M|L>

 Rules:
 - Use triple backticks only (no ~~~, no diff fences, no \`\`\`suggestion).
 - No extra commentary or HTML outside the format.
 - One blank line between each section.
 - Be concise and consistent in indentation.
 - Output may contain multiple suggestions, separated by two newlines.
 `.trim();

function isContractCompliant(text) {
  if (!text) return false;
  const must = [
    'Rationale:',
    'File:',
    'Replace this:',
    'With this:',
    'Estimated Risk:',
    'Estimated Effort:',
  ];
  if (!must.every((m) => text.includes(m))) return false;

  // Ensure a title exists before the first "Rationale:" line
  const ratioMatch = text.match(/^Rationale:/m);
  if (!ratioMatch) return false;
  const beforeRationale = text.slice(0, ratioMatch.index || 0);
  const preLines = beforeRationale
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  if (preLines.length === 0) return false;
  const titleLine = preLines[preLines.length - 1].trim();
  const invalidStarts = [
    'Rationale:',
    'File:',
    'Replace this:',
    'With this:',
    'Estimated Risk:',
    'Estimated Effort:',
    '```',
  ];
  if (invalidStarts.some((p) => titleLine.startsWith(p))) return false;

  // triple backticks should be even count
  const ticks = (text.match(/```/g) || []).length;
  return ticks % 2 === 0;
}

// Keep triple backticks; just fix accidental ```suggestion and unbalanced fences
function sanitizeFencesKeepBackticks(text) {
  if (!text) return '';
  let out = text;

  // Avoid GitHub "apply suggestion" blocks
  out = out.replace(/```suggestion/g, '```');

  // If fences unbalanced, close them
  const ticks = (out.match(/```/g) || []).length;
  if (ticks % 2 !== 0) out += '\n```';

  return out;
}

// Prompt Building (per file)
function buildPerFilePrompt(config, globalCtx, file) {
  const language = config.language || DEFAULT_CONFIG.language;
  const tone = config.tone || DEFAULT_CONFIG.tone;
  const length = config.length || DEFAULT_CONFIG.length;
  const style = config.style || DEFAULT_CONFIG.style;
  const filesSummary = buildFilesSummary(globalCtx.files);

  const fileHeader = [
    `You are an experienced senior engineer and code reviewer. In ${language}, provide ${style} suggestions with a ${tone} tone.`,
    `Target length: ${length}. Suggestions must be concrete and actionable.`,
    `Guardrails:\n${config.guardrails || DEFAULT_CONFIG.guardrails}`,
    `Deliver the output in this format:\n${config.deliverFormat || DEFAULT_CONFIG.deliverFormat}`,
    `STRICT OUTPUT CONTRACT:\n${OUTPUT_CONTRACT}`,
    ``,
    `PR Title:\n${globalCtx.prTitle}`,
    `PR Description:\n${globalCtx.prBody || '(no description)'}`,
    `Files Changed:\n${filesSummary}`,
    ``,
    `You are now focusing ONLY on this file: ${file.filename}`,
    `Its unified diff (may be truncated) is below. Base your suggestions strictly on this file and include "File: ${file.filename}" exactly as shown:`,
    `--- BEGIN DIFF (${file.filename}) ---`,
    truncate(file.patch || '(no textual diff available)', DIFF_MAX_CHARS),
    `--- END DIFF ---`,
    ``,
    `Output one or more suggestions strictly following the contract. If the diff is empty or binary, either output nothing or a single suggestion only if you can make a clear, file-specific improvement from context.`,
  ];

  return fileHeader.join('\n');
}

// Reformat Pass
async function reformatToContract(provider, model, rawText) {
  const reformatPrompt = [
    'Reformat the following content into the exact output contract below. Return only the suggestions; no commentary.',
    OUTPUT_CONTRACT,
    '--- BEGIN CONTENT TO REFORMAT ---',
    rawText,
    '--- END CONTENT TO REFORMAT ---',
  ].join('\n\n');

  return generate(provider, reformatPrompt, { model });
}

// Main
async function main() {
  const { owner, repo } = getRepo();

  const prNumber = getPrNumberFromEvent();
  if (!prNumber) throw new Error('No PR number found in event.');

  // Load config
  const config = loadConfig(CONFIG_PATH, DEFAULT_CONFIG, ['model', 'include'], 'Aido Suggest');
  const provider = (config.provider || 'GEMINI').toUpperCase();
  const model = resolveModel(config, provider);

  // Build global context
  const pr = await getPr(owner, repo, prNumber);
  const files = await getPrFiles(owner, repo, prNumber);
  const ctx = { prTitle: pr.title || '', prBody: pr.body || '', files };

  // Generate per-file suggestions and concatenate
  let allSuggestions = [];
  for (const f of ctx.files) {
    // Skip non-textual/binary diffs if no patch
    const patch = f.patch || '';
    if (!patch.trim()) continue;

    const filePrompt = buildPerFilePrompt(config, ctx, f);

    // Call selected provider
    let text = '';
    try {
      text = await generate(provider, filePrompt, { model });

      // Reformat once if not compliant
      if (text && !isContractCompliant(text)) {
        const reformatted = await reformatToContract(provider, model, text);
        if (isContractCompliant(reformatted)) text = reformatted;
      }

      text = sanitizeFencesKeepBackticks(text);

      if (text.trim()) {
        // Ensure each suggestion includes the exact File: line for this file.
        // If the model omitted or changed it, insert it immediately before "Replace this:".
        const hasCorrectFileLine = new RegExp(`^File:\\s*${f.filename}\\s*$`, 'm').test(text);
        let ensured = text.trim();
        if (!hasCorrectFileLine) {
          const lines = ensured.split('\n');
          const idx = lines.findIndex((l) => l.trim() === 'Replace this:');
          if (idx !== -1) {
            lines.splice(idx, 0, `File: ${f.filename}`);
            ensured = lines.join('\n');
          } else {
            // Fallback if "Replace this:" not found (shouldn't happen if compliant)
            ensured = `File: ${f.filename}\n${ensured}`;
          }
        }

        allSuggestions.push(ensured);
      }
    } catch (e) {
      // Continue with other files; also post a small note for visibility
      console.error(`[Aido Suggest] Provider error on file ${f.filename}:`, e.message || e);
      allSuggestions.push(
        `Unable to analyze ${f.filename}\n\nRationale: The provider returned an error for this file.\n\nFile: ${f.filename}\nReplace this:\n\`\`\`\n// (no change)\n\`\`\`\n\nWith this:\n\`\`\`\n// (no change)\n\`\`\`\n\nEstimated Risk: Low\nEstimated Effort: XS`,
      );
    }
  }

  // If nothing produced (e.g., all binary), fallback to a single-fileless message.
  if (allSuggestions.length === 0) {
    allSuggestions = [
      'No textual changes detected\n\n' +
        'Rationale: No textual diffs were available to analyze.\n\n' +
        'File: (n/a)\n' +
        'Replace this:\n```\n// (no change)\n```\n\n' +
        'With this:\n```\n// (no change)\n```\n\n' +
        'Estimated Risk: Low\n' +
        'Estimated Effort: XS',
    ];
  }

  const header = '## ✨ Aido Suggestions (Concrete improvements & small refactors)\n';
  const body = `${header}\n${allSuggestions.join('\n\n---\n\n')}${modelFooter(model)}`;

  await postComment(owner, repo, prNumber, body);
}

// Execute
main().catch((err) => {
  console.error('[Aido Suggest] Fatal error:', err);
  process.exit(1);
});
