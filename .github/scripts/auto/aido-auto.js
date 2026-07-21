/**
 * Aido Auto — gate for auto-running Aido on AI-authored pull requests.
 *
 * Positioning: Aido is a companion for the PRs your AI writes. When an AI/bot
 * agent (Copilot, Claude Code, Cursor, …) opens a PR, this gate decides whether
 * to automatically run a configured set of Aido commands so a human can quickly
 * understand, digest, and review code they didn't write.
 *
 * This script is intentionally dependency-free (reads the event and config from
 * disk only) so the gate job needs no `npm install` and stays fast. It emits
 * GitHub Actions step outputs consumed by aido-auto.yml:
 *   run=<bool>            — whether any command should run
 *   pr_number=<n>         — the PR to act on
 *   explain|summarize|review|docs|test=<bool>  — per-command flags
 *
 * Config: .github/scripts/auto/aido-auto-config.json (all fields optional).
 */

const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../lib/config');

const CONFIG_PATH = path.join(__dirname, 'aido-auto-config.json');

const KNOWN_COMMANDS = ['explain', 'summarize', 'review', 'docs', 'test'];

const DEFAULT_CONFIG = {
  // Master switch for auto-running on AI-authored PRs.
  enabled: true,
  // PR authors treated as AI/bot agents. Matched case-insensitively; an entry
  // ending in '*' is a prefix match (e.g. "renovate*"). Intentionally excludes
  // github-actions[bot] (too broad — many workflows open PRs as it) and
  // dependabot[bot] (its PRs run with a read-only token and no repo secrets, so
  // Aido can't post or call providers there — add it explicitly if you want it).
  aiAuthors: [
    'copilot',
    'copilot[bot]',
    'claude[bot]',
    'claude-code[bot]',
    'cursor[bot]',
    'devin[bot]',
    'sweep-ai[bot]',
  ],
  // Commands to run automatically. Companion-first defaults: help the human
  // understand and digest the change. Add 'review' to also review, etc.
  commands: ['explain', 'summarize'],
  // Per-PR opt-out: any of these labels on a PR suppresses the auto-run for
  // that PR only (case-insensitive). A `<!-- aido: skip -->` marker in the PR
  // body does the same. Neither requires a config change to use.
  skipLabels: ['no-aido'],
};

// PR-body marker that suppresses the auto-run for a single PR.
const SKIP_MARKER = /<!--\s*aido:\s*skip\s*-->/i;

/** Case-insensitive exact or 'prefix*' match of an author against patterns. */
function authorMatches(author, patterns) {
  const a = (author || '').toLowerCase();
  if (!a) return false;
  return (patterns || []).some((p) => {
    const pat = String(p).toLowerCase();
    return pat.endsWith('*') ? a.startsWith(pat.slice(0, -1)) : a === pat;
  });
}

/**
 * Decide whether to run and which commands.
 * @param config parsed config
 * @param author PR author login
 * @param context optional { labels: string[], body: string } for per-PR opt-out
 */
function decide(config, author, context = {}) {
  if (!config || config.enabled === false) {
    return { run: false, reason: 'disabled', commands: [] };
  }
  if (!authorMatches(author, config.aiAuthors)) {
    return { run: false, reason: 'author-not-ai', commands: [] };
  }
  // Per-PR opt-out (only relevant once we know it's an AI-authored PR).
  const { labels = [], body = '' } = context;
  const skipLabels = (config.skipLabels || []).map((l) => String(l).toLowerCase());
  if (labels.map((l) => String(l).toLowerCase()).some((l) => skipLabels.includes(l))) {
    return { run: false, reason: 'skipped-label', commands: [] };
  }
  if (SKIP_MARKER.test(body || '')) {
    return { run: false, reason: 'skipped-marker', commands: [] };
  }
  const commands = (config.commands || []).filter((c) => KNOWN_COMMANDS.includes(c));
  return {
    run: commands.length > 0,
    reason: commands.length ? 'ok' : 'no-commands',
    commands,
  };
}

function readEvent() {
  const p = process.env.GITHUB_EVENT_PATH;
  if (!p || !fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function main() {
  // aiAuthors/commands are arrays — replaced wholesale by config, not merged.
  const config = loadConfig(CONFIG_PATH, DEFAULT_CONFIG, [], 'Aido Auto');
  const event = readEvent();
  const pr = event && event.pull_request;
  const author = pr && pr.user && pr.user.login;
  const number = pr && pr.number;
  const labels = ((pr && pr.labels) || [])
    .map((l) => (typeof l === 'string' ? l : l && l.name))
    .filter(Boolean);
  const body = (pr && pr.body) || '';

  const result = decide(config, author, { labels, body });

  const lines = [
    `run=${result.run}`,
    `pr_number=${number || ''}`,
    ...KNOWN_COMMANDS.map((c) => `${c}=${result.commands.includes(c) ? 'true' : 'false'}`),
  ];
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join('\n') + '\n');
  }
  console.log(
    `[Aido Auto] author=${author || '(none)'} decision=${result.reason} commands=${
      result.commands.join(',') || '(none)'
    }`,
  );
}

if (require.main === module) main();

module.exports = { decide, authorMatches, DEFAULT_CONFIG, KNOWN_COMMANDS };
