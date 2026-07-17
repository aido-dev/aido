# Aido Remote Install (one file)

## What this is

Instead of copying Aido's workflows and scripts into your repository (~30 files),
you commit **one thin workflow** that delegates everything to Aido's reusable
workflows, pinned to a release tag:

```yaml
jobs:
  aido:
    uses: aido-dev/aido/.github/workflows/aido-dispatch.yml@v1.2.0
    with:
      aido_ref: v1.2.0
    secrets: ...
```

The pinned tag is your version: upgrading Aido is a one-line change, and your
repository never drifts out of sync with Aido's scripts.

> Requires Aido **v1.2.0 or later** (the first release with remote-install support).

## Setup

1. Copy [`aido.yml`](aido.yml) to `.github/workflows/aido.yml` in your repository.
2. Add repository secrets (_Settings → Secrets and variables → Actions_):
   - `GEMINI_API_KEY` (default provider)
   - `CHATGPT_API_KEY` and/or `CLAUDE_API_KEY` (only if you use those providers)
3. Comment `aido help` on any PR or issue.

## How it works

- Your thin workflow calls `aido-dispatch.yml` from `aido-dev/aido` at the pinned
  tag. GitHub runs it in **your repository's context** — your event, your
  `GITHUB_TOKEN`, your secrets. Aido never receives write access beyond what your
  workflow grants.
- The dispatcher parses the comment, checks the commenter is an owner/collaborator
  of **your** repo, and routes to the right command workflow.
- Each command workflow checks out `aido-dev/aido` at `aido_ref` to get the
  scripts, overlays any config files from your repository, and runs.

## Customizing commands

Add a config file in your repository using the same paths as a copy-based
install — it overrides the shipped default for that command:

```
.github/scripts/review/aido-review-config.json      (personas, provider, model)
.github/scripts/summarize/aido-summarize-config.json
.github/scripts/triage/aido-triage-config.json
...
```

You do **not** need the scripts themselves — only the config files you want to
customize. `aido config-check` validates them and knows about remote installs.

## Upgrading

Bump the tag in both places in `aido.yml` (`uses:` and `aido_ref:`), e.g.
`v1.2.0` → `v1.3.0`. Check the [releases](https://github.com/aido-dev/aido/releases)
and [CHANGELOG](https://github.com/aido-dev/aido/blob/main/CHANGELOG.md) for
breaking changes.

## Remote vs copy-based install

|                           | Remote (this)                     | Copy-based (other examples)   |
| ------------------------- | --------------------------------- | ----------------------------- |
| Files in your repo        | 1 workflow (+ optional configs)   | ~30 workflows/scripts/configs |
| Upgrades                  | Bump one tag                      | Re-copy changed files         |
| Customize configs         | ✅ config files override defaults | ✅ edit in place              |
| Customize prompts/scripts | ❌ (fork Aido and pin your fork)  | ✅ full control               |
| Version pinning           | ✅ exact release tag              | manual                        |

Choose copy-based if you want to modify Aido's scripts or prompts themselves;
choose remote for everything else.
