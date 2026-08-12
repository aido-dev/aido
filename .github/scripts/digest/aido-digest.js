/**
 * Aido Digest Script — the "what shipped" digest.
 *
 * Summarizes the pull requests merged in a repository over a recent window
 * (default: the last 7 days) into a skimmable digest and posts it as a new
 * GitHub Issue titled "📦 What shipped — <window>".
 *
 * Companion angle: the digest reports how many of the merged PRs were opened by
 * AI agents (Copilot, Claude Code, Cursor, …) — one section, not the headline.
 *
 * Runs on a schedule (or manual dispatch), not on a comment. Config lives in
 * aido-digest-config.json (co-located).
 *
 * Required env:
 * - GITHUB_TOKEN
 * - one provider key (GEMINI_API_KEY / CHATGPT_API_KEY / CLAUDE_API_KEY / OPENAI_API_KEY)
 */

const path = require('path');
const { DEFAULT_MODELS, generate, resolveModel } = require('../lib/providers');
const { octokit, getRepo } = require('../lib/github');
const { loadConfig } = require('../lib/config');
const { modelFooter } = require('../lib/text');

const CONFIG_PATH = path.join(__dirname, 'aido-digest-config.json');

const DEFAULT_CONFIG = {
  provider: 'GEMINI', // 'CHATGPT' | 'GEMINI' | 'CLAUDE' | 'OPENAI'
  model: { ...DEFAULT_MODELS },
  // baseURL: '<endpoint>',   // required only for provider: 'OPENAI'
  lookbackDays: 7, // window of merged PRs to summarize
  maxPrs: 40, // cap the number of PRs listed in the prompt (stats still count all)
  label: 'digest', // label applied to the digest issue (created if missing)
  destination: 'issue', // 'issue' | 'discussion'
  discussionCategory: 'Announcements', // category name (used when destination is 'discussion')
  title: 'What shipped', // issue title becomes "📦 <title> — <window>"
  language: 'English',
  tone: 'neutral, professional',
  length: 'medium', // 'short' | 'medium' | 'long'
  skipEmpty: true, // don't post an issue when nothing merged in the window
  // Authors treated as AI/bot agents (case-insensitive; trailing '*' = prefix).
  aiAuthors: [
    'copilot',
    'copilot[bot]',
    'claude[bot]',
    'claude-code[bot]',
    'cursor[bot]',
    'devin[bot]',
    'sweep-ai[bot]',
  ],
};

/** Case-insensitive exact or 'prefix*' match of an author against patterns. */
function matchesAiAuthor(author, patterns) {
  const a = (author || '').toLowerCase();
  if (!a) return false;
  return (patterns || []).some((p) => {
    const pat = String(p).toLowerCase();
    return pat.endsWith('*') ? a.startsWith(pat.slice(0, -1)) : a === pat;
  });
}

/** Compute deterministic stats so the digest's numbers are exact, not guessed. */
function computeStats(prs, aiAuthors) {
  const authors = new Set();
  let aiCount = 0;
  for (const pr of prs) {
    authors.add(pr.author);
    if (matchesAiAuthor(pr.author, aiAuthors)) aiCount += 1;
  }
  return { total: prs.length, aiCount, contributors: authors.size };
}

/** Human-readable window label, e.g. "Aug 2 – Aug 9, 2026". */
function windowLabel(since, until) {
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const year = until.getFullYear();
  return `${fmt(since)} – ${fmt(until)}, ${year}`;
}

/** Build the digest prompt from the merged-PR list + precomputed stats. */
function buildDigestPrompt(config, { label, prs, stats, maxPrs }) {
  const listed = prs.slice(0, maxPrs);
  const overflow = prs.length - listed.length;
  const lines = listed
    .map((pr) => {
      const labels = pr.labels?.length ? ` [${pr.labels.join(', ')}]` : '';
      return `- #${pr.number} "${pr.title}" by ${pr.author}${labels}`;
    })
    .join('\n');
  const more = overflow > 0 ? `\n- …and ${overflow} more merged PR(s)` : '';

  return `
ROLE:
You are Aido, writing a concise, skimmable "what shipped" digest for a GitHub repository.
Audience: the team and stakeholders catching up on recent changes. Language: ${config.language}.
Tone: ${config.tone}. Length: ${config.length}.

WINDOW: ${label}
STATS (authoritative — use these exact numbers, do not recount):
- Merged PRs: ${stats.total}
- Opened by AI agents (Copilot / Claude Code / Cursor / …): ${stats.aiCount}
- Distinct contributors: ${stats.contributors}

MERGED PULL REQUESTS:
${lines}${more}

WRITE THE DIGEST (Markdown, no top-level title — the issue already has one):
1. A 1–2 sentence overview of what shipped this window.
2. **Highlights** — group the notable changes into a few themed bullets (features, fixes, docs, chores). Reference PRs as #number. Be specific; skip trivia.
3. **AI-authored PRs** — one short line noting how many of the merged PRs were opened by AI agents (from STATS) and, if any stand out, which.
4. **Heads-up** (optional) — any risky or notable change worth a closer look.

Constraints: no code blocks or diffs; keep it tight; do not invent PRs or numbers beyond those listed.
`.trim();
}

/**
 * Only post a digest when there's actually something to report. With the
 * default `skipEmpty: true`, a window with no merged PRs produces no issue;
 * set `skipEmpty: false` to always post (e.g. a weekly heartbeat).
 */
function shouldPost(prs, config) {
  if (prs.length > 0) return true;
  return config?.skipEmpty === false;
}

/** Digest destination: 'issue' (default) or 'discussion'. */
function resolveDestination(config) {
  return String(config?.destination || 'issue').toLowerCase() === 'discussion'
    ? 'discussion'
    : 'issue';
}

/**
 * Post the digest as a GitHub Discussion. Requires Discussions enabled on the
 * repo, a category to post under, and `discussions: write` permission. Uses the
 * GraphQL API (Discussions have no REST create). Falls back to the first
 * category if the configured name isn't found.
 */
async function postDiscussion(owner, repo, title, body, categoryName) {
  const info = await octokit.graphql(
    `query ($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        id
        discussionCategories(first: 50) { nodes { id name } }
      }
    }`,
    { owner, repo },
  );
  const repoId = info?.repository?.id;
  const cats = info?.repository?.discussionCategories?.nodes || [];
  if (!repoId || cats.length === 0) {
    throw new Error(
      'Discussions are not enabled on this repository (or have no categories). ' +
        'Enable Discussions and add a category, or set `destination` to "issue".',
    );
  }
  const wanted = String(categoryName || '').toLowerCase();
  let cat = cats.find((c) => c.name.toLowerCase() === wanted);
  if (!cat) {
    cat = cats[0];
    if (categoryName) {
      console.warn(
        `[Aido Digest] Discussion category '${categoryName}' not found; using '${cat.name}'.`,
      );
    }
  }
  const res = await octokit.graphql(
    `mutation ($repoId: ID!, $catId: ID!, $title: String!, $body: String!) {
      createDiscussion(input: { repositoryId: $repoId, categoryId: $catId, title: $title, body: $body }) {
        discussion { url }
      }
    }`,
    { repoId, catId: cat.id, title, body },
  );
  return res?.createDiscussion?.discussion?.url;
}

/** Ensure the digest label exists (idempotent — ignores "already exists"). */
async function ensureLabel(owner, repo, name) {
  if (!name) return;
  try {
    await octokit.issues.createLabel({ owner, repo, name, color: '6f42c1' });
  } catch (e) {
    // 422 = label already exists; anything else is non-fatal for the digest.
    if (e?.status !== 422)
      console.warn(`[Aido Digest] Could not create label '${name}': ${e.message || e}`);
  }
}

/** Fetch all PRs merged since `sinceISO` (YYYY-MM-DD), newest first. */
async function fetchMergedPrs(owner, repo, sinceISO) {
  const q = `repo:${owner}/${repo} is:pr is:merged merged:>=${sinceISO}`;
  const items = await octokit.paginate(
    octokit.search.issuesAndPullRequests,
    { q, sort: 'created', order: 'desc', per_page: 100 },
    (response) => response.data.items ?? response.data,
  );
  const prs = items.map((it) => ({
    number: it.number,
    title: it.title,
    author: it.user?.login || 'unknown',
    labels: (it.labels || []).map((l) => (typeof l === 'string' ? l : l && l.name)).filter(Boolean),
    url: it.html_url,
    mergedAt: it.pull_request?.merged_at || it.closed_at || '',
  }));
  prs.sort((a, b) => String(b.mergedAt).localeCompare(String(a.mergedAt)));
  return prs;
}

async function main() {
  const { owner, repo } = getRepo();
  const config = loadConfig(CONFIG_PATH, DEFAULT_CONFIG, ['model', 'aiAuthors'], 'Aido Digest');
  const provider = (config.provider || 'GEMINI').toUpperCase();
  const model = resolveModel(config, provider);
  const lookbackDays = Number(config.lookbackDays) > 0 ? Number(config.lookbackDays) : 7;
  const maxPrs = Number(config.maxPrs) > 0 ? Number(config.maxPrs) : 40;

  const until = new Date();
  const since = new Date(until.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const sinceISO = since.toISOString().slice(0, 10);
  const label = windowLabel(since, until);

  console.log(`[Aido Digest] ${owner}/${repo} — merged since ${sinceISO} (${lookbackDays}d)`);
  const prs = await fetchMergedPrs(owner, repo, sinceISO);
  console.log(`[Aido Digest] ${prs.length} merged PR(s) in window.`);

  if (!shouldPost(prs, config)) {
    console.log('[Aido Digest] Nothing merged in the window; skipping (skipEmpty).');
    return;
  }

  const stats = computeStats(prs, config.aiAuthors);
  const prompt = buildDigestPrompt(config, { label, prs, stats, maxPrs });

  const digest = await generate(provider, prompt, {
    model,
    baseURL: config.baseURL,
    maxTokens: 1500,
  });

  const statsLine =
    `**By the numbers:** ${stats.total} PR(s) merged · ${stats.aiCount} by AI agents · ` +
    `${stats.contributors} contributor(s)`;
  const body = `${digest.trim()}\n\n---\n${statsLine}${modelFooter(model)}`;
  const title = `📦 ${config.title || 'What shipped'} — ${label}`;

  if (resolveDestination(config) === 'discussion') {
    const url = await postDiscussion(owner, repo, title, body, config.discussionCategory);
    console.log(`[Aido Digest] Posted discussion: ${url}`);
  } else {
    await ensureLabel(owner, repo, config.label);
    const { data: issue } = await octokit.issues.create({
      owner,
      repo,
      title,
      body,
      labels: config.label ? [config.label] : [],
    });
    console.log(`[Aido Digest] Posted issue: ${issue.html_url}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[Aido Digest] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_CONFIG,
  matchesAiAuthor,
  computeStats,
  windowLabel,
  buildDigestPrompt,
  shouldPost,
  resolveDestination,
  fetchMergedPrs,
};
