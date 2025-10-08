# Aido Explain Workflow & Config

## Purpose
The `aido-explain.yml` workflow generates a **developer-focused, step-by-step explanation** of a pull request.
It collects PR context (title, description, changed files, diff), builds a step-by-step explanation prompt using the config, and generates content with a selected AI provider (ChatGPT, Gemini, or Claude).
The result is posted back as a PR comment to help engineers understand intent, mechanics, and impact. It differs from Summarize, which targets stakeholders and avoids deep technical detail.

---

## Workflow Configuration (`aido-explain.yml`)

- **Trigger**: `workflow_call` (invoked by `aido-dispatch.yml`).
- **Inputs**:
  - `pr_number` (number) – required; the pull request to process.
- **Secrets**:
  - `GITHUB_TOKEN` – required for API and comments.
  - `CHATGPT_API_KEY` – required if using ChatGPT.
  - `GEMINI_API_KEY` – required if using Gemini.
  - `CLAUDE_API_KEY` – required if using Claude (optional overall).
- **Environment**:
  - A synthetic event file (`GITHUB_EVENT_PATH`) is created to simulate PR context.
- **Workflow files**:
  - `.github/workflows/aido-explain.yml` (workflow)
  - `.github/scripts/explain/aido-explain.js` (script)
- **Config file**:
  - `.github/scripts/explain/aido-explain-config.json`

---

## Workflow Dependencies

- **Workflow**: Called from `aido-dispatch.yml` when the command `aido explain` is issued.
- **Script**: Runs `.github/scripts/explain/aido-explain.js` to:
  - Load config (`aido-explain-config.json`).
  - Fetch PR metadata, changed files, and diff.
  - Generate a structured explanation via provider API.
  - Post result as a PR comment.
- **Packages**: Installs `openai`, `@octokit/rest`, `@google/generative-ai`, `@anthropic-ai/sdk`.

---

## Workflow Usage Notes / Limitations

- Runs only when triggered by the aido-dispatch workflow (not standalone).
- Configurable provider and model; defaults to **Gemini 2.5 Flash** if unspecified.
- Developer audience: deeper than Summarize; focuses on intent, mechanics, and verification.
- Structure: Intent, Walkthrough (by file/module), Design choices, Risks, Verification, Follow-ups.
- Minimal snippet policy: only if essential to explain a point; keep under ~5 lines and at most one per point. Prefer referencing file paths, functions, or diffs instead of pasting code.
- Do not include code suggestions or large code blocks; explanations should not propose unrelated changes.
- Diff is truncated (~15k chars) to keep prompts manageable.
- Output is always posted as a PR comment (not committed).
- Explanations are drafts: **manual review/editing recommended**.
- On forked PRs, provider secrets may not be available.

---

## Config Reference (`aido-explain-config.json`)

Defines how the **Aido Explain** workflow generates explanations for pull requests.
Controls provider, model, tone, style, and included PR context.

### Fields

- **provider**: Which AI provider to use (`CHATGPT` | `GEMINI` | `CLAUDE`).
- **model**: Mapping of provider → model name (e.g. `"gemini-2.5-flash"`).
- **language**: Output language (e.g. `"English"`, `"Pirate lingo"`, `"Haiku"`).
- **tone**: Writing tone (e.g. `"developer-focused, clear, pragmatic"`).
- **style**: Explanation style (e.g. `"step-by-step"`, `"bullet-points"`, `"paragraph"`).
- **length**: Desired output length (`short` | `medium` | `long`).
- **include**: Flags to control included context:
  - `title`, `body`, `filesSummary`, `diff` (all boolean).
- **additionalInstructions**: Freeform extra guidance appended to the prompt.
- **promptTemplate**: Optional string template overriding the default prompt.
  - Placeholders: `{{language}}`, `{{tone}}`, `{{length}}`, `{{style}}`,
    `{{prTitle}}`, `{{prBody}}`, `{{filesSummary}}`, `{{diff}}`.

### Config Usage Notes

- If `promptTemplate` is set, it replaces the default instructions.
- Missing fields fall back to workflow defaults (see `aido-explain.js`).
- Diff input is truncated (~15k chars) to keep prompts reasonable.
- Keep `additionalInstructions` focused — excessive text may reduce clarity.

---
