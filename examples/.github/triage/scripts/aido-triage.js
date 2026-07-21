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

const path = require('path');
const { DEFAULT_MODELS, generate, resolveModel } = require('../lib/providers');
const { octokit, getRepo, getIssueNumberFromEvent, postComment } = require('../lib/github');
const { loadConfig } = require('../lib/config');
const { truncateTail } = require('../lib/text');

const CONFIG_PATH = path.join(__dirname, 'aido-triage-config.json');

const BODY_MAX_CHARS = 6000;

const DEFAULT_CONFIG = {
  provider: 'GEMINI',
  model: { ...DEFAULT_MODELS },
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
    `Issue #${ctx.number} by @${ctx.author}\nTitle: ${ctx.title}\n\nBody:\n${truncateTail(ctx.body, BODY_MAX_CHARS) || '(empty)'}`,
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
  const { owner, repo } = getRepo();

  const issueNumber = getIssueNumberFromEvent();
  if (!issueNumber) throw new Error('No issue number found in event.');

  const config = loadConfig(CONFIG_PATH, DEFAULT_CONFIG, ['model'], 'Aido Triage');
  const provider = (config.provider || 'GEMINI').toUpperCase();
  const model = resolveModel(config, provider);

  const issueCtx = await getIssueContext(owner, repo, issueNumber);
  const recentIssues = await listRecentOpenIssues(owner, repo, issueNumber, 30);

  const prompt = buildPrompt(config, {
    number: issueNumber,
    ...issueCtx,
    recentIssues,
  });

  let text = '';
  try {
    text = await generate(provider, prompt, { model, maxTokens: 2000 });
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
  const footer = `\n\n---\n_AI-generated triage. Review before acting on the recommendations._\n\n_Response generated using ${model}_`;

  await postComment(owner, repo, issueNumber, `${header}\n\n${text}${appliedNote}${footer}`);
}

main().catch((err) => {
  console.error('[Aido Triage] Fatal error:', err);
  process.exit(1);
});
