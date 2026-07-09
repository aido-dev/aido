const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadConfig } = require('../lib/config');

const DEFAULTS = {
  provider: 'GEMINI',
  model: { CHATGPT: 'gpt-default', GEMINI: 'gemini-default' },
  include: { title: true, diff: true },
  tone: 'neutral',
};

const tmpDirs = [];
after(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function tmpConfig(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aido-config-test-'));
  tmpDirs.push(dir);
  const file = path.join(dir, 'config.json');
  fs.writeFileSync(file, contents);
  return file;
}

test('loadConfig returns defaults when the file is missing', () => {
  const cfg = loadConfig('/nonexistent/aido-config.json', DEFAULTS);
  assert.deepEqual(cfg, DEFAULTS);
});

test('loadConfig returns defaults when the file is invalid JSON', () => {
  const file = tmpConfig('{ not json');
  const cfg = loadConfig(file, DEFAULTS);
  assert.deepEqual(cfg, DEFAULTS);
});

test('loadConfig shallow-merges top-level keys over defaults', () => {
  const file = tmpConfig(JSON.stringify({ provider: 'CLAUDE', tone: 'terse' }));
  const cfg = loadConfig(file, DEFAULTS);
  assert.equal(cfg.provider, 'CLAUDE');
  assert.equal(cfg.tone, 'terse');
  assert.deepEqual(cfg.model, DEFAULTS.model);
});

test('loadConfig deep-merges the configured deepKeys one level', () => {
  const file = tmpConfig(
    JSON.stringify({ model: { GEMINI: 'gemini-custom' }, include: { diff: false } }),
  );
  const cfg = loadConfig(file, DEFAULTS, ['model', 'include']);
  // Overridden key applies, sibling defaults survive
  assert.equal(cfg.model.GEMINI, 'gemini-custom');
  assert.equal(cfg.model.CHATGPT, 'gpt-default');
  assert.equal(cfg.include.diff, false);
  assert.equal(cfg.include.title, true);
});

test('loadConfig without deep merge replaces nested objects wholesale', () => {
  const file = tmpConfig(JSON.stringify({ include: { diff: false } }));
  const cfg = loadConfig(file, DEFAULTS, []);
  assert.deepEqual(cfg.include, { diff: false });
});

test('loadConfig ignores deepKeys that are not objects in defaults', () => {
  const file = tmpConfig(JSON.stringify({ tone: 'x' }));
  const cfg = loadConfig(file, DEFAULTS, ['tone']);
  assert.equal(cfg.tone, 'x');
});
