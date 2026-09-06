# How it works

**Dispatcher** — `.github/workflows/aido-dispatch.yml` parses the first line of a comment,
normalizes it, authenticates the actor (owner/collaborator only), and routes to the right
reusable workflow.

**Reusable workflows** (invoked via `workflow_call`):

- `.github/workflows/aido-review.yml`
- `.github/workflows/aido-summarize.yml`
- `.github/workflows/aido-explain.yml`
- `.github/workflows/aido-docs.yml`
- `.github/workflows/aido-suggest.yml`
- `.github/workflows/aido-test.yml`
- `.github/workflows/aido-triage.yml` _(issues)_
- `.github/workflows/aido-auto.yml` _(auto-run on AI-authored PRs)_
- `.github/workflows/aido-digest.yml` _(scheduled digest)_

Each command builds a prompt from PR context (title, body, changed files, and the diff —
truncated to ~60k chars for `summarize`/`explain`/`docs`, full for `review`), calls the
selected provider/model, and **posts a PR review with inline, applyable suggestions** (when
applicable), validated by a robust layer for safety and accuracy.

All commands share `.github/scripts/lib/` (providers, GitHub client, config loading, text
utilities) — see [Configuration](configuration.md#per-command-scripts--configs).

## Security posture

Aido reads untrusted PR/issue content and sends it to an LLM. Key protections and the
adopter policy (most importantly: **never wire Aido's output to auto-merge**) are documented
in [`SECURITY.md`](../SECURITY.md).

## Data handling & reliability

- **Data:** prompts, code, and metadata may be sent to external AI services and could be logged/retained by those providers. Don't include secrets, confidential, or regulated data unless you trust the operator and provider.
- **Reliability:** providers can rate-limit, change models, or go offline without notice.
- **Accuracy:** AI can be incorrect, outdated, or hallucinate — always verify reviews, explanations, and suggestions before applying. Don't depend on AI output for production without human review.
