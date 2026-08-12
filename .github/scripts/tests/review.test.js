const { test } = require('node:test');
const assert = require('node:assert/strict');

// aido-review.js requires lib/github at load, which needs a token for Octokit.
process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN || 'test-token';

const {
  buildLineMap,
  validateSuggestion,
  parseSuggestions,
  personaGuidanceBlock,
  makeConsolidatedPrompt,
  makeSuggestionsPrompt,
  suggestionsEnabled,
  capSuggestions,
  reviewEventFromBody,
} = require('../review/aido-review');

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

test('validateSuggestion drops a no-op suggestion identical to the current code', () => {
  const map = mapFor(['  const info = await octokit.graphql(query, vars);']);
  const result = validateSuggestion(
    {
      startLine: 1,
      endLine: 1,
      // Same line the model was "reviewing" — differs only by surrounding whitespace.
      code: 'const info = await octokit.graphql(query, vars);',
      issue: 'Explaining efficient GraphQL query design.',
    },
    map,
  );
  assert.equal(result.valid, false);
  assert.match(result.reason, /no-op|identical/i);
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

// --- v1.5.1: reviewer context reaches the inline-suggestions pass + controls ---

const CONSTRAINT =
  'This repo uses neon-http; never suggest wrapping single statements in db.transaction().';
const ctxPersonas = [
  {
    name: 'DB reviewer',
    prompt: `You review database code. ${CONSTRAINT} Issue: {{issueTitle}} Diff: {{diff}}`,
  },
];
const ctx = {
  prTitle: 'Add update',
  prBody: 'small change',
  issueTitle: '',
  issueBody: '',
  diff: 'd',
};
const ctxFiles = [{ filename: 'db/users.ts' }];

test('personaGuidanceBlock includes persona body and strips {{template}} placeholders', () => {
  const g = personaGuidanceBlock(ctxPersonas);
  assert.match(g, /DB reviewer/);
  assert.match(g, /neon-http/);
  assert.doesNotMatch(g, /\{\{/);
});

test('makeSuggestionsPrompt injects the house rules into the suggestions pass', () => {
  const prompt = makeSuggestionsPrompt(ctxPersonas, ctx, ctxFiles);
  assert.match(prompt, /PROJECT CONTEXT \/ CONSTRAINTS/);
  assert.match(prompt, /neon-http/); // the constraint now reaches the suggestions pass
  assert.match(prompt, /db\/users\.ts/); // changed files still listed
  assert.match(prompt, /```suggestion/); // still the exact suggestion format
});

test('makeConsolidatedPrompt now embeds persona guidance bodies, not just names', () => {
  const prompt = makeConsolidatedPrompt(ctxPersonas, ctx);
  assert.match(prompt, /REVIEWER GUIDANCE/);
  assert.match(prompt, /neon-http/);
});

test('suggestionsEnabled: default on, off when reviewer.suggestions === false', () => {
  assert.equal(suggestionsEnabled({}), true);
  assert.equal(suggestionsEnabled({ suggestions: true }), true);
  assert.equal(suggestionsEnabled({ suggestions: false }), false);
});

test('capSuggestions: caps to maxSuggestions, ignores invalid, no cap when unset', () => {
  const list = [1, 2, 3, 4, 5];
  assert.deepEqual(capSuggestions(list, {}), list);
  assert.deepEqual(capSuggestions(list, { maxSuggestions: 2 }), [1, 2]);
  assert.deepEqual(capSuggestions(list, { maxSuggestions: 0 }), []);
  assert.deepEqual(capSuggestions(list, { maxSuggestions: 'x' }), list);
});

// --- reviewEventFromBody ---

test('reviewEventFromBody: plain Approve maps to APPROVE (even with inline nits)', () => {
  assert.equal(reviewEventFromBody('**Recommendation:** Approve\n\nSome notes.'), 'APPROVE');
  assert.equal(reviewEventFromBody('Recommendation: Approve'), 'APPROVE');
});

test('reviewEventFromBody: Approve with minor changes maps to COMMENT', () => {
  assert.equal(reviewEventFromBody('**Recommendation:** Approve with minor changes'), 'COMMENT');
});

test('reviewEventFromBody: Request changes maps to REQUEST_CHANGES', () => {
  assert.equal(reviewEventFromBody('**Recommendation:** Request changes'), 'REQUEST_CHANGES');
});

test('reviewEventFromBody: unrecognized/missing recommendation falls back to COMMENT', () => {
  assert.equal(reviewEventFromBody('No recommendation line here.'), 'COMMENT');
  assert.equal(reviewEventFromBody(''), 'COMMENT');
  assert.equal(reviewEventFromBody(null), 'COMMENT');
});
