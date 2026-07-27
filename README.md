# 🚀 Meet AIDO

**The AI companion for the pull requests your AI writes.**

[![GitHub release](https://img.shields.io/github/v/release/aido-dev/aido?style=flat-square)](https://github.com/aido-dev/aido/releases)
[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Aido%20AI%20PR%20Companion-6f42c1?logo=github&style=flat-square)](https://github.com/marketplace/actions/aido-ai-pr-companion)
![Aido Dispatch](https://github.com/aido-dev/aido/actions/workflows/aido-dispatch.yml/badge.svg)
![Unit Tests](https://github.com/aido-dev/aido/actions/workflows/unit-tests.yml/badge.svg)
![GitHub License](https://img.shields.io/github/license/aido-dev/aido)
[![Demo PRs](https://img.shields.io/badge/Demo%20PRs-See%20it%20live-6f42c1?style=flat-square)](#-see-it-live-no-install)

![Supports Gemini](https://img.shields.io/badge/provider-Gemini-blue?logo=google&style=flat-square)
![Supports ChatGPT](https://img.shields.io/badge/provider-ChatGPT-10a37f?logo=openai&style=flat-square)
![Supports Claude](https://img.shields.io/badge/provider-Claude-8a2be2?style=flat-square)

AI agents — Copilot, Claude Code, Cursor — are opening more and more pull requests, and a human still has to understand code they didn't write. Aido keeps that human in the loop: when an **AI-authored PR** lands, it can **automatically explain, summarize, review, and document** the change. And you can run those same commands on **any PR or issue on demand** — just comment `aido <command>`.

One companion, the whole review lifecycle: **review, summarize, explain, document, test, and triage** — with **Gemini, ChatGPT, or Claude**, right inside GitHub Actions. Install with a single workflow file.

<!--
  DEMO GIF — once docs/media/aido-demo.gif exists, UNCOMMENT the <p> block below to
  render it in the hero. Record a short (~15–25s) loop showing Aido in action:
    1. An AI-authored PR opens (or you type `aido review` in a PR comment box).
    2. The GitHub Actions run kicks off (brief).
    3. Aido posts its review — scroll the inline suggestions + faceted notes.
  Keep it tight; loop the payoff (the posted comment), not the waiting.

<p align="center">
  <img src="docs/media/aido-demo.gif" alt="Aido reviewing a pull request, live in GitHub" width="820">
</p>
-->

---

## 👀 See it live (no install)

These are **real Aido comments** on demo PRs — click any command to see the full,
rendered output in GitHub:

| Command | What it does | Live demo |
|---|---|---|
| `aido review` | Multi-persona review + digest, inline applyable suggestions | [PR #64](https://github.com/aido-dev/aido/pull/64) |
| `aido suggest` | Concrete improvements & small refactors | [PR #65](https://github.com/aido-dev/aido/pull/65) |
| `aido test` | Test plan, coverage gaps, follow-ups | [PR #66](https://github.com/aido-dev/aido/pull/66) |
| `aido explain` | Developer-focused step-by-step walkthrough | [PR #67](https://github.com/aido-dev/aido/pull/67) |
| `aido summarize` | High-level summary for stakeholders | [PR #68](https://github.com/aido-dev/aido/pull/68) |
| `aido docs` | Draft/augment documentation | [PR #69](https://github.com/aido-dev/aido/pull/69) |

<details>
<summary><b>Sample: <code>aido review</code> catching real bugs</b> (from PR #64)</summary>

> This PR introduces several common Python anti-patterns and security vulnerabilities, including a mutable default argument, SQL injection, and a bare `except` clause. Addressing these issues will significantly improve the code's robustness, security, and maintainability.
>
> **Recommendation:** Request changes
>
> **Faceted Notes:**
> - **Security:** Critical SQL injection vulnerability; bare `except` masks errors and potential security issues.
> - **Correctness:** Mutable default argument leads to unexpected state; missing input validation for order dictionary keys.
> - **Maintainability:** Use of "magic numbers" reduces readability and makes updates difficult.
> - **QA/Testing:** Bare `except` swallows all errors, making specific failure modes hard to test.

Code fixes are delivered as **inline "Apply suggestion" buttons** on the diff — not dumped in the comment body.
</details>

<details>
<summary><b>Sample: <code>aido explain</code> walking through unfamiliar code</b> (from PR #67)</summary>

> ### Token-Bucket Rate Limiter
>
> **Intent** — Control the rate at which operations run. Uncontrolled access can lead to resource exhaustion, instability, or abuse. The token-bucket allows short bursts (while tokens last) while enforcing a long-term average rate.
>
> **Design choices**
> - **`time.monotonic()` for timestamps** — immune to wall-clock/NTP adjustments that could unfairly reset a limit.
> - **"Lazy" continuous refill** — tokens are recomputed on each `allow()` call instead of by a background thread, avoiding thread overhead.
> - **Capacity cap** — `min(capacity, …)` stops tokens accumulating indefinitely.
>
> **Risks & edge cases** — not thread-safe (`tokens`/`updated` mutated without a lock); single-process only (no distributed limiting); `refill_per_sec = 0` degrades to a fixed budget.

Aido reads the diff and explains intent, mechanics, design rationale, **and** the risks — so a human understands code they didn't write.
</details>

---

## ⏱️ 60-second start

1. Add a `GEMINI_API_KEY` repo secret ([free key](https://aistudio.google.com/apikey) — _Settings → Secrets and variables → Actions_).
2. Copy [`examples/remote/aido.yml`](examples/remote/aido.yml) → `.github/workflows/aido.yml` (one file).
3. Comment `aido review` on any PR.

That's it — Aido replies right in the PR. [Full install options ↓](#-quick-start)

---

## ✨ Highlights

- 🤖 **Auto-companion for AI-authored PRs** — when Copilot / Claude Code / Cursor open a PR, Aido runs automatically (explain + summarize by default; review/docs/test opt-in)
- ⚡ **On-demand on any PR or issue** — `aido review`, `summarize`, `explain`, `docs`, `suggest`, `test`, `triage`
- 🧩 Consolidated, persona-guided reviewer with **applyable inline suggestions** (robust validation, zero false positives)
- 🔌 **Multi-provider, bring-your-own-key:** Gemini (default), ChatGPT, Claude — no third-party data processor
- 📦 **One-file install** from a pinned release tag; upgrading is a one-line bump
- 🔧 Fully configurable prompts, personas, tones, and per-command models

---

## Requirements

- **Secrets** (add under _Settings → Secrets and variables → Actions_):
  - `GEMINI_API_KEY` (required for default provider)
  - `CHATGPT_API_KEY` (if using ChatGPT)
  - `CLAUDE_API_KEY` (if using Claude)
- Uses the built-in **`GITHUB_TOKEN`** for posting comments and reviews.
- ⚠️ **Forked PRs**: repository secrets may be unavailable due to GitHub policy.

---

## 📝 Example Commands

Comment these on any PR:

- `aido review` → Multi-persona code review + digest
- `aido summarize` | `aido sum` | `aido summary` → High-level PR summary for stakeholders
- `aido explain` → Developer-focused step-by-step explanation
- `aido docs` → Draft/augment documentation
- `aido suggest` | `aido improve` → Safe improvement ideas
- `aido test` → Structured test plan, coverage gaps, and follow-up tasks
- `aido config-check` → Validate configs

Comment these on any issue:

- `aido triage` → Classify, suggest labels, find similar issues, recommend next steps

---

## 🤖 Auto-run on AI-authored PRs

When an AI agent (Copilot, Claude Code, Cursor, …) opens a pull request, Aido can
**run automatically** — no comment needed — so a human can quickly understand and
digest code they didn't write.

- Add `.github/workflows/aido-auto.yml` (copy-based) or `examples/remote/aido-auto.yml` (remote install).
- Configure which authors trigger it and which commands run in `.github/scripts/auto/aido-auto-config.json`.
- **Companion-first defaults:** `explain` + `summarize`. Add `review`, `docs`, or `test` to the `commands` list to run more.
- **Only AI-authored PRs trigger it** (per `aiAuthors`); human PRs are never auto-run. It fires on PR open/reopen/ready — **not on every commit**.
- **Per-PR opt-out:** add a `no-aido` label (configurable via `skipLabels`) or put `<!-- aido: skip -->` in the PR body to skip a single PR — no config change needed.
- Fires on `pull_request` (not `pull_request_target`), so forked PRs stay safe (read-only token, no secrets).

```jsonc
// .github/scripts/auto/aido-auto-config.json
{
  "enabled": true,
  "aiAuthors": ["copilot", "claude-code[bot]", "cursor[bot]"],
  "commands": ["explain", "summarize"],
  "skipLabels": ["no-aido"],
}
```

> Note: `github-actions[bot]` and `dependabot[bot]` are excluded by default —
> the former is too broad, and Dependabot PRs run with a read-only token and no
> repo secrets, so Aido can't act on them. Add them explicitly at your own risk.

---

## 🧩 Use Aido as a GitHub Action (a step in your workflow)

Prefer to control exactly when Aido runs? Add it as a **step** in your own
workflow — the Marketplace-published composite action:

```yaml
- uses: aido-dev/aido@v1
  with:
    command: review # review | summarize | explain | docs | suggest | test | triage
    pr_number: ${{ github.event.pull_request.number }}
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

For `triage`, pass `issue_number` instead of `pr_number`. See
[`examples/action/`](examples/action/) for full workflows.

> Two ways to run Aido — pick per use case:
>
> - **Reusable workflows / one-file install** (below) → the comment-driven UX
>   (`aido review` on a PR) and auto-run on AI-authored PRs.
> - **This composite action** → run a specific command as a step, on your own
>   triggers (e.g. review every PR on `pull_request`).

---

## 🚀 Quick Start

### Option A — Remote install (one file, recommended)

1. Add repository secrets:
   - `GEMINI_API_KEY` (default provider)
   - `CHATGPT_API_KEY` (if using ChatGPT)
   - `CLAUDE_API_KEY` (if using Claude)
2. Copy [`examples/remote/aido.yml`](examples/remote/aido.yml) to `.github/workflows/aido.yml` — a single thin workflow that runs Aido from a pinned release tag. Upgrading is a one-line tag bump.
3. Comment `aido review` on a PR.
4. (Optional) Customize any command by adding its config file (e.g. `.github/scripts/review/aido-review-config.json`) — overrides the shipped defaults, no scripts needed. See [`examples/remote/`](examples/remote/) for details.

### Option B — Copy-based install (full control)

1. Add repository secrets (as above).
2. Commit workflows (`.github/workflows/*`) and scripts (`.github/scripts/*`).
   ⚠️ Make sure to include `.github/scripts/lib/` — all command scripts depend on this shared library.
3. Comment `aido review` on a PR.
4. (Optional) Customize configs in `aido-*-config.json` — or the prompts and scripts themselves.

---

## 📚 Learn More

- [Workflows](.github/workflows/)
- [Scripts & Configs](.github/scripts/)
- [Persona Packs](/examples/.github/review/example%20personas/)

## 🆚 Summarize vs Explain

- Audience:
  - Summarize: stakeholders (product/engineering leadership)
  - Explain: developers/reviewers
- Depth:
  - Summarize: high-level intent, scope, risks, impact; no implementation details
  - Explain: step-by-step mechanics, rationale, risks, verification
- Content constraints:
  - Summarize: no code blocks, diffs, or inline suggestions; concise and skimmable
  - Explain: may include tiny illustrative snippets only if essential; avoid suggestions and large blocks

---

## ❤️ Why Aido?

As more of your PRs are written by AI, Aido makes sure a human still understands them — automatically, and on demand. It's practical, configurable, and team-friendly: save time, catch issues early, and keep everyone in the loop — without leaving GitHub.

---

## How It Works

- **Dispatcher:** `.github/workflows/aido-dispatch.yml`
  Parses the first line of the comment, normalizes it, and routes to the right reusable workflow.
- **Reusable workflows (invoked via `workflow_call`):**
  - `.github/workflows/aido-review.yml`
  - `.github/workflows/aido-summarize.yml`
  - `.github/workflows/aido-explain.yml`
  - `.github/workflows/aido-docs.yml`
  - `.github/workflows/aido-suggest.yml`
  - `.github/workflows/aido-test.yml`
  - `.github/workflows/aido-triage.yml` _(issues)_

Each workflow builds a prompt from PR context (title, body, changed files, **truncated diff ~15k chars**), calls the selected provider/model, and **posts a PR review with inline, applyable suggestions (when applicable), validated by a robust layer to ensure safety and accuracy**.

---

## Scripts & Configs

- **Shared library (required by all commands):** `.github/scripts/lib/`
  - `providers.js` — AI provider wrappers (ChatGPT / Gemini / Claude), model resolution
  - `github.js` — GitHub API client, event parsing, PR context fetchers, comment posting
  - `config.js` — JSON config loading with defaults and deep merge
  - `text.js` — truncation, files summary, prompt templates, comment footers
- **Review:**
  - Script: `.github/scripts/review/aido-review.js`
  - Config: `.github/scripts/review/aido-review-config.json` _(object with `{ reviewer, personas }`; reviewer sets provider/model; personas guide facets)_
- **Summarize (stakeholder-facing; aliases: `summarize` | `sum` | `summary`):**
  - Script: `.github/scripts/summarize/aido-summarize.js`
  - Config: `.github/scripts/summarize/aido-summarize-config.json`
- **Explain (developer-focused):**
  - Script: `.github/scripts/explain/aido-explain.js`
  - Config: `.github/scripts/explain/aido-explain-config.json`
- **Docs:**
  - Script: `.github/scripts/docs/aido-docs.js`
  - Config: `.github/scripts/docs/aido-docs-config.json`
- **Suggest:**
  - Script: `.github/scripts/suggest/aido-suggest.js`
  - Config: `.github/scripts/suggest/aido-suggest-config.json`
- **Test:**
  - Script: `.github/scripts/test/aido-test.js`
  - Config: `.github/scripts/test/aido-test-config.json` _(adds `testFocus` for unit / integration / e2e / regression / performance / security / accessibility)_
- **Triage (issues):**
  - Script: `.github/scripts/triage/aido-triage.js`
  - Config: `.github/scripts/triage/aido-triage-config.json` _(adds `candidateLabels`, `severityLabels`, and `applyLabels` to optionally auto-apply suggested labels; default `false`)_

> Each config supports: `provider` (CHATGPT|GEMINI|CLAUDE), `model`, `language`, `tone`, `style`, `length`, `include` (title/body/filesSummary/diff), `additionalInstructions`, and an optional `promptTemplate` with placeholders.

---

## Persona Reviews (Aido Review)

- Use a single **consolidated reviewer** informed by your configured personas in `aido-review-config.json`.
  - Top-level `reviewer` chooses provider/model (and optional context checks).
  - `personas` define roles with prompt/tone/style/language to guide faceted notes.
- The review body contains a clean summary, recommendation, faceted notes, and optional context checks.
- All code changes are delivered as **inline PR review suggestions** (with “Apply suggestion” buttons), thoroughly validated for safety and actionability — not in the body.
- **Keep it reasonable:** start with **3–5 personas** (e.g., pedagogy, architecture, security, performance, QA).

**Pre-curated packs:** see `/examples/.github/review/example personas/`

- `example-personas.json` (~50 personas)
- `great_defaults-personas.json` (balanced starter set)
- Topic packs: `web_frontend-*.json`, `cloud_and_devops-*.json`, `security-*.json`, and more.

---

## Tips

- Prefer **short, focused** prompts and configs.
- Use `aido config-check` if things look off.
- For UI work, pair `aido explain` with `aido suggest`.
- For releases, run `aido summarize` → `aido docs`.
- Before merging, run `aido test` to surface missing test cases and coverage gaps.
- For new issues, run `aido triage` to get a quick classification, label suggestions, and similar-issue links.

---

## Caveats

- Diff is truncated (~15k chars) to keep prompts efficient.
- Provider/model availability and naming can change; set explicit models in configs.
- Forked PRs may lack secrets → provider calls may be skipped.

---

## 🔖 Topics

`github-actions` · `ai-code-review` · `ai-assistant` · `developer-productivity` · `persona-based-reviews` · `openai` · `gemini` · `claude` · `chatgpt` · `pr-bot` · `automated-code-review`

---

Happy shipping! ✨

---

> [!Note]
>
> Data handling:
>
> - Prompts, code, and metadata may be sent to external AI services and could be logged or retained by those providers.
> - Do not include secrets, confidential, or regulated data unless you fully trust the operator and provider.
>
> Reliability:
>
> - Providers can rate‑limit, change models/behavior, or go offline without notice.
> - Do not depend on AI outputs for production without human review and validation.
>
> Accuracy:
>
> - AI models can be incorrect, outdated, or hallucinate details.
> - Always verify explanations, reviews, and code suggestions before applying.
