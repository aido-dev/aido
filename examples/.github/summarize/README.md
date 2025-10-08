# Aido Summarize Workflow & Config

## Purpose
The `aido-summarize.yml` workflow generates a stakeholder-facing, high-level summary of a pull request.
It gathers PR context (title, description, changed files, diff), builds a concise summary prompt using the config, and generates content with a selected AI provider (ChatGPT, Gemini, or Claude).
The result is posted back as a PR comment to help product/engineering leadership and reviewers quickly understand intent, scope, and risk. It does not include code blocks, diffs, or inline suggestions.

What it delivers (sections):
- Overview — what changed and why (1–2 sentences)
- Scope — key modules/files touched (no low-level detail)
- Risks — potential breaking changes and unknowns
- Impact — user, API, performance, security
- Testing — what was done or still needed
- Follow-ups — next steps or TODOs

---

## Workflow Configuration (`aido-summarize.yml`)

- **Trigger**: `workflow_call` (invoked by `aido-dispatch.yml`).
- **Inputs**:
  - `pr_number` (number) – required; the pull request to summarize.
- **Secrets**:
  - `GITHUB_TOKEN` – required for API and comments.
  - `CHATGPT_API_KEY` – required if using ChatGPT.
  - `GEMINI_API_KEY` – required if using Gemini.
  - `CLAUDE_API_KEY` – required if using Claude (optional overall).
- **Environment**:
  - A synthetic event file (`GITHUB_EVENT_PATH`) is created to simulate PR context.
- **Workflow files**:
  - `.github/workflows/aido-summarize.yml` (workflow)
  - `.github/scripts/summarize/aido-summarize.js` (script)
- **Config file**:
  - `.github/scripts/summarize/aido-summarize-config.json`

---

## Workflow Dependencies

- **Workflow**: Called from `aido-dispatch.yml` when the command `aido summarize`, `aido sum`, or `aido summary` is issued.
- **Script**: Runs `.github/scripts/summarize/aido-summarize.js` to:
  - Load config (`aido-summarize-config.json`).
  - Fetch PR metadata, changed files, and diff.
  - Generate a summary via provider API.
  - Post result as a PR comment.
- **Packages**: Installs `openai`, `@octokit/rest`, `@google/generative-ai`, `@anthropic-ai/sdk`.

---

## Workflow Usage Notes / Limitations

- Runs only when triggered by the aido-dispatch workflow (not standalone).
- Configurable provider and model; defaults to **Gemini 2.5 Flash** if unspecified.
- Diff is truncated (~15k chars) to keep prompts manageable.
- This summary is stakeholder-facing: do NOT include code blocks, diffs, or inline suggestions.
- Output is **always a draft**: review and edit before committing to docs or release notes.
- On forked PRs, provider secrets may not be available.

---

## Config Reference (`aido-summarize-config.json`)

Defines how the **Aido Summarize** workflow generates summaries for pull requests.
Controls provider, model, tone, style, included PR context, and output length.

### Fields

- **provider**: Which AI provider to use (`CHATGPT` | `GEMINI` | `CLAUDE`).
- **model**: Mapping of provider → model name (e.g. `"gemini-2.5-flash"`).
- **language**: Output language (e.g. `"English"`, `"Spanish"`, `"Cowboy English"`).
- **tone**: Writing tone (e.g. `"executive, concise, professional"`).
- **style**: Summary style (e.g. `"bullet-points"`, `"paragraph"`).
- **length**: Desired output length (`short` | `medium` | `long`).
- **include**: Flags to control included context:
  - `title`, `body`, `filesSummary`, `diff` (all boolean).
- **additionalInstructions**: Extra guidance appended to the prompt.
- **promptTemplate**: Optional string template overriding the default prompt.
  - Placeholders: `{{language}}`, `{{tone}}`, `{{length}}`, `{{style}}`,
    `{{prTitle}}`, `{{prBody}}`, `{{filesSummary}}`, `{{diff}}`.

### Config Usage Notes

- If `promptTemplate` is set, it replaces the default instructions.
- Missing fields fall back to workflow defaults (see `aido-summarize.js`).
- Diff input is truncated (~15k chars) to keep prompts reasonable.
- Default sections delivered: Overview, Scope, Risks, Impact, Testing, Follow-ups.
- Summaries are designed to be **concise, high-level overviews** — not detailed documentation.
