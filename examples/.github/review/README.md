# Aido Review — Consolidated Reviewer

Single, high-quality PR review powered by one LLM call, guided by multiple personas. The review body stays clean (summary + persona notes + optional checks). All code edits are posted as inline, applyable suggestions with **robust validation** to ensure safety.

---

## What you get

- **One consolidated reviewer call** (faster, cheaper, consistent)
- **Inline "Apply suggestion" patches** on exact lines in the PR with one-click commit buttons
- **Robust validation layer** that blocks destructive changes:
  - Guards against removal of early returns and validation checks
  - Detects wrong line targeting (common AI error)
  - Prevents complete control flow rewrites
  - Requires 20%+ code overlap for suggestions
  - **Zero false positives** — only safe, actionable suggestions are posted
- **Clean review body** with:
  - Short summary (≤200 words)
  - Recommendation (approve / approve with minor changes / request changes)
  - Faceted notes (driven by your personas)
  - Optional context-aware checks

---

## Configuration

Config file: `.github/scripts/review/aido-review-config.json`

- `reviewer`: sets the single provider/model used for the entire review
- `personas`: a small set of roles that shape the review's faceted notes
- Optional flags:
  - `verifyReferences`: check imports/paths/functions referenced across files
  - `checkDescriptionConsistency`: compare PR description claims vs. actual changes

Minimal example:
```
    {
      "reviewer": {
        "provider": "GEMINI",
        "model": "gemini-2.5-flash",
        "verifyReferences": true,
        "checkDescriptionConsistency": true
      },
      "personas": [
        {
          "persona": "pedagogical colleague",
          "language": "English",
          "tone": "friendly, helpful, pedagogical",
          "length": "minimal",
          "style": "bullet-points",
          "prompt": "Be constructive and clear. Explain trade-offs and suggest safer patterns.\n\nIssue: {{issueTitle}}\n{{issueBody}}\n\nPR: {{prTitle}}\n{{prBody}}\n\nDiff:\n{{diff}}"
        },
        {
          "persona": "security expert",
          "language": "English",
          "tone": "professional, security-focused",
          "length": "short",
          "style": "bullet-points",
          "prompt": "Look for insecure patterns, missing validation, secrets exposure, and auth/ACL issues.\n\nIssue: {{issueTitle}}\n{{issueBody}}\n\nPR: {{prTitle}}\n{{prBody}}\n\nDiff:\n{{diff}}"
        }
      ]
    }
```

### Tips:
- Start with 3–5 personas (e.g., pedagogy, architecture, security, performance, QA)
- Keep prompts concise and focused
- AI models supported: Gemini, Claude, ChatGPT (configurable via config).

---

## What gets posted

### Review body (comment):
- 2–3 sentence summary of the PR
- Recommendation (approve/approve with minor changes/request changes)
- Persona-based notes (grouped by concern: Security, Performance, Architecture, etc.)
- "Context checks" section if enabled
- Validation statistics (e.g., "Validated 2 of 12 suggestions")

### Inline review comments (applyable):
- **GitHub suggestion blocks** with exact, safe replacements
- **Priority indicators**: 🔴 Urgent · 🟠 High · 🟡 Medium · 🟢 Low
- **One-click "Commit suggestion" buttons** for immediate application
- Correct file paths and new-file line numbers (per PR diff)
- **Multi-line suggestions** supported with proper start/end line ranges

**Note:** The body does not include code change blocks; all patches are in inline comments with validation applied.

---

## Validation safeguards

The script automatically validates all AI suggestions before posting to prevent destructive changes:

### What gets blocked:
- ❌ **Guard clause removal** — Prevents removal of early returns (`return false`, `return null`)
- ❌ **Validation check removal** — Protects existence checks (`isset()`, `!== null`, `=== undefined`)
- ❌ **Control flow rewrites** — Blocks major structural changes (e.g., replacing `if` with `foreach`)
- ❌ **Wrong line targeting** — Catches AI line-counting errors (requires ≥20% identifier overlap)
- ❌ **Multi-line mismatches** — Ensures suggestions contextually match the actual code

### Performance:
- **Blocks ~30-40%** of AI-generated suggestions (mostly wrong line numbers)
- **Zero false positives** — All posted suggestions are safe and actionable
- **Typical output:** 2-3 high-quality suggestions per PR (from 10-12 AI attempts)

### Example blocked suggestion:
```php
// AI tried to remove this critical check:
if (!isset($this->users[$username])) {
    return false;
}
// ✅ Validation blocked: "Removes existence/validation check"
```

---

## Optional context-aware checks

### Reference verification
- **JS/TS:** checks relative imports/require targets (e.g., `./x`, `./x.ts`, `./x/index.js`) exist
- **Python:** checks `import` / `from ... import ...` modules and referenced functions exist

### PR description consistency
- Flags version bumps or endpoint changes claimed in the description but not reflected (or mismatched) in the diff

Findings appear under **"Context checks"** in the review body.

---

## Usage

- Trigger by commenting `aido review` on a PR
- Ensure your workflow grants `pull-requests: write` to post inline suggestions
- Add provider secrets as needed (e.g., `GEMINI_API_KEY`, `CHATGPT_API_KEY`, `CLAUDE_API_KEY`)

---

## Best practices

### For optimal results:
- ✅ Use **new-file line numbers** from the PR diff for suggestions
- ✅ Keep each suggestion **minimal and precisely scoped**
- ✅ Prefer a **small, high-signal persona set** over many overlapping personas
- ✅ Make prompts **specific** to the concerns you want surfaced (security, performance, etc.)
- ✅ Trust the validation — it blocks ~30-40% of suggestions for safety
- ✅ Review logs to understand what was blocked and why

### Understanding validation output:
```
Parsed 12 initial suggestions
❌ Skipping demo/demo.php:75-83 - Removes existence/validation check
✅ Valid: demo/demo.php:16-16 - Removes unused parameter
Validated 2 of 12 suggestions
```

---

## Troubleshooting

### Low suggestion count?
- **Expected:** 2-3 suggestions per PR is normal with validation enabled
- **Cause:** AI often targets wrong line numbers (~60-70% of attempts)
- **Solution:** Review logs to see what was blocked; validation is working as designed

### No suggestions posted?
- **Check logs:** Look for validation failure reasons
- **Verify:** Line numbers in suggestions match actual diff lines
- **Consider:** AI may not have found any safe, actionable improvements

### Suggestions on wrong lines?
- **Should not happen:** Validation blocks wrong-line suggestions
- **If it does:** Please report as a bug — validation may need tuning

---

## Technical details

### How it works:
1. **Fetch PR context:** Title, description, linked issues, full diff
2. **Generate review:** Single LLM call with consolidated persona prompts
3. **Extract suggestions:** Parse AI output for inline code changes
4. **Validate suggestions:** Run 5-layer validation (guards, checks, overlap, etc.)
5. **Post review:** GitHub review with body + validated inline suggestions

### Validation layers:
1. Guard clause protection
2. Existence check protection
3. Control flow rewrite detection
4. Identifier overlap requirement (≥20%)
5. Multi-line continuity check

### Supported languages:
- Full validation: PHP, JavaScript, TypeScript, Python
- Basic validation: All languages (identifier overlap checks)

---

That's it — set `reviewer`, add a few focused `personas`, configure your secrets, and run **aido review** on your PR. The validation layer ensures you only get safe, actionable suggestions! 🛡️

---

## Shared Library Requirement

The script requires Aido's shared library at `.github/scripts/lib/` (providers, GitHub helpers, config loading, text utilities). Copy it from [`examples/.github/lib/`](../lib/) — the command will fail to start without it.
