# 🚀 Meet AIDO
**Your AI-powered, multi-provider, multi-modal coding assistant for GitHub PRs.**

[![GitHub release](https://img.shields.io/github/v/release/aido-dev/aido?style=flat-square)](https://github.com/aido-dev/aido/releases)
![Aido Dispatch](https://github.com/aido-dev/aido/actions/workflows/aido-dispatch.yml/badge.svg)
![GitHub License](https://img.shields.io/github/license/aido-dev/aido)
[![Demo PRs](https://img.shields.io/badge/Demo%20PRs-See%20examples-6f42c1?style=flat-square)](https://github.com/aido-dev/aido/pulls)


![Supports Gemini](https://img.shields.io/badge/provider-Gemini-blue?logo=google&style=flat-square)
![Supports ChatGPT](https://img.shields.io/badge/provider-ChatGPT-10a37f?logo=openai&style=flat-square)
![Supports Claude](https://img.shields.io/badge/provider-Claude-8a2be2?style=flat-square)

Aido lets you **review, summarize, explain and improve code** by simply commenting on a PR.
It works with **Gemini, ChatGPT, and Claude**, right inside GitHub Actions.

---

## ✨ Highlights
- ⚡ On-demand PR reviews via comments (`aido review`, `aido summarize`, etc.)
- 🤖 Multi-provider support: Gemini (default), ChatGPT, Claude
- 🧩 Consolidated reviewer guided by personas (single LLM call)
- 🧷 Applyable inline PR suggestions with **robust validation** (zero false positives, no code blocks in the body)
- 🕵️ Optional context-aware checks (cross-file references, PR description consistency)
- 📦 Pre-built persona packs in `/examples/.github/review/example personas/`
- 🔧 Fully configurable prompts, tones, styles, and output formats

---

## Requirements
- **Secrets** (add under *Settings → Secrets and variables → Actions*):
  - `GEMINI_API_KEY` (required for default provider)
  - `CHATGPT_API_KEY` (if using ChatGPT)
  - `CLAUDE_API_KEY` (if using Claude)
- Uses the built-in **`GITHUB_TOKEN`** for posting comments and reviews.
- ⚠️ **Forked PRs**: repository secrets may be unavailable due to GitHub policy.

---

## 📝 Example Commands
Comment these on any PR:
- `aido review` → Multi-persona code review + digest
- `aido summarize` | `aido sum` | `aido summary` → High-level PR summary for stakeholders
- `aido explain` → Developer-focused step-by-step explanation
- `aido suggest` | `aido improve` → Safe improvement ideas
- `aido config-check` → Validate configs

---

## 🚀 Quick Start
1. Add repository secrets:
   - `GEMINI_API_KEY` (default provider)
   - `CHATGPT_API_KEY` (if using ChatGPT)
   - `CLAUDE_API_KEY` (if using Claude)
2. Commit workflows (`.github/workflows/*`) and scripts (`.github/scripts/*`).
3. Comment `aido review` on a PR.
4. (Optional) Customize configs in `aido-*-config.json`.

---

## 📚 Learn More
- [Workflows](.github/workflows/)
- [Scripts & Configs](.github/scripts/)
- [Persona Packs](/examples/.github/review/example%20personas/)

## 🆚 Summarize vs Explain
- Audience:
  - Summarize: stakeholders (product/engineering leadership)
  - Explain: developers/reviewers
- Depth:
  - Summarize: high-level intent, scope, risks, impact; no implementation details
  - Explain: step-by-step mechanics, rationale, risks, verification
- Content constraints:
  - Summarize: no code blocks, diffs, or inline suggestions; concise and skimmable
  - Explain: may include tiny illustrative snippets only if essential; avoid suggestions and large blocks

---

## ❤️ Why Aido?
Aido makes **AI-powered PR reviews** practical, configurable, and team-friendly.
Save time, catch issues early, and improve code quality — without leaving GitHub.

---

## How It Works
- **Dispatcher:** `.github/workflows/aido-dispatch.yml`
  Parses the first line of the comment, normalizes it, and routes to the right reusable workflow.
- **Reusable workflows (invoked via `workflow_call`):**
  - `.github/workflows/aido-review.yml`
  - `.github/workflows/aido-summarize.yml`
  - `.github/workflows/aido-explain.yml`
  - `.github/workflows/aido-suggest.yml`

Each workflow builds a prompt from PR context (title, body, changed files, **truncated diff ~15k chars**), calls the selected provider/model, and **posts a PR review with inline, applyable suggestions (when applicable), validated by a robust layer to ensure safety and accuracy**.

---

## Scripts & Configs
- **Review:**
   - Script: `.github/scripts/review/aido-review.js`
   - Config: `.github/scripts/review/aido-review-config.json` *(object with `{ reviewer, personas }`; reviewer sets provider/model; personas guide facets)*
- **Summarize (stakeholder-facing; aliases: `summarize` | `sum` | `summary`):**
   - Script: `.github/scripts/summarize/aido-summarize.js`
   - Config: `.github/scripts/summarize/aido-summarize-config.json`
- **Explain (developer-focused):**
   - Script: `.github/scripts/explain/aido-explain.js`
   - Config: `.github/scripts/explain/aido-explain-config.json`
- **Suggest:**
   - Script: `.github/scripts/suggest/aido-suggest.js`
   - Config: `.github/scripts/suggest/aido-suggest-config.json`

> Each config supports: `provider` (CHATGPT|GEMINI|CLAUDE), `model`, `language`, `tone`, `style`, `length`, `include` (title/body/filesSummary/diff), `additionalInstructions`, and an optional `promptTemplate` with placeholders.

---

## Persona Reviews (Aido Review)
- Use a single **consolidated reviewer** informed by your configured personas in `aido-review-config.json`.
  - Top-level `reviewer` chooses provider/model (and optional context checks).
  - `personas` define roles with prompt/tone/style/language to guide faceted notes.
- The review body contains a clean summary, recommendation, faceted notes, and optional context checks.
- All code changes are delivered as **inline PR review suggestions** (with “Apply suggestion” buttons), thoroughly validated for safety and actionability — not in the body.
- **Keep it reasonable:** start with **3–5 personas** (e.g., pedagogy, architecture, security, performance, QA).

**Pre-curated packs:** see `/examples/.github/review/example personas/`
- `example-personas.json` (~50 personas)
- `great_defaults-personas.json` (balanced starter set)
- Topic packs: `web_frontend-*.json`, `cloud_and_devops-*.json`, `security-*.json`, and more.

---

## Tips
- Prefer **short, focused** prompts and configs.
- Use `aido config-check` if things look off.
- For UI work, pair `aido explain` with `aido suggest`.
- For releases, run `aido summarize`.

---

## Caveats
- Diff is truncated (~15k chars) to keep prompts efficient.
- Provider/model availability and naming can change; set explicit models in configs.
- Forked PRs may lack secrets → provider calls may be skipped.

---

## 🔖 Topics
`github-actions` · `ai-code-review` · `ai-assistant` · `developer-productivity` · `persona-based-reviews` · `openai` · `gemini` · `claude` · `chatgpt` · `pr-bot` · `automated-code-review`

---

Happy shipping! ✨

---

> [!Note]
>
> Data handling:
> - Prompts, code, and metadata may be sent to external AI services and could be logged or retained by those providers.
> - Do not include secrets, confidential, or regulated data unless you fully trust the operator and provider.
>
> Reliability:
> - Providers can rate‑limit, change models/behavior, or go offline without notice.
> - Do not depend on AI outputs for production without human review and validation.
>
> Accuracy:
> - AI models can be incorrect, outdated, or hallucinate details.
> - Always verify explanations, reviews, and code suggestions before applying.
