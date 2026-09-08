const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  ELLIPSIS_MARKER,
  truncate,
  truncateTail,
  resolveDiffLimit,
  isExcludedPath,
  resolveExcludeGlobs,
  filterDiffByPath,
  DEFAULT_EXCLUDE_GLOBS,
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

test('resolveDiffLimit falls back to the default when unset or invalid', () => {
  assert.equal(resolveDiffLimit(undefined, 60000), 60000);
  assert.equal(resolveDiffLimit({}, 60000), 60000);
  assert.equal(resolveDiffLimit({ maxDiffChars: 'abc' }, 60000), 60000);
  assert.equal(resolveDiffLimit({ maxDiffChars: -5 }, 60000), 60000);
});

test('resolveDiffLimit honors a positive number', () => {
  assert.equal(resolveDiffLimit({ maxDiffChars: 120000 }, 60000), 120000);
  assert.equal(resolveDiffLimit({ maxDiffChars: '30000' }, 60000), 30000);
});

test('resolveDiffLimit disables truncation for 0/false/"none"/"off"', () => {
  for (const v of [0, false, 'none', 'off', 'None', ' OFF ', 'full', '0']) {
    assert.equal(
      resolveDiffLimit({ maxDiffChars: v }, 60000),
      Infinity,
      `for ${JSON.stringify(v)}`,
    );
  }
  // Infinity passed to truncate leaves the input untouched (no marker).
  const big = 'x'.repeat(100);
  assert.equal(truncate(big, resolveDiffLimit({ maxDiffChars: 'none' }, 60000)), big);
});

test('isExcludedPath matches lockfiles/minified/build, not source', () => {
  const g = DEFAULT_EXCLUDE_GLOBS;
  assert.equal(isExcludedPath('package-lock.json', g), true);
  assert.equal(isExcludedPath('frontend/package-lock.json', g), true);
  assert.equal(isExcludedPath('pnpm-lock.yaml', g), true);
  assert.equal(isExcludedPath('assets/app.min.js', g), true);
  assert.equal(isExcludedPath('dist/bundle.js', g), true);
  assert.equal(isExcludedPath('a/b/vendor/x.go', g), true);
  assert.equal(isExcludedPath('src/index.ts', g), false);
  assert.equal(isExcludedPath('lib/text.js', g), false);
});

test('resolveExcludeGlobs unions defaults with excludePaths, or replaces when excludeDefaults=false', () => {
  assert.ok(resolveExcludeGlobs({}).includes('**/package-lock.json'));
  const withExtra = resolveExcludeGlobs({ excludePaths: ['**/*.csv'] });
  assert.ok(withExtra.includes('**/*.csv') && withExtra.includes('**/yarn.lock'));
  assert.deepEqual(resolveExcludeGlobs({ excludeDefaults: false, excludePaths: ['**/*.csv'] }), [
    '**/*.csv',
  ]);
});

test('filterDiffByPath drops excluded file sections and reports them', () => {
  const diff = [
    'diff --git a/src/app.js b/src/app.js',
    '@@ -1 +1 @@',
    '+const x = 1;',
    'diff --git a/package-lock.json b/package-lock.json',
    '@@ -1 +1 @@',
    '+  "lockfileVersion": 3,',
    'diff --git a/dist/bundle.js b/dist/bundle.js',
    '@@ -1 +1 @@',
    '+minified',
  ].join('\n');
  const { diff: kept, excluded } = filterDiffByPath(diff, DEFAULT_EXCLUDE_GLOBS);
  assert.match(kept, /src\/app\.js/);
  assert.doesNotMatch(kept, /package-lock\.json/);
  assert.doesNotMatch(kept, /dist\/bundle\.js/);
  assert.deepEqual(excluded.sort(), ['dist/bundle.js', 'package-lock.json']);
});

test('filterDiffByPath is a no-op for empty diff or empty globs', () => {
  assert.deepEqual(filterDiffByPath('', DEFAULT_EXCLUDE_GLOBS), { diff: '', excluded: [] });
  assert.deepEqual(filterDiffByPath('diff --git a/x b/x\n+y', []), {
    diff: 'diff --git a/x b/x\n+y',
    excluded: [],
  });
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
