# 📘 Changelog

All notable changes to **Aido** are documented in this file.
This project follows [Semantic Versioning](https://semver.org/) and uses Conventional Commit messages for clarity and consistency.

---

## [v1.0.2] - 2025-10-15
### 🛠 Suggest Improvements

Enhanced **Aido Suggest** with detailed output formatting and per-file prompting.

#### ✨ Added / Changed
- Introduced **structured Replace/With code blocks** for clearer, contract-compliant suggestions.
- Refactored per-file prompt generation to improve readability and consistency.
- Improved **prompt clarity**, **code-fence sanitization**, and **error handling**.
- Increased output reliability across AI providers.

#### ✅ Result
Suggestions are now easier to read, safer to apply manually, and more reliable in long PRs.
_No breaking changes. Fully compatible with v1.x._

---

## [v1.0.1] - 2025-10-13
### 🛠 Suggest Improvements

Refined **Aido Suggest** to generate clearer, per-file, human-readable suggestions designed for manual review.

#### ✨ Added / Changed
- Per-file prompt generation for targeted AI context.
- Strict output contract enforcement and code fence sanitization.
- Reformatting fallback for provider compliance.
- Reduced diff truncation threshold for efficiency.
- Improved per-file error handling and suggestion aggregation.

#### ✅ Result
Suggestions are now more consistent across files and better aligned with GitHub’s comment formatting.
_No breaking changes. Fully compatible with v1.x._

---

## [v1.0.0] - 2025-10-11
### 🚀 First Public Release

**Aido** — your AI-powered, multi-provider coding assistant for GitHub pull requests.
Review, summarize, explain, and improve code simply by commenting on a PR — powered by **Gemini**, **ChatGPT**, and **Claude**.

#### ✨ Added
- On-demand PR reviews (`aido review`, `aido summarize`, `aido explain`, `aido suggest`)
- Multi-provider support: **Gemini**, **ChatGPT**, **Claude**
- Persona-based, multi-faceted reviews with configurable tones and prompts
- Inline “Apply suggestion” support for direct PR improvements
- Optional context-aware checks (cross-file and PR description consistency)
- Fully configurable workflows, prompts, and output formats

#### ❤️ Why It Matters
Aido makes AI-assisted PR reviews **practical, configurable, and team-friendly** — saving time, catching issues early, and improving code quality without leaving GitHub.

---
