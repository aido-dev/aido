const { test } = require('node:test');
const assert = require('node:assert/strict');

// aido-review.js requires lib/github at load, which needs a token for Octokit.
process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN || 'test-token';

const { buildLineMap, validateSuggestion, parseSuggestions } = require('../review/aido-review');

// --- buildLineMap ---

const SAMPLE_PATCH = [
  '@@ -1,3 +5,4 @@',
  ' context1',
  '-removed line',
  '+added1',
  '+added2',
  ' context2',
].join('\n');

test('buildLineMap numbers lines by the new file, skipping deletions', () => {
  const map = buildLineMap(SAMPLE_PATCH);
  assert.equal(map.get(5).content, 'context1');
  assert.equal(map.get(5).type, 'context');
  assert.equal(map.get(6).content, 'added1');
  assert.equal(map.get(6).type, 'add');
  assert.equal(map.get(7).content, 'added2');
  assert.equal(map.get(8).content, 'context2');
  assert.equal(map.has(4), false);
  assert.equal(map.has(9), false);
});

test('buildLineMap handles multiple hunks', () => {
  const patch = ['@@ -1 +1 @@', '+first', '@@ -10,2 +20,2 @@', ' ten', '+twenty'].join('\n');
  const map = buildLineMap(patch);
  assert.equal(map.get(1).content, 'first');
  assert.equal(map.get(20).content, 'ten');
  assert.equal(map.get(21).content, 'twenty');
});

// --- validateSuggestion ---

function mapFor(lines, start = 1) {
  const patch = [`@@ -${start} +${start},${lines.length} @@`, ...lines.map((l) => `+${l}`)].join(
    '\n',
  );
  return buildLineMap(patch);
}

test('validateSuggestion rejects lines outside the diff', () => {
  const map = mapFor(['const a = 1;']);
  const result = validateSuggestion(
    { startLine: 99, endLine: 99, code: 'const a = 2;', issue: 'x' },
    map,
  );
  assert.equal(result.valid, false);
  assert.match(result.reason, /Line 99 not found/);
});

test('validateSuggestion blocks guard clause removal', () => {
  const map = mapFor(['if (!currentUser) return null;']);
  const result = validateSuggestion(
    { startLine: 1, endLine: 1, code: 'processUser(currentUser);', issue: 'simplify' },
    map,
  );
  assert.equal(result.valid, false);
  assert.match(result.reason, /guard clause\/early return/);
});

test('validateSuggestion blocks existence-check removal without justification', () => {
  const map = mapFor(['if (payload !== null) { handlePayload(payload); }']);
  const result = validateSuggestion(
    {
      startLine: 1,
      endLine: 1,
      code: 'handlePayload(payload);',
      issue: 'simplify the handler',
    },
    map,
  );
  assert.equal(result.valid, false);
  assert.match(result.reason, /existence\/validation check/);
});

test('validateSuggestion allows existence-check removal when the issue justifies it', () => {
  const map = mapFor(['if (payload !== null) { handlePayload(payload); }']);
  const result = validateSuggestion(
    {
      startLine: 1,
      endLine: 1,
      code: 'handlePayload(payload);',
      issue: 'remove redundant null check, payload is already validated upstream',
    },
    map,
  );
  assert.equal(result.valid, true);
});

test('validateSuggestion rejects suggestions with no identifier overlap', () => {
  const map = mapFor(['const totalAmount = computeInvoiceTotal(invoiceItems);']);
  const result = validateSuggestion(
    {
      startLine: 1,
      endLine: 1,
      code: 'renderDashboardWidget(widgetContainer, themeSettings);',
      issue: 'improve',
    },
    map,
  );
  assert.equal(result.valid, false);
  assert.match(result.reason, /identifier overlap/i);
});

test('validateSuggestion accepts a small in-place fix', () => {
  const map = mapFor(['const totalAmount = computeInvoiceTotal(invoiceItems);']);
  const result = validateSuggestion(
    {
      startLine: 1,
      endLine: 1,
      code: 'const totalAmount = computeInvoiceTotal(invoiceItems ?? []);',
      issue: 'handle missing invoiceItems',
    },
    map,
  );
  assert.equal(result.valid, true);
  assert.equal(result.actualCode, 'const totalAmount = computeInvoiceTotal(invoiceItems);');
});

test('validateSuggestion is lenient for very short lines with overlap', () => {
  const map = mapFor(['i++;']);
  const result = validateSuggestion(
    { startLine: 1, endLine: 1, code: 'i += 1;', issue: 'style' },
    map,
  );
  assert.equal(result.valid, true);
});

// --- parseSuggestions ---

const FILES = [
  { filename: 'src/app.js', patch: '@@ -1 +1 @@\n+const x = 1;' },
  { filename: 'src/util.js', patch: '@@ -1 +1 @@\n+const y = 2;' },
];

function suggestionBlock({ file, lines, issue, priority, code }) {
  return [
    `File: ${file}`,
    `Lines: ${lines}`,
    `Issue: ${issue}`,
    `Priority: ${priority}`,
    'Suggestion:',
    '```suggestion',
    code,
    '```',
  ].join('\n');
}

test('parseSuggestions extracts file, lines, issue, priority, and code', () => {
  const markdown = suggestionBlock({
    file: 'src/app.js',
    lines: '3-5',
    issue: 'possible bug',
    priority: 'High',
    code: 'const x = 2;',
  });
  const [s] = parseSuggestions(markdown, FILES);
  assert.equal(s.path, 'src/app.js');
  assert.equal(s.startLine, 3);
  assert.equal(s.endLine, 5);
  assert.equal(s.issue, 'possible bug');
  assert.equal(s.priority, 'HIGH');
  assert.equal(s.code, 'const x = 2;');
});

test('parseSuggestions parses multiple suggestions across files', () => {
  const markdown = [
    suggestionBlock({
      file: 'src/app.js',
      lines: '1',
      issue: 'first',
      priority: 'Low',
      code: 'a();',
    }),
    suggestionBlock({
      file: 'src/util.js',
      lines: '2',
      issue: 'second',
      priority: 'Urgent',
      code: 'b();',
    }),
  ].join('\n\n');
  const parsed = parseSuggestions(markdown, FILES);
  assert.equal(parsed.length, 2);
  assert.deepEqual(
    parsed.map((s) => [s.path, s.priority]),
    [
      ['src/app.js', 'LOW'],
      ['src/util.js', 'URGENT'],
    ],
  );
});

test('parseSuggestions normalizes unknown priorities to MEDIUM', () => {
  const markdown = suggestionBlock({
    file: 'src/app.js',
    lines: '1',
    issue: 'x',
    priority: 'Blocker',
    code: 'a();',
  });
  const [s] = parseSuggestions(markdown, FILES);
  assert.equal(s.priority, 'MEDIUM');
});

test('parseSuggestions skips files not present in the PR', () => {
  const markdown = suggestionBlock({
    file: 'not/in/pr.js',
    lines: '1',
    issue: 'x',
    priority: 'High',
    code: 'a();',
  });
  assert.equal(parseSuggestions(markdown, FILES).length, 0);
});

test('parseSuggestions deduplicates identical path/line/issue triples', () => {
  const block = suggestionBlock({
    file: 'src/app.js',
    lines: '1',
    issue: 'same issue',
    priority: 'High',
    code: 'a();',
  });
  const parsed = parseSuggestions(`${block}\n\n${block}`, FILES);
  assert.equal(parsed.length, 1);
});

test('parseSuggestions handles bold-markdown field labels', () => {
  // Note: the parser supports '**Label: value**' but not '**Label:** value'
  // (a value cannot start with '*'). The suggestions-only prompt asks for
  // plain labels, so this only matters for models that bold their output.
  const markdown = [
    '**File: src/app.js**',
    '**Lines: 2-3**',
    '**Issue: needs a fix**',
    '**Priority: Medium**',
    '**Suggestion:**',
    '```suggestion',
    'fixed();',
    '```',
  ].join('\n');
  const [s] = parseSuggestions(markdown, FILES);
  assert.equal(s.path, 'src/app.js');
  assert.equal(s.startLine, 2);
  assert.equal(s.endLine, 3);
  assert.equal(s.code, 'fixed();');
});

test('parseSuggestions returns empty for empty input', () => {
  assert.deepEqual(parseSuggestions('', FILES), []);
  assert.deepEqual(parseSuggestions(null, FILES), []);
});
