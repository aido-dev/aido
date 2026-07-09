const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  ELLIPSIS_MARKER,
  truncate,
  truncateTail,
  buildFilesSummary,
  fillTemplate,
  modelFooter,
} = require('../lib/text');

test('truncate returns empty string for falsy input', () => {
  assert.equal(truncate(null, 10), '');
  assert.equal(truncate('', 10), '');
});

test('truncate passes short strings through unchanged', () => {
  assert.equal(truncate('short', 100), 'short');
  assert.equal(truncate('exact', 5), 'exact');
});

test('truncate keeps head and tail with a marker in the middle', () => {
  const input = 'a'.repeat(70) + 'b'.repeat(30);
  const out = truncate(input, 50);
  assert.ok(out.includes(ELLIPSIS_MARKER));
  assert.ok(out.startsWith('a'.repeat(35))); // head = 70% of 50
  assert.ok(out.endsWith('b'));
});

test('truncateTail keeps only the head with a trailing marker', () => {
  const out = truncateTail('x'.repeat(100), 40);
  assert.ok(out.startsWith('x'.repeat(40)));
  assert.ok(out.endsWith('[truncated]'));
  assert.equal(truncateTail('short', 40), 'short');
  assert.equal(truncateTail('', 40), '');
});

test('buildFilesSummary handles empty input', () => {
  assert.equal(buildFilesSummary([]), 'No files changed.');
  assert.equal(buildFilesSummary(null), 'No files changed.');
});

test('buildFilesSummary formats additions, deletions, and status', () => {
  const files = [
    { filename: 'a.js', additions: 3, deletions: 1, status: 'modified' },
    { filename: 'b.md', status: 'added' },
  ];
  assert.equal(buildFilesSummary(files), '- a.js (+3/-1, modified)\n- b.md (added)');
});

test('fillTemplate replaces known placeholders', () => {
  const out = fillTemplate('Title: {{prTitle}}, Diff: {{diff}}', {
    prTitle: 'my PR',
    diff: 'the-diff',
  });
  assert.equal(out, 'Title: my PR, Diff: the-diff');
});

test('fillTemplate turns null/undefined values into empty strings', () => {
  assert.equal(fillTemplate('[{{diff}}]', { diff: null }), '[]');
  assert.equal(fillTemplate('[{{diff}}]', { diff: undefined }), '[]');
});

test('fillTemplate leaves unknown placeholders untouched', () => {
  assert.equal(fillTemplate('Hi {{name}}, {{unknown}}', { name: 'x' }), 'Hi x, {{unknown}}');
});

test('fillTemplate replaces repeated placeholders globally', () => {
  assert.equal(fillTemplate('{{a}} and {{a}}', { a: '1' }), '1 and 1');
});

test('fillTemplate tolerates falsy template and missing ctx', () => {
  assert.equal(fillTemplate(null, { a: 1 }), '');
  assert.equal(fillTemplate('plain', undefined), 'plain');
});

test('modelFooter renders the standard comment footer', () => {
  assert.equal(
    modelFooter('gemini-2.5-flash'),
    '\n\n---\n_Response generated using gemini-2.5-flash_',
  );
});
