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

const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/rest');

// Environment
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const CHATGPT_API_KEY = process.env.CHATGPT_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const GITHUB_EVENT_PATH = process.env.GITHUB_EVENT_PATH;
const REPO_FULL = process.env.GITHUB_REPOSITORY;

// API Client
const octokit = new Octokit({ auth: GITHUB_TOKEN });

// Local Config
const CONFIG_FILENAME = 'aido-suggest-config.json';
const CONFIG_PATH = path.join(__dirname, CONFIG_FILENAME);

// Truncation to keep prompts manageable (per file)
const DIFF_MAX_CHARS = 6000;

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

// Utils
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

function truncate(str, max) {
  if (!str) return '';
  if (str.length <= max) return str;
  const head = Math.floor(max * 0.7);
  const tail = max - head - 30;
  return `${str.slice(0, head)}\n...\n[truncated]\n...\n${str.slice(-tail)}`;
}

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

// GitHub PR Context
async function getPrContext(owner, repo, prNumber) {
  const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: prNumber });

  const files = await octokit.paginate(octokit.pulls.listFiles, {
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });

  return {
    prTitle: pr.title || '',
    prBody: pr.body || '',
    files, // each has filename, status, additions, deletions, changes, patch (diff), etc.
  };
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

// Providers
async function generateWithChatGPT(prompt, model) {
  if (!CHATGPT_API_KEY) throw new Error('CHATGPT_API_KEY is not set.');
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: CHATGPT_API_KEY });
  const resp = await client.chat.completions.create({
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

// Reformat Pass
async function reformatToContract(provider, model, rawText) {
  const reformatPrompt = [
    'Reformat the following content into the exact output contract below. Return only the suggestions; no commentary.',
    OUTPUT_CONTRACT,
    '--- BEGIN CONTENT TO REFORMAT ---',
    rawText,
    '--- END CONTENT TO REFORMAT ---',
  ].join('\n\n');

  if (provider === 'CHATGPT') return await generateWithChatGPT(reformatPrompt, model);
  if (provider === 'GEMINI') return await generateWithGemini(reformatPrompt, model);
  if (provider === 'CLAUDE') return await generateWithClaude(reformatPrompt, model);
  throw new Error(`Unknown provider: ${provider}`);
}

// Post Comment
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
  if (!REPO_FULL) throw new Error('GITHUB_REPOSITORY is not set.');
  const [owner, repo] = REPO_FULL.split('/');

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

  // Load config
  const config = loadConfig();
  const provider = (config.provider || 'GEMINI').toUpperCase();

  // Build global context
  const ctx = await getPrContext(owner, repo, prNumber);

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
      if (provider === 'CHATGPT') {
        text = await generateWithChatGPT(filePrompt, config.model?.CHATGPT);
      } else if (provider === 'GEMINI') {
        text = await generateWithGemini(filePrompt, config.model?.GEMINI);
      } else if (provider === 'CLAUDE') {
        text = await generateWithClaude(filePrompt, config.model?.CLAUDE);
      } else {
        throw new Error(`Unknown provider: ${provider}`);
      }

      // Reformat once if not compliant
      if (text && !isContractCompliant(text)) {
        const reformatted = await reformatToContract(
          provider,
          provider === 'CHATGPT'
            ? config.model?.CHATGPT
            : provider === 'CLAUDE'
              ? config.model?.CLAUDE
              : config.model?.GEMINI,
          text,
        );
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

  const modelUsed =
    provider === 'CHATGPT'
      ? config.model?.CHATGPT || DEFAULT_CONFIG.model.CHATGPT
      : provider === 'CLAUDE'
        ? config.model?.CLAUDE || DEFAULT_CONFIG.model.CLAUDE
        : config.model?.GEMINI || DEFAULT_CONFIG.model.GEMINI;

  const header = '## ✨ Aido Suggestions (Concrete improvements & small refactors)\n';
  const footer = `\n\n---\n_Response generated using ${modelUsed}_`;
  const body = `${header}\n${allSuggestions.join('\n\n---\n\n')}${footer}`;

  await postComment(owner, repo, prNumber, body);
}

// Execute
main().catch((err) => {
  console.error('[Aido Suggest] Fatal error:', err);
  process.exit(1);
});
