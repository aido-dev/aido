# Auto-run & digest

Two ways Aido runs **without** an `aido <command>` comment.

## Auto-run on AI-authored PRs

When an AI agent (Copilot, Claude Code, Cursor, …) opens a pull request, Aido can run
automatically so a human can quickly understand and digest code they didn't write.

- Add `.github/workflows/aido-auto.yml` (copy-based) or [`examples/remote/aido-auto.yml`](../examples/remote/aido-auto.yml) (remote install).
- Configure which authors trigger it and which commands run in `.github/scripts/auto/aido-auto-config.json`.
- **Companion-first defaults:** `explain` + `summarize`. Add `review`, `docs`, or `test` to `commands` to run more.
- **Only AI-authored PRs trigger it** (per `aiAuthors`); human PRs are never auto-run. Fires on PR open/reopen/ready — **not on every commit**.
- **Per-PR opt-out:** add a `no-aido` label (configurable via `skipLabels`) or put `<!-- aido: skip -->` in the PR body.
- Fires on `pull_request` (not `pull_request_target`), and the gate runs from the base branch — forked PRs stay safe (read-only token, no secrets, no PR-head code execution).

```jsonc
// .github/scripts/auto/aido-auto-config.json
{
  "enabled": true,
  "aiAuthors": ["copilot", "claude-code[bot]", "cursor[bot]"],
  "commands": ["explain", "summarize"],
  "skipLabels": ["no-aido"],
}
```

> `github-actions[bot]` and `dependabot[bot]` are excluded by default — the former is too broad, and Dependabot PRs run with a read-only token and no repo secrets, so Aido can't act on them. Add explicitly at your own risk.

## Weekly "what shipped" digest

On a schedule, Aido summarizes the PRs **merged in the last window** (default 7 days) into
a skimmable digest and posts it as a new **GitHub Issue** or **Discussion** —
_"📦 What shipped — Aug 2 – Aug 9, 2026"_ — grouping notable changes and noting how many
were **opened by AI agents**.

Live examples (this repo's own digest): [as an Issue](https://github.com/aido-dev/aido/issues/92) · [as a Discussion](https://github.com/aido-dev/aido/discussions/93).

- Add `.github/workflows/aido-digest.yml` (copy-based) or [`examples/remote/aido-digest.yml`](../examples/remote/aido-digest.yml) (remote).
- Configure window, model, label, destination, and cadence in `.github/scripts/digest/aido-digest-config.json`.
- **Only posts when there's something to report** — a quiet window produces nothing (`skipEmpty`, default `true`; set `false` for a weekly heartbeat).
- **Issue or Discussion** — set `destination` to `"issue"` (default) or `"discussion"` (with `discussionCategory`; needs Discussions enabled + `discussions: write`).
- Runs on a weekly **cron** plus **manual dispatch** — edit the `cron` to change cadence (keep `lookbackDays` in sync).
- Needs `issues: write` (and `discussions: write` for the Discussion destination) plus `pull-requests: read`.

```jsonc
// .github/scripts/digest/aido-digest-config.json
{
  "provider": "GEMINI",
  "model": { "GEMINI": "gemini-3.6-flash" },
  "lookbackDays": 7,
  "maxPrs": 40,
  "label": "digest",
  "destination": "issue",
  "skipEmpty": true,
}
```
