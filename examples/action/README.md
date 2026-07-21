# Aido as a GitHub Action (composite)

Run a single Aido command as a **step** in your own workflow, on your own
triggers. This is the [Marketplace](https://github.com/marketplace)-published
entry point.

```yaml
- uses: aido-dev/aido@v1
  with:
    command: review
    pr_number: ${{ github.event.pull_request.number }}
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

## Inputs

| Input          | Required          | Description                                                                       |
| -------------- | ----------------- | --------------------------------------------------------------------------------- |
| `command`      | yes               | `review` \| `summarize` \| `explain` \| `docs` \| `suggest` \| `test` \| `triage` |
| `pr_number`    | for PR commands   | The pull request to act on                                                        |
| `issue_number` | for `triage`      | The issue to act on                                                               |
| `node-version` | no (default `20`) | Node.js version                                                                   |

## Secrets (via `env`)

- `GITHUB_TOKEN` — required, to post comments/reviews.
- `GEMINI_API_KEY` / `CHATGPT_API_KEY` / `CLAUDE_API_KEY` — whichever provider you use.

## Examples

- [`aido-review-on-pr.yml`](aido-review-on-pr.yml) — review every PR.
- [`aido-triage-on-issue.yml`](aido-triage-on-issue.yml) — triage new issues.

## Prefer the comment-driven experience?

Use the reusable workflows / one-file install (see the repo README) for
`aido <command>` PR comments and auto-run on AI-authored PRs.
