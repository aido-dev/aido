# Aido Suggest Workflow & Config

## Purpose
The `aido-suggest.yml` workflow analyzes a pull request and proposes **concrete improvements and small, safe refactors**.
It gathers PR context (title, description, changed files, diff), builds a suggestions prompt using the config, and generates content with a selected AI provider (ChatGPT, Gemini, or Claude).
The result is posted as a PR comment with structured recommendations and code snippets.

---

## Workflow Configuration (`aido-suggest.yml`)

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
  - `.github/workflows/aido-suggest.yml` (workflow)
  - `.github/scripts/suggest/aido-suggest.js` (script)
- **Config file**:
  - `.github/scripts/suggest/aido-suggest-config.json`

---

## Workflow Dependencies

- **Workflow**: Called from `aido-dispatch.yml` when the command `aido suggest` or `aido improve` is issued.
- **Script**: Runs `.github/scripts/suggest/aido-suggest.js` to:
  - Load config (`aido-suggest-config.json`).
  - Fetch PR metadata, changed files, and diff.
  - Generate suggestions via provider API.
  - Sanitize code fences to ensure valid GitHub rendering.
  - Post result as a PR comment.
- **Packages**: Installs `openai`, `@octokit/rest`, `@google/generative-ai`, `@anthropic-ai/sdk`.

---

## Workflow Usage Notes / Limitations

- Runs only when triggered by the aido-dispatch workflow (not standalone).
- Configurable provider and model; defaults to **Gemini 2.5 Flash** if unspecified.
- Diff is truncated (~15k chars) to keep prompts manageable.
- Output is **always a draft**: review and edit before applying suggestions.
- Code snippets are formatted with fenced blocks:
  - `~~~` for code examples (with language hints).
  - \`\`\`suggestion fences for directly applicable GitHub suggestions.
- On forked PRs, provider secrets may not be available.

---

## Config Reference (`aido-suggest-config.json`)

Defines how the **Aido Suggest** workflow generates actionable improvement suggestions.
Controls provider, model, tone, style, included PR context, and guardrails.

### Fields

- **provider**: Which AI provider to use (`CHATGPT` | `GEMINI` | `CLAUDE`).
- **model**: Mapping of provider → model name (e.g. `"gemini-2.5-flash"`).
- **language**: Output language (e.g. `"English"`, `"Spanish"`, `"Santa Clause lingo"`).
- **tone**: Writing tone (e.g. `"constructive, pragmatic, professional"`).
- **style**: Output style (e.g. `"bullet-points"`, `"sections"`, `"paragraph"`).
- **length**: Desired output length (`short` | `medium` | `long`).
- **include**: Flags to control included context:
  - `title`, `body`, `filesSummary`, `diff` (all boolean).
- **guardrails**: Rules to constrain suggestions (e.g. focus on safe refactors, avoid large rewrites).
- **deliverFormat**: How suggestions should be structured (title, rationale, code snippets, risk, effort).
- **additionalInstructions**: Extra guidance appended to the prompt.
- **promptTemplate**: Optional string template overriding the default prompt.
  - Placeholders: `{{language}}`, `{{tone}}`, `{{length}}`, `{{style}}`,
    `{{prTitle}}`, `{{prBody}}`, `{{filesSummary}}`, `{{diff}}`,
    `{{guardrails}}`, `{{deliverFormat}}`.

### Config Usage Notes

- If `promptTemplate` is set, it replaces the default instructions.
- Missing fields fall back to workflow defaults (see `aido-suggest.js`).
- Diff input is truncated (~15k chars) to keep prompts reasonable.
- Suggestions are designed to be **incremental and safe**, not sweeping rewrites.
