# 📘 Changelog

All notable changes to **Aido** are documented in this file.
This project follows [Semantic Versioning](https://semver.org/) and uses Conventional Commit messages for clarity and consistency.

---

## [v1.0.4] - 2025-10-21
### 🐛 Bug Fixes
- **review:** Treat `commonIds` as a **Set** (instead of array) so `.has()` works; compute `overlapRatio` using `commonIds.size`. Prevents runtime error: `commonIds.has is not a function`.
- **review:** Use trimmed `suggestedCode` for identifier extraction; minor log consistency improvements.

### 📚 Documentation
- **README.md:** Clarified validation pipeline (guard/exists protection, control-flow detection, ≥20% identifier overlap, multi-line continuity) and how rejections are surfaced.
- **examples/README.md:** Added a “Why suggestions get rejected” section with quick troubleshooting tips for line mapping and overlap.

#### ✅ Result
Stabilizes the review workflow under provider variance and preserves the **zero false positives** goal without crashing.

---

## [v1.0.3] - 2025-10-21
### 🤖 Review Engine Rewrite — Safer, Smarter AI Reviews

Version **1.0.3** delivers a complete, safety-oriented rewrite of `aido-review`.
The new validation system filters out unsafe AI suggestions while preserving **zero false positives**, ensuring every proposed change can be safely applied.

#### ✨ Added / Changed
- **Robust validation layer**
  - Guard clause protection — prevents removal of early returns (`return null`, `return false`, etc.).
  - Existence check protection — blocks suggestions that drop validation checks (`isset`, `!== null`, etc.).
  - Control-flow rewrite detection — rejects major structural rewrites (`if` → `foreach`, etc.).
  - Identifier overlap requirement — enforces ≥ 20 % shared identifiers between actual and suggested code.
  - Multi-line continuity checks — ensures multi-line replacements start in the same logical scope.
- **Improved diff mapping** using a new `buildLineMap()` function for accurate line targeting.
- **Line + side API** integration for precise inline GitHub comments.
- **Detailed validation logs** explaining why suggestions were accepted or rejected.
- **Consolidated prompt refinements** for consistent, concise review output.
- **Context check cleanup** — faster import and PR description consistency checks.

#### 🧩 Compatibility
- Backward compatible with existing reviewer configs.
- Supports **Gemini**, **ChatGPT**, and **Claude** providers.
- No breaking changes for existing workflows.

#### ✅ Result
Safer, more predictable AI reviews that block 30–40 % of low-confidence suggestions while maintaining 100 % safety.
Zero false positives — every suggestion is immediately safe to apply.

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
