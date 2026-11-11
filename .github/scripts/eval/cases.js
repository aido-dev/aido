/**
 * Golden cases for the prompt-eval harness.
 *
 * Each case is a small file + the findings a good review SHOULD mention
 * (`expect`) and the false positives it should NOT invent (`mustNot`). Add
 * cases over time — a case is cheap and makes prompt changes measurable.
 */

// Fixed personas so the eval is reproducible regardless of the repo's live
// aido-review-config.json (which can change).
const evalPersonas = [
  {
    name: 'Security reviewer',
    description:
      'Flag security issues: injection, hardcoded secrets, weak cryptography, missing authn/authz, unsafe defaults.',
  },
  {
    name: 'Correctness reviewer',
    description: 'Flag logic errors, missing error handling, race conditions, and edge cases.',
  },
];

/** Build an all-additions unified diff for a single new file. */
function toAddDiff(filename, content) {
  const lines = content.replace(/\n$/, '').split('\n');
  const body = lines.map((l) => `+${l}`).join('\n');
  return [
    `diff --git a/${filename} b/${filename}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ b/${filename}`,
    `@@ -0,0 +1,${lines.length} @@`,
    body,
  ].join('\n');
}

const BUGGY = `const express = require('express');
const db = require('./db');
const router = express.Router();

const API_KEY = 'prod_secret_key_9f8e7d6c5b4a3210';

router.get('/users/:id', (req, res) => {
  const id = req.params.id;
  const query = 'SELECT * FROM users WHERE id = ' + id;
  db.query(query, (err, rows) => {
    res.json(rows[0]);
  });
});

function makeResetToken() {
  return Math.random().toString(36).slice(2);
}

router.post('/transfer', async (req, res) => {
  const { from, to, amount } = req.body;
  if (amount > 0) {
    await db.debit(from, amount);
    db.credit(to, amount);
  }
  res.send('ok');
});

module.exports = { router, makeResetToken, API_KEY };
`;

const CLEAN = `const crypto = require('crypto');

/**
 * Generate a cryptographically strong, URL-safe token.
 * @param {number} bytes entropy in bytes (default 32 = 256 bits)
 */
function generateToken(bytes = 32) {
  if (!Number.isInteger(bytes) || bytes < 16) {
    throw new RangeError('bytes must be an integer >= 16');
  }
  return crypto.randomBytes(bytes).toString('base64url');
}

module.exports = { generateToken };
`;

const cases = [
  {
    name: 'planted-vulns (user-service.js)',
    filename: 'src/user-service.js',
    content: BUGGY,
    prTitle: 'Add user service with transfer endpoint',
    prBody: 'New Express routes for users and fund transfers.',
    threshold: 0.8,
    expect: [
      {
        id: 'hardcoded-secret',
        desc: 'hardcoded API key / credential',
        anyOf: [/hardcoded/i, /\bsecret\b/i, /\bcredential/i, /api[_ -]?key/i, /process\.env/i],
      },
      {
        id: 'sql-injection',
        desc: 'SQL injection via string concatenation',
        anyOf: [/sql injection/i, /\binjection\b/i, /parameteri[sz]/i, /prepared statement/i],
      },
      {
        id: 'weak-crypto',
        desc: 'Math.random for a security token',
        anyOf: [/math\.random/i, /randombytes/i, /cryptographically/i, /weak.{0,20}random/i],
      },
      {
        id: 'error-handling',
        desc: 'ignored db error / unguarded rows[0]',
        anyOf: [
          /error handling/i,
          /unhandled/i,
          /\bswallow/i,
          /\berr(or)?\b[^.\n]{0,40}\b(ignored|unchecked|not checked|dropped|discarded)\b/i,
          /\b(ignored|unchecked|unhandled)\b[^.\n]{0,40}\berror/i,
        ],
      },
      {
        id: 'auth-or-race',
        desc: 'missing auth and/or missing await on /transfer',
        anyOf: [/auth(enticat|oriz)/i, /unauthenticated/i, /missing\s+await/i, /race condition/i],
      },
    ],
    mustNot: [],
  },
  {
    name: 'clean-code (generateToken)',
    filename: 'src/token.js',
    content: CLEAN,
    prTitle: 'Add secure token generator',
    prBody: 'A small helper using crypto.randomBytes with input validation.',
    threshold: 1,
    // Robust signal that the review didn't fabricate serious bugs on clean code:
    // it recommends Approve. (Keyword "must-not" guards were fragile — an
    // approving mention like "uses randomBytes, not weak Math.random" tripped
    // them; checking the recommendation avoids that false failure.)
    expect: [
      {
        id: 'approves-clean-code',
        desc: 'recommends Approve (no fabricated findings)',
        anyOf: [/recommendation:?\**\s*approv/i, /recommend\w*[^.\n]{0,20}approv/i],
      },
    ],
    mustNot: [],
  },
];

module.exports = { cases, evalPersonas, toAddDiff };
