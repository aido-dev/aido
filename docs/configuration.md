# Configuration

Each command reads an optional JSON config; absent it, shipped defaults apply. In a remote
install, just add the config file you want to override — no scripts to copy.

## Shared config keys

Every command config supports:

- `provider` — `CHATGPT` | `GEMINI` | `CLAUDE` | `OPENAI`
- `model` — a provider-keyed map, e.g. `"model": { "CLAUDE": "claude-opus-4-8" }`
- `baseURL` — for the `OPENAI` (OpenAI-compatible) provider
- `language`, `tone`, `style`, `length`
- `include` — which context to send (`title` / `body` / `filesSummary` / `diff`)
- `additionalInstructions`
- `promptTemplate` — optional, with placeholders

**Choosing a model:** set `model` per provider. The default provider is **Gemini**, and the default model is **`gemini-3.6-flash`** — override it with `"model": { "GEMINI": "…" }` (or switch providers). Any current Claude model works too — Opus (4.6 / 4.7 / 4.8), Fable 5, Sonnet 4.6, Haiku 4.5. Aido sends no sampling `temperature` to Claude (recent models manage it internally and reject the parameter), so the latest models work out of the box.

**Diff size (`summarize` / `explain` / `docs`):** these commands truncate the PR diff to keep prompts efficient. The default budget is **60,000 characters**. Override per-repo with **`maxDiffChars`** — a positive number sets the budget; **`0`** or **`"none"`** sends the **full diff** (mind token cost and provider request-size limits on very large PRs). `review` sends the **full diff** and is unaffected.

**Excluding noise files (`excludePaths`):** `review`, `summarize`, `explain`, and `docs` strip non-reviewable files from the diff before prompting — lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `go.sum`, `Cargo.lock`, …), minified bundles (`*.min.js`/`*.min.css`), source maps, `dist/`·`build/`·`vendor/`·`node_modules/`, snapshots, and generated files. This cuts token usage and review noise. Add your own globs via **`excludePaths`** (unioned with the built-in defaults); set **`excludeDefaults: false`** to use only your list. Excluded files are also skipped for inline suggestions.

```jsonc
{ "excludePaths": ["**/*.csv", "docs/generated/**"] }
```

## Per-command scripts & configs

- **Shared library (required by all commands):** `.github/scripts/lib/`
  - `providers.js` — provider wrappers (ChatGPT / Gemini / Claude + a generic OpenAI-compatible provider), model resolution
  - `github.js` — GitHub API client, event parsing, PR context, comment posting
  - `config.js` — JSON config loading with defaults + deep merge
  - `text.js` — truncation, files summary, prompt templates, footers
- **Review** — `review/aido-review.js` · `review/aido-review-config.json` _(object `{ reviewer, personas }`; see [Persona reviews](personas.md))_
- **Summarize** — `summarize/aido-summarize.js` · `summarize/aido-summarize-config.json`
- **Explain** — `explain/aido-explain.js` · `explain/aido-explain-config.json`
- **Docs** — `docs/aido-docs.js` · `docs/aido-docs-config.json`
- **Suggest** — `suggest/aido-suggest.js` · `suggest/aido-suggest-config.json`
- **Test** — `test/aido-test.js` · `test/aido-test-config.json` _(adds `testFocus`: unit / integration / e2e / regression / performance / security / accessibility)_
- **Triage (issues)** — `triage/aido-triage.js` · `triage/aido-triage-config.json` _(adds `candidateLabels`, `severityLabels`, `applyLabels` to optionally auto-apply labels; default `false`)_
- **Digest (scheduled)** — see [Auto-run & digest](auto-and-digest.md).

(All paths are under `.github/scripts/`.)

## Bring any model (OpenAI-compatible)

Beyond the three first-class providers (Gemini, ChatGPT, Claude), Aido ships a generic **`OPENAI`** provider for any endpoint that speaks the OpenAI `/chat/completions` API — **DeepSeek, Kimi (Moonshot), Grok (xAI), Mistral, OpenRouter**, and self-hosted gateways. Set `provider: "OPENAI"`, point `baseURL` at the endpoint, and put the key in the **`OPENAI_API_KEY`** secret:

```jsonc
// e.g. .github/scripts/review/aido-review-config.json — DeepSeek
{
  "reviewer": {
    "provider": "OPENAI",
    "baseURL": "https://api.deepseek.com",
    "model": { "OPENAI": "deepseek-chat" },
  },
}
```

One key, one endpoint, any model — nothing else to install. (`temperature` is opt-in here too, so reasoning-style endpoints that reject it still work.)

## Caveats

- The diff sent to `summarize`/`explain`/`docs` is truncated (default 60k chars, configurable via `maxDiffChars`); `review` sends the full diff.
- Provider/model availability and naming change over time — set explicit models in configs.
- Sampling `temperature` is only sent to ChatGPT and Gemini — current Claude models (Opus 4.7+ / Fable 5) reject it, so Aido omits it for Claude.
- Forked PRs may lack secrets → provider calls may be skipped.
