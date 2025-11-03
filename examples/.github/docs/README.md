# Aido Docs Workflow & Config

## Purpose
The `aido-docs.yml` workflow drafts or augments documentation for a pull request.
It collects PR context (title, description, changed files, diff), builds a prompt using the config, and generates documentation with a selected AI provider (ChatGPT, Gemini, or Claude).
The result is posted back as a PR comment.

---

## Workflow Configuration (`aido-docs.yml`)

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
  - `.github/workflows/aido-docs.yml` (workflow)
  - `.github/scripts/docs/aido-docs.js` (script)
- **Config file**:
  - `.github/scripts/docs/aido-docs-config.json`

---

## Workflow Dependencies

- **Workflow**: Called from `aido-dispatch.yml` when the command `aido docs` is issued.
- **Script**: Runs `.github/scripts/docs/aido-docs.js` to:
  - Load config (`aido-docs-config.json`).
  - Fetch PR metadata, changed files, and diff.
  - Generate documentation via provider API.
  - Post result as a PR comment.
- **Packages**: Installs `openai`, `@octokit/rest`, `@google/generative-ai`, `@anthropic-ai/sdk`.

---

## Workflow Usage Notes / Limitations

- Runs only when triggered by the aido-dispatch workflow. (not standalone).
- Configurable provider and model; defaults to **Gemini 2.5 Flash** if unspecified.
- Diff is truncated (~15k chars) to keep prompts manageable.
- Output is always posted as a PR comment (not committed).
- Generated docs are drafts: **manual review/editing required before committing**.
- On forked PRs, provider secrets may not be available.

---

## Config Reference (`aido-docs-config.json`)

Defines how the **AIDO Docs** workflow generates documentation for pull requests.
Controls provider, model, output style, and included PR context.

### Fields

- **provider**: Which AI provider to use (`CHATGPT` | `GEMINI` | `CLAUDE`).
- **model**: Mapping of provider → model name (e.g. `"gemini-2.5-flash"`).
- **language**: Output language (e.g. `"English", "Pirate lingo", "Old English poetry Style"`).
- **tone**: Writing tone (e.g. `"clear, professional"`).
- **style**: Writing style (e.g. `"pedagogic"`, `"technical"`, `"succinct"`).
- **length**: Desired output length (`short` | `medium` | `long`).
- **outputFormat**: `"markdown"` or `"plain-text"`.
- **include**: Flags to control included context:
  - `title`, `body`, `filesSummary`, `diff` (all boolean).
- **additionalInstructions**: Freeform extra guidance appended to the prompt.
- **promptTemplate**: Optional string template overriding the default prompt.
  - Placeholders: `{{language}}`, `{{tone}}`, `{{style}}`, `{{length}}`,
    `{{outputFormat}}`, `{{prTitle}}`, `{{prBody}}`, `{{filesSummary}}`, `{{diff}}`.

### Config Usage Notes

- If `promptTemplate` is set, it replaces the default instructions.
- Missing fields fall back to workflow defaults (see `aido-docs.js`).
- Diff input is truncated (~15k chars) to keep prompts reasonable.
- Keep `additionalInstructions` focused — excessive text may reduce clarity.
