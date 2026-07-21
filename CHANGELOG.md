# 📘 Changelog

All notable changes to **Aido** are documented in this file.
This project follows [Semantic Versioning](https://semver.org/) and uses Conventional Commit messages for clarity and consistency.

---

## [v1.3.1] - 2026-07-21

### 🐛 Bug Fixes

- **auto:** Fixed the auto-companion never running its commands (#59). `aido-auto.yml` passed the PR number as a job output — always a **string** — to command workflows that declare `pr_number` as `type: number`. GitHub type-checks reusable-workflow inputs, so the `explain`/`summarize` jobs failed to instantiate and the run failed before they started. Wrapped the value in `fromJSON()` to convert it back to a number. (The v1.3.0 gate logic was correct; only the hand-off to the command workflows was broken.) Surfaced by dogfooding the feature on a real repo.

⚠️ **If you added `aido-auto.yml` on v1.3.0, upgrade to v1.3.1** — the feature could not run any commands on v1.3.0.

---

## [v1.3.0] - 2026-07-21

### ✨ New Features

- **auto:** Aido can now **run automatically on AI-authored pull requests** (#57). When a configured AI/bot agent (Copilot, Claude Code, Cursor, …) opens a PR, Aido runs a configurable set of commands — no comment needed — so a human can quickly understand and digest code they didn't write. This is the companion-first take on the rising tide of AI-written PRs: default commands are `explain` + `summarize` (add `review`, `docs`, `test` to run more).
  - New workflow **`aido-auto.yml`** (dual-trigger: `pull_request` for copy-based installs, `workflow_call` with `aido_ref` for remote installs) and a dependency-free gate script `aido-auto.js` with config `aido-auto-config.json` (`enabled`, `aiAuthors`, `commands`).
  - Remote install: add the optional second thin workflow `examples/remote/aido-auto.yml` alongside `aido.yml`.
  - **Safety:** fires on `pull_request` (not `pull_request_target`), so forked PRs run with a read-only token and no secrets. `github-actions[bot]` and `dependabot[bot]` are excluded by default (too broad / read-only token + no secrets on Dependabot PRs); add them explicitly if wanted. Author matching is case-insensitive and supports `prefix*` wildcards.

#### ✅ Result

Aido stops being purely on-demand: the PRs your AI writes get an automatic companion pass (explain + summarize by default), keeping a human in the loop on code they didn't author — without anyone remembering to comment.

---

## [v1.2.1] - 2026-07-20

### 🐛 Bug Fixes

- **providers:** AI provider calls now **retry transient failures** with exponential backoff (statuses `429, 500, 502, 503, 504`) instead of failing on the first blip (#54). Google Gemini's free tier returns `503 Service Unavailable` under load fairly often; a single one previously aborted the whole command. Applies to every command via `lib/providers.js`.
- **review:** The `aido review` suggestions pass is now **best-effort**. `aido review` makes two provider calls (the consolidated review body, then a separate inline-suggestions pass); previously a transient failure on the second call discarded the entire review, including the body that had already succeeded. Now the review body still posts, with a note that inline suggestions were skipped and can be retried.

Both were surfaced by live dogfooding on the aido-web repo (the first external adopter of the v1.2.0 one-file install). The v1.1.0 "fail loudly" behavior is preserved: exhausted retries and non-transient errors still throw with actionable messages.

#### ✅ Result

`aido review` (and every other command) rides out the transient provider errors that used to fail runs outright — and when the inline-suggestions pass can't complete, you still get the review instead of nothing.

---

## [v1.2.0] - 2026-07-17

### ✨ New Features

- **Remote install (one file):** Aido can now be adopted by **pinning a release tag** instead of copying ~30 files (#52). Commit a single thin workflow that delegates everything to Aido's reusable dispatcher:

  ```yaml
  jobs:
    aido:
      uses: aido-dev/aido/.github/workflows/aido-dispatch.yml@v1.2.0
      with:
        aido_ref: v1.2.0
      secrets: ...
  ```

  - `aido-dispatch.yml` is now dual-trigger (`issue_comment` + `workflow_call`) and runs entirely in the caller's context — their event, their `GITHUB_TOKEN`, their secrets.
  - All seven command workflows accept an optional `aido_ref` input: when set, scripts run from a checkout of `aido-dev/aido` at that ref, with the caller's `aido-*-config.json` files overlaid — **config customization without copying scripts**. When empty (the default), behavior is unchanged, so copy-based installs are unaffected.
  - `aido config-check` detects remote installs and reports missing local configs as informational (shipped defaults apply).
  - See the new [`examples/remote/`](examples/remote/) for setup, config overrides, upgrades, and the remote-vs-copy trade-off table. Upgrading Aido is a one-line tag bump.

### 🐛 Bug Fixes

- **permissions:** Restored `pull-requests: write` on the five PR-commenting workflows (`aido-summarize.yml`, `aido-explain.yml`, `aido-docs.yml`, `aido-suggest.yml`, `aido-test.yml`). The v1.0.7-era permission tightening (#42) had reduced them to `pull-requests: read`, which GitHub rejects when posting a comment on a pull request — these five commands had been unable to post results since then. Surfaced by the new remote smoke test on its first run.
  ⚠️ **Copy-based adopters:** re-copy these five workflow files (or change `pull-requests: read` to `write` in your copies).

### 🧪 Testing

- **ci:** New label-gated **`remote-smoke.yml`** workflow — adding the `remote-smoke` label to a PR runs an end-to-end remote-install test (full repository reference → aido checkout at ref → config overlay → real summarize comment posted). Opt-in so it never burns provider tokens on routine CI.

#### ✅ Result

Aido installation drops from ~30 copied files to one pinned workflow, release tags become meaningful version pins, and a live end-to-end test guards the remote path — which already paid for itself by catching a two-month-old permissions regression.

---

## [v1.1.0] - 2026-07-10

### 🧠 Improvements & Refactorings

- **core:** Extracted all shared code into a new library at **`.github/scripts/lib/`** (#48):
  `providers.js` (AI provider wrappers + `generate()` dispatcher + model resolution), `github.js` (Octokit client, event parsing, PR context fetchers, comment posting), `config.js` (config loading with deep merge), and `text.js` (truncation, files summaries, prompt templates, footers).
  All seven command scripts were rewritten on top of it — **~945 lines removed** (~3,400 → ~2,000) with command behavior preserved. New commands can now be written as a prompt plus a thin entrypoint.
  ⚠️ **Adopters:** the command scripts are no longer self-contained — copy `.github/scripts/lib/` alongside them (see README and `examples/.github/lib/`).
- **core:** Provider errors now fail loudly with actionable messages instead of silently producing empty output (previously a Gemini HTTP error in `aido review` yielded an empty review body). Missing `GITHUB_TOKEN` is warned about at startup, and non-404 errors when fetching a linked issue are logged instead of swallowed.
- **core:** Gemini calls support an opt-in `temperature` (via `generationConfig`); the PR diff is no longer fetched when `include.diff` is `false`; dead code removed from `aido-review.js`.

### 🧪 Testing

- **tests:** First automated test suite — **66 unit tests** in `.github/scripts/tests/` using Node's built-in test runner (no framework dependency) (#50). Covers the shared library (text/config/github/providers, with mocked `fetch` for Gemini) and, most importantly, `aido review`'s suggestion pipeline: `buildLineMap` hunk numbering, `validateSuggestion` safeguards (guard-clause and existence-check protection, identifier-overlap threshold), and `parseSuggestions`.
- **ci:** New **`unit-tests.yml`** workflow runs the suite on every PR; installs only `@octokit/rest`, needs no secrets, makes no network calls.
- **tests:** New examples-sync tests fail CI whenever a file under `examples/` drifts from its canonical counterpart.

### 🔒 Security

- **deps:** Bumped `js-yaml` (quadratic-complexity DoS in merge key handling, Dependabot alert #16) and `brace-expansion` (zero-step sequence DoS, GHSA-f886-m6hf-6m8v) in the lint toolchain lockfile; `npm audit` is clean (#49).
- **examples:** Re-synced `examples/.github/dispatch/workflows/aido-dispatch.yml` with the canonical dispatcher — the example still contained the comment-body script-injection pattern that was fixed in the real workflow in v1.0.7 (#40). If you copied the dispatch workflow from `examples/` before this release, update it.

### 🧹 Chores & Docs

- **ci:** Bumped `actions/checkout` to v7 across all workflows (#46) and `actions/cache` to v6 (#47).
- **examples:** All example scripts and workflows re-synced with the current codebase (they were one full refactor behind); added `examples/.github/lib/` with installation notes; example READMEs now call out the shared-library requirement.
- **docs:** README documents the shared library and the previously missing `aido-test.yml`/`aido-triage.yml` reusable workflows; CONTRIBUTING covers running the unit tests locally and when to add tests.

#### ✅ Result

A structurally healthier codebase: half the script code, a real test suite gating every PR, clean security audit, current action versions, and examples that can no longer silently drift out of date.

---

## [v1.0.7] - 2026-05-15

### ✨ New Features

- **triage:** Introduced the new `aido triage` command — the first Aido command that targets **issues** rather than PRs.
  Classifies the issue (bug / feature / security / chore / question / docs), suggests labels constrained to a configurable candidate list, surfaces similar recent open issues, and recommends next steps. Optionally applies labels automatically when `applyLabels: true` is set in `aido-triage-config.json` (default: `false`). Backed by a new reusable workflow **`aido-triage.yml`**.

### 🧠 Improvements & Refactorings

- **dispatch:** Refactored `aido-dispatch.yml` to route both PR-comment and issue-comment events. Added an `is_pr` output; existing PR commands now gate on `is_pr == 'true'`, and `aido triage` gates on `is_pr == 'false'`.
- **dispatch:** Routed `aido triage` through dispatch, added it to the help output, and included its config in `aido config-check` validation.

### 🔒 Security

- **dispatch:** Fixed a GitHub Actions script-injection vulnerability in the dispatch parse step. The attacker-controlled comment body was previously spliced into a shell script via `${{ github.event.comment.body }}`; it is now passed via an `env:` variable and quoted as `"$COMMENT_BODY"`, eliminating the injection vector. Closes #31.

#### ✅ Result

Opens Aido up to a new surface — issues — starting with `aido triage`. Ships alongside a hardening fix to the dispatcher's comment-parsing.

---

## [v1.0.6] - 2026-05-13

### ✨ New Features

- **test:** Introduced the new `aido test` command for generating structured test plans directly from PRs.
  Produces proposed test cases (functional, negative, edge), identified coverage gaps, and follow-up tasks (fixtures, mocks, regression updates). Backed by a new reusable workflow **`aido-test.yml`** and configuration file `aido-test-config.json` with configurable test focus (unit / integration / e2e / regression / performance / security / accessibility).

### 🧠 Improvements & Refactorings

- **dispatch:** Routed `aido test` through `aido-dispatch.yml`, added it to the help output, and included its config in `aido config-check` validation.

#### ✅ Result

Expands Aido's automation pipeline with a dedicated test-planning command, complementing the existing `review`, `summarize`, `explain`, `docs`, and `suggest` commands.

---

## [v1.0.5] - 2025-11-03

### ✨ New Features

- **docs:** Introduced the new `aido docs` command for generating documentation drafts directly from PRs or issue comments.
  Integrated into the CLI help output and supported by a new reusable workflow **`aido-docs.yml`**, allowing automatic documentation creation from PR context (summary, highlights, breaking changes, release notes draft).

### 🧠 Improvements & Refactorings

- **core:** Simplified AI model selection across workflows using bracket notation and optional chaining, improving readability and maintainability.
  The same model selection pattern is now applied consistently across all scripts.
- **text:** Introduced a named `ELLIPSIS_MARKER` constant in workflows to eliminate magic numbers and clarify truncation logic.
  Ensures safer and more predictable truncation of long AI outputs.
- **review:** Updated PR number retrieval to use `github.event.pull_request.number` with fallbacks for other event types.
  Prevents workflow dispatch failures and improves cross-event compatibility.
- **ci:** Quoted `pr_number` inputs in all reusable workflows (`aido-explain.yml`, `aido-review.yml`, `aido-summarize.yml`, `aido-suggest.yml`, `aido-docs.yml`) for consistent JSON handling and to avoid parsing errors.
  Fixed synthetic event creation logic for more reliable dispatching.
- **core:** Removed unused includes/imports and applied minor readability and structure improvements across scripts.

#### ✅ Result

Delivers improved internal consistency, workflow reliability, and expanded functionality with the new **Docs** command.
Workflows are now safer and more predictable, and Aido’s automation pipeline is better prepared for upcoming releases.

---

## [v1.0.4] - 2025-10-21

### 🐛 Bug Fixes

- **review:** Treat `commonIds` as a **Set** (instead of array) so `.has()` works; compute `overlapRatio` using `commonIds.size`. Prevents runtime error: `commonIds.has is not a function`.
- **review:** Use trimmed `suggestedCode` for identifier extraction; minor log consistency improvements.

### 📚 Documentation

- **README.md:** Clarified validation pipeline (guard/exists protection, control-flow detection, ≥20% identifier overlap, multi-line continuity) and how rejections are surfaced.
- **examples/README.md:** Added a “Why suggestions get rejected” section with quick troubleshooting tips for line mapping and overlap.

#### ✅ Result

Stabilizes the review workflow under provider variance and preserves the **zero false positives** goal without crashing.

---

## [v1.0.3] - 2025-10-21

### 🤖 Review Engine Rewrite — Safer, Smarter AI Reviews

Version **1.0.3** delivers a complete, safety-oriented rewrite of `aido-review`.
The new validation system filters out unsafe AI suggestions while preserving **zero false positives**, ensuring every proposed change can be safely applied.

#### ✨ Added / Changed

- **Robust validation layer**
  - Guard clause protection — prevents removal of early returns (`return null`, `return false`, etc.).
  - Existence check protection — blocks suggestions that drop validation checks (`isset`, `!== null`, etc.).
  - Control-flow rewrite detection — rejects major structural rewrites (`if` → `foreach`, etc.).
  - Identifier overlap requirement — enforces ≥ 20 % shared identifiers between actual and suggested code.
  - Multi-line continuity checks — ensures multi-line replacements start in the same logical scope.
- **Improved diff mapping** using a new `buildLineMap()` function for accurate line targeting.
- **Line + side API** integration for precise inline GitHub comments.
- **Detailed validation logs** explaining why suggestions were accepted or rejected.
- **Consolidated prompt refinements** for consistent, concise review output.
- **Context check cleanup** — faster import and PR description consistency checks.

#### 🧩 Compatibility

- Backward compatible with existing reviewer configs.
- Supports **Gemini**, **ChatGPT**, and **Claude** providers.
- No breaking changes for existing workflows.

#### ✅ Result

Safer, more predictable AI reviews that block 30–40 % of low-confidence suggestions while maintaining 100 % safety.
Zero false positives — every suggestion is immediately safe to apply.

---

## [v1.0.2] - 2025-10-15

### 🛠 Suggest Improvements

Enhanced **Aido Suggest** with detailed output formatting and per-file prompting.

#### ✨ Added / Changed

- Introduced **structured Replace/With code blocks** for clearer, contract-compliant suggestions.
- Refactored per-file prompt generation to improve readability and consistency.
- Improved **prompt clarity**, **code-fence sanitization**, and **error handling**.
- Increased output reliability across AI providers.

#### ✅ Result

Suggestions are now easier to read, safer to apply manually, and more reliable in long PRs.
_No breaking changes. Fully compatible with v1.x._

---

## [v1.0.1] - 2025-10-13

### 🛠 Suggest Improvements

Refined **Aido Suggest** to generate clearer, per-file, human-readable suggestions designed for manual review.

#### ✨ Added / Changed

- Per-file prompt generation for targeted AI context.
- Strict output contract enforcement and code fence sanitization.
- Reformatting fallback for provider compliance.
- Reduced diff truncation threshold for efficiency.
- Improved per-file error handling and suggestion aggregation.

#### ✅ Result

Suggestions are now more consistent across files and better aligned with GitHub’s comment formatting.
_No breaking changes. Fully compatible with v1.x._

---

## [v1.0.0] - 2025-10-11

### 🚀 First Public Release

**Aido** — your AI-powered, multi-provider coding assistant for GitHub pull requests.
Review, summarize, explain, and improve code simply by commenting on a PR — powered by **Gemini**, **ChatGPT**, and **Claude**.

#### ✨ Added

- On-demand PR reviews (`aido review`, `aido summarize`, `aido explain`, `aido suggest`)
- Multi-provider support: **Gemini**, **ChatGPT**, **Claude**
- Persona-based, multi-faceted reviews with configurable tones and prompts
- Inline “Apply suggestion” support for direct PR improvements
- Optional context-aware checks (cross-file and PR description consistency)
- Fully configurable workflows, prompts, and output formats

#### ❤️ Why It Matters

Aido makes AI-assisted PR reviews **practical, configurable, and team-friendly** — saving time, catching issues early, and improving code quality without leaving GitHub.

---
