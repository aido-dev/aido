/**
 * Pure scoring logic for the prompt-eval harness.
 *
 * Given an LLM review `output` (plain text) and a golden `case`, decide which
 * expected findings were caught and whether any "must-not" false positives were
 * produced. No LLM / network here — this is the deterministic, unit-tested core;
 * `run-eval.js` does the actual model calls.
 *
 * A case shape:
 *   {
 *     name, filename, content, prTitle, prBody,
 *     threshold,                       // min fraction of `expect` to pass (default 0.8)
 *     expect:  [{ id, desc, anyOf: [RegExp, ...] }],  // should be mentioned
 *     mustNot: [{ id, desc, anyOf: [RegExp, ...] }],  // should NOT be claimed (false-positive guard)
 *   }
 */

/** Does any pattern in `anyOf` match the text? */
function anyMatch(text, anyOf) {
  return (anyOf || []).some((rx) => rx.test(text));
}

/** Evaluate one case's expectations against the model output. */
function evaluateCase(output, testCase) {
  const text = String(output || '');
  const expect = (testCase.expect || []).map((e) => ({
    id: e.id,
    desc: e.desc || e.id,
    caught: anyMatch(text, e.anyOf),
  }));
  const mustNot = (testCase.mustNot || []).map((e) => ({
    id: e.id,
    desc: e.desc || e.id,
    violated: anyMatch(text, e.anyOf),
  }));

  const total = expect.length;
  const caught = expect.filter((e) => e.caught).length;
  const violations = mustNot.filter((e) => e.violated).length;
  const score = total ? caught / total : 1;
  const threshold = typeof testCase.threshold === 'number' ? testCase.threshold : 0.8;
  const pass = score >= threshold && violations === 0;

  return {
    name: testCase.name,
    expect,
    mustNot,
    caught,
    total,
    missed: expect.filter((e) => !e.caught).map((e) => e.id),
    violations,
    violatedIds: mustNot.filter((e) => e.violated).map((e) => e.id),
    score,
    threshold,
    pass,
  };
}

/** Aggregate per-case results into an overall pass/fail + summary. */
function summarize(results) {
  const passed = results.filter((r) => r.pass).length;
  return {
    passed,
    failed: results.length - passed,
    total: results.length,
    // An empty run is a FAIL, not a vacuous pass — "0/0 cases ✅" would hide a
    // broken runner (no cases loaded, all calls threw) behind a green check.
    pass: results.length > 0 && results.every((r) => r.pass),
    avgScore: results.length ? results.reduce((s, r) => s + r.score, 0) / results.length : 0,
  };
}

module.exports = { anyMatch, evaluateCase, summarize };
