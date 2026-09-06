# Installation

Aido runs entirely in **your** GitHub Actions with **your** provider API key — no hosted
service, no third-party data processor.

## Requirements

- **Provider secret(s)** (add under _Settings → Secrets and variables → Actions_):
  - `GEMINI_API_KEY` — required for the default provider ([free key](https://aistudio.google.com/apikey))
  - `CHATGPT_API_KEY` — if using ChatGPT
  - `CLAUDE_API_KEY` — if using Claude
  - `OPENAI_API_KEY` — if using an OpenAI-compatible endpoint (DeepSeek, Kimi, Grok, Mistral, …)
- Uses the built-in **`GITHUB_TOKEN`** to post comments and reviews.
- ⚠️ **Forked PRs**: repository secrets may be unavailable due to GitHub policy, so provider calls may be skipped.

## Option A — Remote install (one file, recommended)

1. Add the provider secret(s) above.
2. Copy [`examples/remote/aido.yml`](../examples/remote/aido.yml) → `.github/workflows/aido.yml` — a single thin workflow that runs Aido from a pinned release tag (the moving `@v1` tag keeps you on the latest). Upgrading is a one-line tag bump.
3. Comment `aido review` on a PR.
4. (Optional) Customize any command by adding its config file (e.g. `.github/scripts/review/aido-review-config.json`) — it overrides the shipped defaults, no scripts to copy. See [`examples/remote/`](../examples/remote/).

## Option B — Copy-based install (full control)

1. Add the provider secret(s) above.
2. Commit the workflows (`.github/workflows/*`) and scripts (`.github/scripts/*`).
   ⚠️ Include `.github/scripts/lib/` — every command script depends on this shared library.
3. Comment `aido review` on a PR.
4. (Optional) Customize `aido-*-config.json` — or the prompts and scripts themselves.

## Use Aido as a GitHub Action (a step in your workflow)

Prefer to control exactly when Aido runs? Add the Marketplace-published composite action as a **step**:

```yaml
- uses: aido-dev/aido@v1
  with:
    command: review # review | summarize | explain | docs | suggest | test | triage
    pr_number: ${{ github.event.pull_request.number }}
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

For `triage`, pass `issue_number` instead of `pr_number`. See [`examples/action/`](../examples/action/) for full workflows.

**Two ways to run Aido — pick per use case:**

- **Reusable workflows / one-file install** (Options A/B) → the comment-driven UX (`aido review` on a PR) and [auto-run on AI-authored PRs](auto-and-digest.md).
- **Composite action** → run a specific command as a step, on your own triggers (e.g. review every PR on `pull_request`).

## Free to run

Several providers have free tiers, so you can get **free AI PR reviews**:

- **Google Gemini** _(default)_ — free key at [Google AI Studio](https://aistudio.google.com/apikey) → `GEMINI_API_KEY`. That's the whole quick start.
- **Mistral** — free "Experiment" tier at [console.mistral.ai](https://console.mistral.ai). Use the OpenAI-compatible provider (`provider: "OPENAI"`, `baseURL: "https://api.mistral.ai/v1"`) with the key as `OPENAI_API_KEY` — see [Bring any model](configuration.md#bring-any-model-openai-compatible).
- **Other OpenAI-compatible endpoints** with free tiers work the same way (OpenRouter `:free` models, Groq, Cerebras) — check each provider's current limits.

> Free tiers are rate-limited — fine for most repos; a paid key avoids throttling on busy ones.
