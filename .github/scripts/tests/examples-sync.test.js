const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The example bundles under examples/ are copies of the canonical scripts and
// workflows. They have gone stale before — at one point the example dispatch
// workflow still contained a script-injection vulnerability that had already
// been fixed in the canonical file. These tests fail whenever an example
// drifts from its source, so every change to a canonical file forces the
// matching example update in the same PR.

const ROOT = path.join(__dirname, '..', '..', '..');

const SYNCED_PAIRS = [
  // [canonical, example]
  ['.github/scripts/lib/providers.js', 'examples/.github/lib/scripts/providers.js'],
  ['.github/scripts/lib/github.js', 'examples/.github/lib/scripts/github.js'],
  ['.github/scripts/lib/config.js', 'examples/.github/lib/scripts/config.js'],
  ['.github/scripts/lib/text.js', 'examples/.github/lib/scripts/text.js'],
  [
    '.github/scripts/summarize/aido-summarize.js',
    'examples/.github/summarize/scripts/aido-summarize.js',
  ],
  ['.github/scripts/explain/aido-explain.js', 'examples/.github/explain/scripts/aido-explain.js'],
  ['.github/scripts/suggest/aido-suggest.js', 'examples/.github/suggest/scripts/aido-suggest.js'],
  ['.github/scripts/review/aido-review.js', 'examples/.github/review/scripts/aido-review.js'],
  ['.github/scripts/docs/aido-docs.js', 'examples/.github/docs/scripts/docs/aido-docs.js'],
  ['.github/scripts/triage/aido-triage.js', 'examples/.github/triage/scripts/aido-triage.js'],
  ['.github/scripts/test/aido-test.js', 'examples/.github/test/scripts/aido-test.js'],
  ['.github/scripts/auto/aido-auto.js', 'examples/.github/auto/scripts/aido-auto.js'],
  [
    '.github/scripts/auto/aido-auto-config.json',
    'examples/.github/auto/scripts/aido-auto-config.json',
  ],
  [
    '.github/workflows/aido-summarize.yml',
    'examples/.github/summarize/workflows/aido-summarize.yml',
  ],
  ['.github/workflows/aido-auto.yml', 'examples/.github/auto/workflows/aido-auto.yml'],
  ['.github/workflows/aido-explain.yml', 'examples/.github/explain/workflows/aido-explain.yml'],
  ['.github/workflows/aido-suggest.yml', 'examples/.github/suggest/workflows/aido-suggest.yml'],
  ['.github/workflows/aido-review.yml', 'examples/.github/review/workflows/aido-review.yml'],
  ['.github/workflows/aido-docs.yml', 'examples/.github/docs/workflows/aido-docs.yml'],
  ['.github/workflows/aido-triage.yml', 'examples/.github/triage/workflows/aido-triage.yml'],
  ['.github/workflows/aido-test.yml', 'examples/.github/test/workflows/aido-test.yml'],
  ['.github/workflows/aido-dispatch.yml', 'examples/.github/dispatch/workflows/aido-dispatch.yml'],
];

for (const [canonical, example] of SYNCED_PAIRS) {
  test(`example in sync: ${example}`, () => {
    const canonicalContent = fs.readFileSync(path.join(ROOT, canonical), 'utf8');
    const exampleContent = fs.readFileSync(path.join(ROOT, example), 'utf8');
    assert.equal(
      exampleContent,
      canonicalContent,
      `${example} has drifted from ${canonical} — copy the canonical file over the example`,
    );
  });
}
