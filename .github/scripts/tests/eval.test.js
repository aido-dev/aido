const { test } = require('node:test');
const assert = require('node:assert/strict');

const { anyMatch, evaluateCase, summarize } = require('../eval/evaluate');
const { cases, evalPersonas, toAddDiff } = require('../eval/cases');

test('anyMatch returns true when any pattern matches', () => {
  assert.equal(anyMatch('has SQL injection', [/injection/i]), true);
  assert.equal(anyMatch('nothing here', [/injection/i, /secret/i]), false);
  assert.equal(anyMatch('anything', []), false); // empty/undefined anyOf never matches
  assert.equal(anyMatch('anything', undefined), false);
});

test('evaluateCase scores caught findings and passes at/above threshold', () => {
  const c = {
    name: 't',
    threshold: 0.5,
    expect: [
      { id: 'a', anyOf: [/alpha/i] },
      { id: 'b', anyOf: [/bravo/i] },
    ],
    mustNot: [],
  };
  const r = evaluateCase('the alpha is here', c);
  assert.equal(r.caught, 1);
  assert.equal(r.total, 2);
  assert.equal(r.score, 0.5);
  assert.deepEqual(r.missed, ['b']);
  assert.equal(r.pass, true); // 0.5 >= 0.5
});

test('evaluateCase fails below threshold', () => {
  const c = {
    name: 't',
    threshold: 0.8,
    expect: [
      { id: 'a', anyOf: [/alpha/i] },
      { id: 'b', anyOf: [/bravo/i] },
    ],
  };
  const r = evaluateCase('alpha only', c);
  assert.equal(r.score, 0.5);
  assert.equal(r.pass, false);
});

test('evaluateCase fails on a mustNot false-positive even with perfect recall', () => {
  const c = {
    name: 't',
    threshold: 1,
    expect: [],
    mustNot: [{ id: 'no-sqli', anyOf: [/sql injection/i] }],
  };
  const clean = evaluateCase('looks good, approve', c);
  assert.equal(clean.pass, true);
  const bad = evaluateCase('this has a SQL injection risk', c);
  assert.equal(bad.violations, 1);
  assert.deepEqual(bad.violatedIds, ['no-sqli']);
  assert.equal(bad.pass, false);
});

test('empty expect scores 1 (false-positive-only guard cases)', () => {
  const r = evaluateCase('whatever', { name: 't', expect: [], mustNot: [] });
  assert.equal(r.score, 1);
  assert.equal(r.pass, true);
});

test('summarize aggregates pass/fail across cases', () => {
  const s = summarize([
    { pass: true, score: 1 },
    { pass: false, score: 0.4 },
  ]);
  assert.equal(s.passed, 1);
  assert.equal(s.failed, 1);
  assert.equal(s.pass, false);
  assert.ok(Math.abs(s.avgScore - 0.7) < 1e-9);
});

// --- golden cases are well-formed ---

test('golden cases are structurally valid', () => {
  assert.ok(cases.length >= 2, 'at least a buggy + a clean case');
  assert.ok(evalPersonas.length >= 1);
  for (const c of cases) {
    assert.ok(c.name && c.filename && c.content, `case ${c.name} has name/filename/content`);
    for (const e of c.expect || []) {
      assert.ok(
        e.id && Array.isArray(e.anyOf) && e.anyOf.every((r) => r instanceof RegExp),
        `expect ${e.id} ok`,
      );
    }
    for (const e of c.mustNot || []) {
      assert.ok(e.id && e.anyOf.every((r) => r instanceof RegExp), `mustNot ${e.id} ok`);
    }
  }
});

test('toAddDiff produces a valid single-file unified diff', () => {
  const d = toAddDiff('src/x.js', 'const a = 1;\nconst b = 2;\n');
  assert.match(d, /^diff --git a\/src\/x\.js b\/src\/x\.js/);
  assert.match(d, /@@ -0,0 \+1,2 @@/);
  assert.match(d, /\n\+const a = 1;/);
  assert.match(d, /\n\+const b = 2;/);
});

// Sanity: the expected-finding patterns are grounded in real signals, not
// arbitrary. Only the issues whose *tokens* appear literally in the source can
// match the source itself — the hardcoded key (`API_KEY`) and weak randomness
// (`Math.random`). The others (SQL injection, ignored error, missing auth/await)
// are inferences a review states in prose, so they're not expected to match raw
// source here.
test('buggy case: literally-present issues match the source', () => {
  const buggy = cases.find((c) => /planted/i.test(c.name));
  const hits = buggy.expect.filter((e) => e.anyOf.some((rx) => rx.test(buggy.content)));
  assert.ok(hits.length >= 2, `grounded in the source (${hits.length} literal matches)`);
});
