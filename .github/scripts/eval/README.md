# Prompt eval harness

Internal tooling for tuning Aido's prompts with **evidence instead of a hunch**.
It runs Aido's consolidated review prompt against a set of golden cases (files
with known planted issues) and scores the output: did the review catch the real
findings, and did it avoid inventing false ones?

Use it whenever you change a default prompt — run before and after, compare.

## Run it

Needs a provider API key in the environment:

```bash
# default provider (Gemini)
AIDO_PROVIDER=GEMINI GEMINI_API_KEY=... node .github/scripts/eval/run-eval.js

# a specific model
AIDO_PROVIDER=CLAUDE AIDO_MODEL=claude-sonnet-4-6 CLAUDE_API_KEY=... node .github/scripts/eval/run-eval.js

# an OpenAI-compatible endpoint
AIDO_PROVIDER=OPENAI AIDO_MODEL=deepseek-chat AIDO_BASE_URL=https://api.deepseek.com OPENAI_API_KEY=... node .github/scripts/eval/run-eval.js
```

It prints a per-case scorecard and exits non-zero if any case fails.

```
🧪 Aido prompt eval — provider=GEMINI model=gemini-3.6-flash

  ✓ planted-vulns (user-service.js): caught 5/5 (100%, threshold 80%)
  ✓ clean-code (generateToken): caught 1/1 (100%, threshold 100%)

✅ PASS — 2/2 cases, avg score 100%
```

## What's where

- `cases.js` — the golden cases (`expect` = should mention, `mustNot` = false-positive guards) + fixed eval personas. **Add cases over time** — a case is cheap and makes future prompt changes measurable.
- `evaluate.js` — pure scoring logic (no LLM / network). Unit-tested in `../tests/eval.test.js`.
- `run-eval.js` — the runner: builds the prompt, calls the provider, scores, exits.

## Notes

- LLM output is non-deterministic — treat results as a **signal**, not a hard gate. Re-run a borderline case a couple of times.
- This is **dev tooling**, not a shipped command — adopters never run it.
- Today it evaluates the **review** prompt (the core). Extend `cases.js`/`run-eval.js` to cover other commands as needed.
