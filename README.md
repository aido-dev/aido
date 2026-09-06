# 🚀 Meet AIDO

**The AI companion for the pull requests your AI writes.**

[![GitHub release](https://img.shields.io/github/v/release/aido-dev/aido?style=flat-square)](https://github.com/aido-dev/aido/releases)
[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Aido%20AI%20PR%20Companion-6f42c1?logo=github&style=flat-square)](https://github.com/marketplace/actions/aido-ai-pr-companion)
![Unit Tests](https://github.com/aido-dev/aido/actions/workflows/unit-tests.yml/badge.svg)
![GitHub License](https://img.shields.io/github/license/aido-dev/aido)
[![Demo PRs](https://img.shields.io/badge/Demo%20PRs-See%20it%20live-6f42c1?style=flat-square)](#-see-it-live-no-install)

![Supports Gemini](https://img.shields.io/badge/provider-Gemini-blue?logo=google&style=flat-square)
![Supports ChatGPT](https://img.shields.io/badge/provider-ChatGPT-10a37f?logo=openai&style=flat-square)
![Supports Claude](https://img.shields.io/badge/provider-Claude-8a2be2?style=flat-square)
[![+ any OpenAI-compatible](https://img.shields.io/badge/%2B_any_OpenAI--compatible-Mistral_%C2%B7_DeepSeek_%C2%B7_Kimi_%C2%B7_Grok_%C2%B7_OpenRouter-555?style=flat-square)](docs/configuration.md#bring-any-model-openai-compatible)

AI agents — Copilot, Claude Code, Cursor — are opening more and more pull requests, and a human still has to understand code they didn't write. Aido keeps that human in the loop: when an **AI-authored PR** lands, it can **automatically explain, summarize, review, and document** the change. And you can run those same commands on **any PR or issue on demand** — just comment `aido <command>`.

Vibe-code all you want — with reviewers who actually care about the code. One companion for the whole review lifecycle (**review, summarize, explain, document, test, triage**), with **Gemini, ChatGPT, Claude, or any OpenAI-compatible model** (Mistral, DeepSeek, …), right inside GitHub Actions. **Bring your own key; no third-party data processor.**

<p align="center">
  <img src="docs/media/aido-demo.gif" alt="Aido reviewing a pull request, live in GitHub" width="820">
</p>

---

## ⏱️ 60-second start

1. Add a `GEMINI_API_KEY` repo secret ([free key](https://aistudio.google.com/apikey) — _Settings → Secrets and variables → Actions_).
2. Copy [`examples/remote/aido.yml`](examples/remote/aido.yml) → `.github/workflows/aido.yml` (one file).
3. Comment `aido review` on any PR.

That's it — Aido replies right in the PR. → **[Full install options](docs/installation.md)** (copy-based, GitHub Action step, other providers).

---

## 👀 See it live (no install)

Real Aido comments on demo PRs — click any command to see the full, rendered output:

| Command          | What it does                                                | Live demo                                          |
| ---------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| `aido review`    | Multi-persona review + digest, inline applyable suggestions | [PR #64](https://github.com/aido-dev/aido/pull/64) |
| `aido suggest`   | Concrete improvements & small refactors                     | [PR #65](https://github.com/aido-dev/aido/pull/65) |
| `aido test`      | Test plan, coverage gaps, follow-ups                        | [PR #66](https://github.com/aido-dev/aido/pull/66) |
| `aido explain`   | Developer-focused step-by-step walkthrough                  | [PR #67](https://github.com/aido-dev/aido/pull/67) |
| `aido summarize` | High-level summary for stakeholders                         | [PR #68](https://github.com/aido-dev/aido/pull/68) |
| `aido docs`      | Draft/augment documentation                                 | [PR #69](https://github.com/aido-dev/aido/pull/69) |

> 🔬 **One PR, three models:** [**PR #106**](https://github.com/aido-dev/aido/pull/106) reviews the **same diff with Claude, ChatGPT, and Gemini** side by side — same personas, different provider. A concrete look at what "bring your own model" buys you: each catches the core bugs, but they differ on depth and which second-order issues they flag.

<details>
<summary><b>Sample: <code>aido review</code> catching real bugs</b> (from PR #64)</summary>

> This PR introduces several common Python anti-patterns and security vulnerabilities, including a mutable default argument, SQL injection, and a bare `except` clause.
>
> **Recommendation:** Request changes
>
> **Faceted Notes:**
>
> - **Security:** Critical SQL injection vulnerability; bare `except` masks errors.
> - **Correctness:** Mutable default argument leads to unexpected state; missing input validation.
> - **Maintainability:** "Magic numbers" reduce readability.
> - **QA/Testing:** Bare `except` swallows all errors, making failure modes hard to test.

Code fixes arrive as **inline "Apply suggestion" buttons** on the diff — not dumped in the comment body.

</details>

---

## ✨ What you get

- 🤖 **Auto-companion for AI-authored PRs** — when Copilot / Claude Code / Cursor open a PR, Aido runs automatically (explain + summarize by default; review/docs/test opt-in). → [details](docs/auto-and-digest.md)
- ⚡ **On-demand on any PR or issue** — `review`, `summarize`, `explain`, `docs`, `suggest`, `test`, `triage`. → [command reference](docs/commands.md)
- 🧩 **Persona-guided reviewer** with applyable inline suggestions (robust validation). → [personas](docs/personas.md)
- 🔌 **Multi-provider, bring-your-own-key** — Gemini, ChatGPT, Claude, or any OpenAI-compatible endpoint (Mistral, DeepSeek, Kimi, Grok, …). No third-party data processor. → [providers](docs/configuration.md#bring-any-model-openai-compatible)
- 🗓️ **Weekly "what shipped" digest** — a scheduled summary of merged PRs, posted as an Issue or Discussion. → [details](docs/auto-and-digest.md#weekly-what-shipped-digest)
- 📦 **One-file install** from a pinned release tag; upgrading is a one-line bump.

## ❤️ Why Aido?

As more of your PRs are written by AI, Aido makes sure a human still understands them — automatically, and on demand. Open-source, configurable, and team-friendly: catch issues early and keep everyone in the loop, **without leaving GitHub and without sending your code to a third-party processor**.

Several providers have **free tiers**, so you can run it for free on GitHub Actions minutes with your own key. → [Free to run](docs/installation.md#free-to-run)

---

## 📚 Documentation

- **[Installation](docs/installation.md)** — requirements, remote/copy install, GitHub Action step, free providers
- **[Commands](docs/commands.md)** — full command list, summarize-vs-explain, tips
- **[Configuration](docs/configuration.md)** — config keys, per-command configs, diff size, bring-any-model
- **[Persona reviews](docs/personas.md)** — how the reviewer works, controls, persona packs
- **[Auto-run & digest](docs/auto-and-digest.md)** — auto-run on AI PRs, the weekly digest
- **[Architecture](docs/architecture.md)** — how it works, data handling, reliability
- **[Security](SECURITY.md)** — reporting + adopter security posture

---

Happy shipping! ✨

> [!Note]
> AI can be incorrect, rate-limited, or change without notice, and prompts/code may be sent to external providers. Always verify reviews and suggestions, keep a human in the loop, and never wire Aido's output to auto-merge. See [Architecture → data handling](docs/architecture.md#data-handling--reliability) and [SECURITY.md](SECURITY.md).
