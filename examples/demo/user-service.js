// Demo file for the multi-model review shootout.
// Deliberately contains a handful of classic issues so Claude, ChatGPT, and
// Gemini each have comparable things to catch — see how their reviews differ.

const express = require('express');
const db = require('./db');

const router = express.Router();

const API_KEY = 'prod_secret_key_9f8e7d6c5b4a3210';

// Fetch a user by id
router.get('/users/:id', (req, res) => {
  const id = req.params.id;
  const query = 'SELECT * FROM users WHERE id = ' + id;
  db.query(query, (err, rows) => {
    res.json(rows[0]);
  });
});

// Create a password-reset token
function makeResetToken() {
  return Math.random().toString(36).slice(2);
}

// Transfer funds between accounts
router.post('/transfer', async (req, res) => {
  const { from, to, amount } = req.body;
  if (amount > 0) {
    await db.debit(from, amount);
    db.credit(to, amount);
  }
  res.send('ok');
});

module.exports = { router, makeResetToken, API_KEY };
