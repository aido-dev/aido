# AIDO Dispatch Workflow

## Purpose
The `aido-dispatch.yml` workflow listens for new **pull request comments**.
It normalizes the first line of the comment and routes supported `aido <command>` invocations to reusable workflows.
This keeps the Actions UI clean by separating parsing/dispatch from actual execution.

Supported commands include:
- `aido review`
- `aido summarize | aido sum`
- `aido explain`
- `aido suggest | aido improve`
- `aido help`
- `aido debug`
- `aido config-check | aido check-config | aido cc`
- `aido debug --check-config` (alias for config-check)

Special commands:
- **help** → posts available commands
- **debug** → posts diagnostic details
- **config-check** → validates AIDO config files

---

## Configuration

- **Triggers**: `issue_comment` (only PR comments are routed).
- **Permissions**: Requires `contents: read`, `pull-requests: write`, `issues: write`, `checks: read`.
- **Secrets**:
  - `GITHUB_TOKEN` (built-in; used for posting comments).
  - `CHATGPT_API_KEY`, `GEMINI_API_KEY`, `CLAUDE_API_KEY` (passed explicitly to downstream jobs).
- **Inputs**:
  - PR number is taken from the triggering event (`github.event.issue.number`).
- **Workflow files**:
  - `.github/workflows/aido-*.yml`.
- **Config files**:
  - `.github/scripts/.../aido-*-config.json` (validated by `aido config-check`).

---

## Dependencies

- Calls multiple reusable workflows in `.github/workflows/`, e.g.:
  - `aido-review.yml`
  - `aido-summarize.yml`
  - `aido-explain.yml`
  - `aido-suggest.yml`
- Uses GitHub CLI (`gh`) for posting comments.
- Requires `jq` for `config-check`.

---

## Usage Notes / Limitations

- Only **the first line** of a comment is parsed. Extra text is ignored.
- Must be run **on a PR comment**; plain issues are not processed (for now).
- On **forked PRs**, repository secrets may be unavailable (GitHub policy).
- Commands are case-insensitive and whitespace-insensitive.
- `aido help`, `aido debug`, and `aido config-check` do not trigger downstream workflows; they respond inline.
