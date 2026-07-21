# Aido Test Workflow & Config

## Purpose
`aido test` generates a structured **test plan** for a pull request: proposed test
cases (functional, negative, edge), identified coverage gaps, and follow-up tasks
(fixtures, mocks, regression updates). Comment `aido test` on a PR.

---

## Files
- `.github/workflows/aido-test.yml` — reusable workflow (invoked by the dispatcher on `aido test`).
- `.github/scripts/test/aido-test.js` — the script.
- `.github/scripts/test/aido-test-config.json` — configuration.

## Config Reference (`aido-test-config.json`)
- **provider** / **model** — `CHATGPT` | `GEMINI` | `CLAUDE`, and the model per provider.
- **testFocus** — toggle focus areas: unit, integration, e2e, regression, performance, security, accessibility.
- **deliverFormat** — the sections the plan should contain.
- **language**, **tone**, **length**, **style**, **outputFormat** — output shaping.
- **promptTemplate** — optional full override with placeholders.

## Notes
- Runs only when triggered by the dispatch workflow (not standalone).
- Diff is truncated (~15k chars) to keep prompts manageable.

---

## Shared Library Requirement

The script requires Aido's shared library at `.github/scripts/lib/` (providers, GitHub helpers, config loading, text utilities). Copy it from [`examples/.github/lib/`](../lib/) — the command will fail to start without it.
