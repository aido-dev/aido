const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Set a dummy token before the module instantiates its Octokit client.
process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN || 'test-token';

const {
  getRepo,
  readEvent,
  getPrNumberFromEvent,
  getIssueNumberFromEvent,
} = require('../lib/github');

function withEvent(payload, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aido-event-test-'));
  const file = path.join(dir, 'event.json');
  fs.writeFileSync(file, typeof payload === 'string' ? payload : JSON.stringify(payload));
  const prev = process.env.GITHUB_EVENT_PATH;
  process.env.GITHUB_EVENT_PATH = file;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.GITHUB_EVENT_PATH;
    else process.env.GITHUB_EVENT_PATH = prev;
  }
}

test('getRepo parses owner and repo from GITHUB_REPOSITORY', () => {
  const prev = process.env.GITHUB_REPOSITORY;
  process.env.GITHUB_REPOSITORY = 'aido-dev/aido';
  try {
    assert.deepEqual(getRepo(), { owner: 'aido-dev', repo: 'aido' });
  } finally {
    if (prev === undefined) delete process.env.GITHUB_REPOSITORY;
    else process.env.GITHUB_REPOSITORY = prev;
  }
});

test('getRepo throws when GITHUB_REPOSITORY is not set', () => {
  const prev = process.env.GITHUB_REPOSITORY;
  delete process.env.GITHUB_REPOSITORY;
  try {
    assert.throws(() => getRepo(), /GITHUB_REPOSITORY is not set/);
  } finally {
    if (prev !== undefined) process.env.GITHUB_REPOSITORY = prev;
  }
});

test('readEvent returns null when GITHUB_EVENT_PATH is unset or missing', () => {
  const prev = process.env.GITHUB_EVENT_PATH;
  delete process.env.GITHUB_EVENT_PATH;
  try {
    assert.equal(readEvent(), null);
    process.env.GITHUB_EVENT_PATH = '/nonexistent/event.json';
    assert.equal(readEvent(), null);
  } finally {
    if (prev === undefined) delete process.env.GITHUB_EVENT_PATH;
    else process.env.GITHUB_EVENT_PATH = prev;
  }
});

test('readEvent returns null for unparseable event files', () => {
  withEvent('{ not json', () => {
    assert.equal(readEvent(), null);
  });
});

test('getPrNumberFromEvent reads pull_request events (synthetic dispatch shape)', () => {
  withEvent({ pull_request: { number: 12 } }, () => {
    assert.equal(getPrNumberFromEvent(), 12);
  });
});

test('getPrNumberFromEvent reads issue_comment events on a PR', () => {
  withEvent(
    {
      issue: {
        number: 3,
        pull_request: { url: 'https://api.github.com/repos/aido-dev/aido/pulls/34' },
      },
    },
    () => {
      assert.equal(getPrNumberFromEvent(), 34);
    },
  );
});

test('getPrNumberFromEvent returns null for plain issue events', () => {
  withEvent({ issue: { number: 3 } }, () => {
    assert.equal(getPrNumberFromEvent(), null);
  });
});

test('getIssueNumberFromEvent reads the issue number', () => {
  withEvent({ issue: { number: 7 } }, () => {
    assert.equal(getIssueNumberFromEvent(), 7);
  });
});

test('getIssueNumberFromEvent returns null when there is no issue', () => {
  withEvent({ pull_request: { number: 12 } }, () => {
    assert.equal(getIssueNumberFromEvent(), null);
  });
});
