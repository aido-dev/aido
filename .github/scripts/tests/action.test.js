const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveCommand,
  parseNumber,
  buildEvent,
  COMMAND_SURFACE,
} = require('../action/aido-action');

test('resolveCommand maps PR commands to the pr surface and script', () => {
  const { surface, script } = resolveCommand('review');
  assert.equal(surface, 'pr');
  assert.ok(script.endsWith('review/aido-review.js'), script);
});

test('resolveCommand maps triage to the issue surface', () => {
  const { surface, script } = resolveCommand('triage');
  assert.equal(surface, 'issue');
  assert.ok(script.endsWith('triage/aido-triage.js'), script);
});

test('resolveCommand covers exactly the seven commands', () => {
  assert.deepEqual(Object.keys(COMMAND_SURFACE).sort(), [
    'docs',
    'explain',
    'review',
    'suggest',
    'summarize',
    'test',
    'triage',
  ]);
});

test('resolveCommand throws on an unknown command', () => {
  assert.throws(() => resolveCommand('deploy'), /Unknown Aido command/);
  assert.throws(() => resolveCommand(''), /Unknown Aido command/);
});

test('parseNumber accepts positive integers, rejects the rest', () => {
  assert.equal(parseNumber('42', 'pr_number'), 42);
  assert.throws(() => parseNumber('', 'pr_number'), /pr_number must be a positive integer/);
  assert.throws(() => parseNumber('12abc', 'pr_number'), /positive integer/);
  assert.throws(() => parseNumber('-3', 'pr_number'), /positive integer/);
  assert.throws(() => parseNumber(undefined, 'issue_number'), /issue_number must be/);
});

test('buildEvent shapes a PR or issue synthetic event', () => {
  assert.deepEqual(buildEvent('pr', 7), { pull_request: { number: 7 } });
  assert.deepEqual(buildEvent('issue', 9), { issue: { number: 9 } });
});
