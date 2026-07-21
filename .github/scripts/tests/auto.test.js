const { test } = require('node:test');
const assert = require('node:assert/strict');

const { decide, authorMatches, DEFAULT_CONFIG, KNOWN_COMMANDS } = require('../auto/aido-auto');

test('authorMatches does case-insensitive exact matching', () => {
  assert.equal(authorMatches('Copilot', ['copilot']), true);
  assert.equal(authorMatches('copilot[bot]', ['copilot[bot]']), true);
  assert.equal(authorMatches('octocat', ['copilot']), false);
  assert.equal(authorMatches('', ['copilot']), false);
  assert.equal(authorMatches('copilot', []), false);
});

test('authorMatches supports prefix wildcards', () => {
  assert.equal(authorMatches('renovate[bot]', ['renovate*']), true);
  assert.equal(authorMatches('RENOVATE-approve[bot]', ['renovate*']), true);
  assert.equal(authorMatches('notrenovate', ['renovate*']), false);
});

test('decide runs the default commands for a known AI author', () => {
  const result = decide(DEFAULT_CONFIG, 'claude-code[bot]');
  assert.equal(result.run, true);
  assert.equal(result.reason, 'ok');
  assert.deepEqual(result.commands, ['explain', 'summarize']);
});

test('decide skips human authors', () => {
  const result = decide(DEFAULT_CONFIG, 'a-human-dev');
  assert.equal(result.run, false);
  assert.equal(result.reason, 'author-not-ai');
  assert.deepEqual(result.commands, []);
});

test('decide honors the master enabled switch', () => {
  const result = decide({ ...DEFAULT_CONFIG, enabled: false }, 'claude-code[bot]');
  assert.equal(result.run, false);
  assert.equal(result.reason, 'disabled');
});

test('decide filters commands to the known set', () => {
  const result = decide(
    { enabled: true, aiAuthors: ['bot'], commands: ['review', 'bogus', 'docs'] },
    'bot',
  );
  assert.deepEqual(result.commands, ['review', 'docs']);
  assert.equal(result.run, true);
});

test('decide does not run when no valid commands are configured', () => {
  const result = decide({ enabled: true, aiAuthors: ['bot'], commands: ['bogus'] }, 'bot');
  assert.equal(result.run, false);
  assert.equal(result.reason, 'no-commands');
});

test('default config commands are all known', () => {
  for (const cmd of DEFAULT_CONFIG.commands) {
    assert.ok(KNOWN_COMMANDS.includes(cmd), `${cmd} should be a known command`);
  }
});

test('default AI authors exclude github-actions and dependabot', () => {
  // These are deliberately not auto-triggered (too broad / broken token).
  assert.ok(!DEFAULT_CONFIG.aiAuthors.includes('github-actions[bot]'));
  assert.ok(!DEFAULT_CONFIG.aiAuthors.some((a) => a.startsWith('dependabot')));
});

test('decide skips an AI PR carrying a skip label (case-insensitive)', () => {
  const result = decide(DEFAULT_CONFIG, 'claude-code[bot]', { labels: ['No-Aido'] });
  assert.equal(result.run, false);
  assert.equal(result.reason, 'skipped-label');
  assert.deepEqual(result.commands, []);
});

test('decide skips an AI PR whose body has the skip marker', () => {
  const result = decide(DEFAULT_CONFIG, 'claude-code[bot]', {
    body: 'Automated change.\n\n<!-- aido: skip -->\n',
  });
  assert.equal(result.run, false);
  assert.equal(result.reason, 'skipped-marker');
});

test('decide accepts label objects or strings when checking skip labels', () => {
  const asObjects = decide(DEFAULT_CONFIG, 'claude-code[bot]', { labels: ['no-aido'] });
  assert.equal(asObjects.reason, 'skipped-label');
});

test('decide runs an AI PR with no skip label or marker', () => {
  const result = decide(DEFAULT_CONFIG, 'claude-code[bot]', {
    labels: ['enhancement'],
    body: 'A normal PR body.',
  });
  assert.equal(result.run, true);
  assert.equal(result.reason, 'ok');
});

test('decide ignores skip labels/markers on human PRs (author checked first)', () => {
  const result = decide(DEFAULT_CONFIG, 'a-human-dev', { labels: ['no-aido'] });
  assert.equal(result.reason, 'author-not-ai');
});

test('default config exposes a no-aido skip label', () => {
  assert.ok(DEFAULT_CONFIG.skipLabels.includes('no-aido'));
});
