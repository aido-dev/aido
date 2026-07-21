# Aido Triage Workflow & Config

## Purpose
`aido triage` runs on a **GitHub issue** (not a PR). Comment `aido triage` on an
issue and Aido classifies it (bug / feature / security / question / …), suggests
labels from a configured candidate list, surfaces similar recent open issues, and
recommends next steps. It can optionally apply labels automatically.

---

## Files
- `.github/workflows/aido-triage.yml` — reusable workflow (invoked by the dispatcher on `aido triage`).
- `.github/scripts/triage/aido-triage.js` — the script.
- `.github/scripts/triage/aido-triage-config.json` — configuration.

## Config Reference (`aido-triage-config.json`)
- **provider** / **model** — `CHATGPT` | `GEMINI` | `CLAUDE`, and the model per provider.
- **candidateLabels** — the only labels Aido may suggest/apply.
- **severityLabels** — used only when the issue is clearly a security issue.
- **applyLabels** — if `true`, Aido applies suggested labels automatically (default `false`).
- **maxSimilarIssues** — how many related issues to surface.
- **language**, **tone**, **additionalInstructions** — output shaping.

## Notes
- Runs only when triggered by the dispatch workflow (not standalone).
- Issue triage is **advisory** — review before acting on the recommendations.

---

## Shared Library Requirement

The script requires Aido's shared library at `.github/scripts/lib/` (providers, GitHub helpers, config loading, text utilities). Copy it from [`examples/.github/lib/`](../lib/) — the command will fail to start without it.
