const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  matchesAiAuthor,
  computeStats,
  windowLabel,
  buildDigestPrompt,
  shouldPost,
  DEFAULT_CONFIG,
} = require('../digest/aido-digest');

test('shouldPost: only when there is something to report (skipEmpty default)', () => {
  assert.equal(shouldPost([{ author: 'a' }], {}), true); // has PRs → post
  assert.equal(shouldPost([], {}), false); // empty + default skipEmpty → no post
  assert.equal(shouldPost([], { skipEmpty: true }), false);
  assert.equal(shouldPost([], { skipEmpty: false }), true); // opt-in heartbeat
});

test('matchesAiAuthor: exact, prefix*, and case-insensitive', () => {
  const pats = ['copilot', 'claude-code[bot]', 'renovate*'];
  assert.equal(matchesAiAuthor('Copilot', pats), true); // case-insensitive exact
  assert.equal(matchesAiAuthor('claude-code[bot]', pats), true);
  assert.equal(matchesAiAuthor('renovate[bot]', pats), true); // prefix*
  assert.equal(matchesAiAuthor('alice', pats), false);
  assert.equal(matchesAiAuthor('', pats), false);
  assert.equal(matchesAiAuthor('x', undefined), false);
});

test('computeStats counts total, AI authors, and distinct contributors', () => {
  const prs = [
    { author: 'alice' },
    { author: 'copilot' },
    { author: 'alice' },
    { author: 'claude-code[bot]' },
  ];
  const stats = computeStats(prs, DEFAULT_CONFIG.aiAuthors);
  assert.equal(stats.total, 4);
  assert.equal(stats.aiCount, 2); // copilot + claude-code[bot]
  assert.equal(stats.contributors, 3); // alice, copilot, claude-code[bot]
});

test('windowLabel produces a readable range with the year', () => {
  const since = new Date('2026-08-02T00:00:00Z');
  const until = new Date('2026-08-09T00:00:00Z');
  const label = windowLabel(since, until);
  assert.match(label, /2026/);
  assert.match(label, /–/); // en-dash range
});

test('buildDigestPrompt embeds window, exact stats, and the PR list', () => {
  const prs = [
    { number: 10, title: 'Add feature X', author: 'alice', labels: ['feat'] },
    { number: 11, title: 'Fix bug Y', author: 'copilot', labels: [] },
  ];
  const stats = computeStats(prs, DEFAULT_CONFIG.aiAuthors);
  const prompt = buildDigestPrompt(
    { language: 'English', tone: 'neutral', length: 'medium' },
    { label: 'Aug 2 – Aug 9, 2026', prs, stats, maxPrs: 40 },
  );
  assert.match(prompt, /Aug 2 – Aug 9, 2026/);
  assert.match(prompt, /Merged PRs: 2/);
  assert.match(prompt, /Opened by AI agents.*: 1/);
  assert.match(prompt, /#10 "Add feature X" by alice \[feat\]/);
  assert.match(prompt, /#11 "Fix bug Y" by copilot/);
  assert.match(prompt, /AI-authored PRs/); // instructs an AI-authored section
});

test('buildDigestPrompt caps the listed PRs at maxPrs and notes the overflow', () => {
  const prs = Array.from({ length: 5 }, (_, i) => ({
    number: i + 1,
    title: `PR ${i + 1}`,
    author: 'alice',
    labels: [],
  }));
  const stats = computeStats(prs, DEFAULT_CONFIG.aiAuthors);
  const prompt = buildDigestPrompt(
    { language: 'English', tone: 'neutral', length: 'short' },
    { label: 'window', prs, stats, maxPrs: 2 },
  );
  assert.match(prompt, /#1 "PR 1"/);
  assert.match(prompt, /#2 "PR 2"/);
  assert.doesNotMatch(prompt, /#3 "PR 3"/); // beyond the cap
  assert.match(prompt, /and 3 more merged PR\(s\)/);
  // stats still reflect ALL PRs, not just the listed ones
  assert.match(prompt, /Merged PRs: 5/);
});
