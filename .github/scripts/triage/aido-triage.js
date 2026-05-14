/**
 * Aido Triage Script
 *
 * Triages a GitHub issue:
 * - Classifies the issue (bug | feature | chore | security | question | docs | etc.)
 * - Suggests labels (constrained to a configured candidate list)
 * - Surfaces similar / possibly-related open issues
 * - Optionally applies the suggested labels (if config.applyLabels === true)
 * - Posts a triage summary as an issue comment
 *
 * Required env:
 * - GITHUB_TOKEN
 * - CHATGPT_API_KEY (if provider is CHATGPT)
 * - GEMINI_API_KEY  (if provider is GEMINI)
 * - CLAUDE_API_KEY  (if provider is CLAUDE)
 *
 * The workflow creates a synthetic event file with issue.number.
 */

const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/rest');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const CHATGPT_API_KEY = process.env.CHATGPT_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const GITHUB_EVENT_PATH = process.env.GITHUB_EVENT_PATH;

const octokit = new Octokit({ auth: GITHUB_TOKEN });

const CONFIG_FILENAME = 'aido-triage-config.json';
const CONFIG_PATH = path.join(__dirname, CONFIG_FILENAME);

const BODY_MAX_CHARS = 6000;

const DEFAULT_CONFIG = {
  provider: 'GEMINI',
  model: {
    CHATGPT: 'gpt-4o-mini',
    GEMINI: 'gemini-2.5-flash',
    CLAUDE: 'claude-3-5-sonnet-latest',
  },
  language: 'English',
  tone: 'concise, pragmatic',
  outputFormat: 'markdown',
  applyLabels: false,
  maxSimilarIssues: 5,
  candidateLabels: [
    'bug',
    'feature',
    'enhancement',
    'chore',
    'refactor',
    'documentation',
    'security',
    'question',
    'needs-info',
  ],
  severityLabels: ['severity:low', 'severity:medium', 'severity:high', 'severity:critical'],
  additionalInstructions: '',
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        model: { ...DEFAULT_CONFIG.model, ...(parsed.model || {}) },
      };
    }
  } catch (e) {
    console.error(`[Aido Triage] Failed to read/parse ${CONFIG_FILENAME}:`, e.message || e);
  }
  return DEFAULT_CONFIG;
}

function truncate(str, max) {
  if (!str) return '';
  if (str.length <= max) return str;
  return `${str.slice(0, max)}\n...\n[truncated]`;
}

async function getIssueContext(owner, repo, issueNumber) {
  const { data: issue } = await octokit.issues.get({ owner, repo, issue_number: issueNumber });
  return {
    title: issue.title || '',
    body: issue.body || '',
    author: issue.user?.login || '',
    currentLabels: (issue.labels || [])
      .map((l) => (typeof l === 'string' ? l : l.name))
      .filter(Boolean),
    state: issue.state,
    createdAt: issue.created_at,
  };
}

async function listRecentOpenIssues(owner, repo, excludeNumber, limit = 30) {
  const issues = await octokit.paginate(octokit.issues.listForRepo, {
    owner,
    repo,
    state: 'open',
    per_page: 100,
    sort: 'updated',
    direction: 'desc',
  });
  return issues
    .filter((i) => !i.pull_request && i.number !== excludeNumber)
    .slice(0, limit)
    .map((i) => ({
      number: i.number,
      title: i.title,
      labels: (i.labels || []).map((l) => (typeof l === 'string' ? l : l.name)),
    }));
}

function buildPrompt(config, ctx) {
  const language = config.language || DEFAULT_CONFIG.language;
  const tone = config.tone || DEFAULT_CONFIG.tone;
  const labelList = (config.candidateLabels || []).join(', ') || '(none provided)';
  const severityList = (config.severityLabels || []).join(', ') || '(none)';

  const similarBlock = ctx.recentIssues.length
    ? ctx.recentIssues
        .map((i) => `- #${i.number} "${i.title}" [${i.labels.join(', ') || 'no labels'}]`)
        .join('\n')
    : '(no other open issues)';

  const parts = [
    `You are an experienced issue triager. In ${language}, classify this GitHub issue and recommend labels. Tone: ${tone}.`,
    `Issue #${ctx.number} by @${ctx.author}\nTitle: ${ctx.title}\n\nBody:\n${truncate(ctx.body, BODY_MAX_CHARS) || '(empty)'}`,
    `Current labels: ${ctx.currentLabels.length ? ctx.currentLabels.join(', ') : '(none)'}`,
    `Allowed candidate labels (pick zero or more): ${labelList}`,
    `Allowed severity labels (use ONLY if this is clearly a security issue): ${severityList}`,
    `Other recent open issues in this repo (for similarity comparison):\n${similarBlock}`,
    `Produce a Markdown response with these sections, in order:

### Classification
A single short label like "bug" or "feature request" plus a one-sentence rationale.

### Recommended labels
A bullet list of suggested labels (only from the allowed candidate list above). For each, give a one-line rationale. If a security severity is warranted, include it from the severity list.

### Similar / possibly-related issues
List up to ${config.maxSimilarIssues || 5} issue numbers from the "other recent open issues" list that look related, each with a one-line reason. If none, say so.

### Next steps
2–4 concrete bullets the maintainer should do next.

After the human-readable Markdown, emit exactly ONE fenced JSON block (\`\`\`json) with this schema, to be machine-parsed:

\`\`\`json
{
  "type": "bug|feature|enhancement|chore|refactor|documentation|security|question|other",
  "labels": ["label1", "label2"],
  "severity": null,
  "similar": [{"number": 12, "reason": "…"}],
  "confidence": "low|medium|high"
}
\`\`\`

The "labels" array MUST be a subset of the allowed candidate labels. If you assign a security severity, include it in "severity" (one of the allowed severity labels) AND in "labels".`,
  ];

  if (config.additionalInstructions) {
    parts.push(`Additional instructions:\n${config.additionalInstructions}`);
  }

  return parts.join('\n\n');
}

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

/**
 * Extract the JSON block from the model's response. Returns null if not parseable.
 */
function extractJson(text) {
  if (!text) return null;
  const match = text.match(/```json\s*([\s\S]*?)```/i);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (e) {
    console.error('[Aido Triage] Failed to parse JSON block:', e.message);
    return null;
  }
}

async function postComment(owner, repo, issueNumber, body) {
  await octokit.issues.createComment({ owner, repo, issue_number: issueNumber, body });
}

async function applyLabels(owner, repo, issueNumber, labels) {
  if (!labels || labels.length === 0) return [];
  try {
    const { data } = await octokit.issues.addLabels({
      owner,
      repo,
      issue_number: issueNumber,
      labels,
    });
    return (data || []).map((l) => l.name);
  } catch (e) {
    console.error('[Aido Triage] Failed to apply labels:', e.message || e);
    return [];
  }
}

async function main() {
  const repoFull = process.env.GITHUB_REPOSITORY;
  if (!repoFull) throw new Error('GITHUB_REPOSITORY is not set.');
  const [owner, repo] = repoFull.split('/');

  // Get issue number from synthetic event
  let issueNumber = null;
  if (GITHUB_EVENT_PATH && fs.existsSync(GITHUB_EVENT_PATH)) {
    const event = require(GITHUB_EVENT_PATH);
    if (event.issue && event.issue.number) {
      issueNumber = event.issue.number;
    }
  }
  if (!issueNumber) throw new Error('No issue number found in event.');

  const config = loadConfig();
  const provider = (config.provider || 'GEMINI').toUpperCase();

  const issueCtx = await getIssueContext(owner, repo, issueNumber);
  const recentIssues = await listRecentOpenIssues(owner, repo, issueNumber, 30);

  const prompt = buildPrompt(config, {
    number: issueNumber,
    ...issueCtx,
    recentIssues,
  });

  let text = '';
  try {
    if (provider === 'CHATGPT') {
      text = await generateWithChatGPT(prompt, config.model?.CHATGPT);
    } else if (provider === 'GEMINI') {
      text = await generateWithGemini(prompt, config.model?.GEMINI);
    } else if (provider === 'CLAUDE') {
      text = await generateWithClaude(prompt, config.model?.CLAUDE);
    } else {
      throw new Error(`Unknown provider: ${provider}`);
    }
  } catch (e) {
    await postComment(
      owner,
      repo,
      issueNumber,
      `**[Aido Triage ERROR]** Failed to triage issue with provider '${provider}'.\n\nDetails: ${
        e.message || e
      }`,
    );
    throw e;
  }

  // Try to parse the JSON block for structured actions
  const parsed = extractJson(text);
  const allowedLabels = new Set([
    ...(config.candidateLabels || []),
    ...(config.severityLabels || []),
  ]);
  const labelsToApply = (parsed?.labels || [])
    .filter((l) => typeof l === 'string')
    .filter((l) => allowedLabels.has(l))
    .filter((l) => !issueCtx.currentLabels.includes(l));

  let appliedNote = '';
  if (config.applyLabels && labelsToApply.length > 0) {
    const applied = await applyLabels(owner, repo, issueNumber, labelsToApply);
    if (applied.length > 0) {
      appliedNote = `\n\n_🏷️ Labels applied automatically: ${applied.map((l) => `\`${l}\``).join(', ')}_`;
    }
  } else if (!config.applyLabels && labelsToApply.length > 0) {
    appliedNote = `\n\n_🏷️ Suggested labels (not applied — set \`applyLabels: true\` in config to auto-apply): ${labelsToApply.map((l) => `\`${l}\``).join(', ')}_`;
  }

  const header = '## 🧭 Aido Triage';
  const modelUsed =
    provider === 'CHATGPT'
      ? config.model?.CHATGPT || DEFAULT_CONFIG.model.CHATGPT
      : provider === 'CLAUDE'
        ? config.model?.CLAUDE || DEFAULT_CONFIG.model.CLAUDE
        : config.model?.GEMINI || DEFAULT_CONFIG.model.GEMINI;
  const footer = `\n\n---\n_AI-generated triage. Review before acting on the recommendations._\n\n_Response generated using ${modelUsed}_`;

  await postComment(owner, repo, issueNumber, `${header}\n\n${text}${appliedNote}${footer}`);
}

main().catch((err) => {
  console.error('[Aido Triage] Fatal error:', err);
  process.exit(1);
});
