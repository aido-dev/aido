# Aido Shared Library

## Purpose

Every Aido command script depends on this shared library. It contains the common
plumbing that used to be duplicated in each script:

- `providers.js` — AI provider wrappers (ChatGPT / Gemini / Claude), a `generate()`
  dispatcher, default models, and model resolution from config.
- `github.js` — the Octokit client, repo/event parsing (PR and issue numbers,
  including synthetic dispatch events), PR context fetchers (details, files, diff,
  linked issue), and comment posting.
- `config.js` — JSON config loading with defaults and one-level deep merge.
- `text.js` — diff truncation, changed-files summaries, `{{placeholder}}` prompt
  templates, and the standard comment footer.

## Installation

Copy the contents of `scripts/` to `.github/scripts/lib/` in your repository:

```
.github/scripts/lib/providers.js
.github/scripts/lib/github.js
.github/scripts/lib/config.js
.github/scripts/lib/text.js
```

⚠️ **Required**: the command scripts resolve the library via `require('../lib/...')`,
so it must sit next to the command directories:

```
.github/scripts/
├── lib/          ← this library
├── review/
├── summarize/
├── explain/
├── docs/
├── suggest/
├── test/
└── triage/
```

## Dependencies

- `@octokit/rest` is required at load time.
- Provider SDKs (`openai`, `@anthropic-ai/sdk`) are lazy-loaded — only needed for
  the providers you actually use. Gemini is called via `fetch` (Node 20+, no SDK).
