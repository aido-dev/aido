# AIDO Review — Consolidated Reviewer

Single, high-quality PR review powered by one LLM call, guided by multiple personas. The review body stays clean (summary + persona notes + optional checks). All code edits are posted as inline, applyable suggestions.

---

## What you get

- One consolidated reviewer call (faster, cheaper, consistent)
- Inline “Apply suggestion” patches on exact lines in the PR
- Clean review body with:
  - Short summary
  - Recommendation (approve / approve with minor changes / request changes)
  - Faceted notes (driven by your personas)
  - Optional context-aware checks

---

## Configuration

Config file: `.github/scripts/review/aido-review-config.json`

- `reviewer`: sets the single provider/model used for the entire review
- `personas`: a small set of roles that shape the review’s faceted notes
- Optional flags:
  - `verifyReferences`: check imports/paths/functions referenced across files
  - `checkDescriptionConsistency`: compare PR description claims vs. actual changes

Minimal example:

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

Tips:
- Start with 3–5 personas (e.g., pedagogy, architecture, security, performance, QA)
- Keep prompts concise and focused

---

## What gets posted

- Review body (comment):
  - 2–3 sentence summary of the PR
  - Recommendation
  - Persona-based notes (grouped)
  - “Context checks” section if enabled

- Inline review comments (applyable):
  - GitHub suggestion blocks with exact replacements
  - Correct file paths and new-file line positions (per PR diff)

Note: The body does not include code change blocks; all patches are in inline comments.

---

## Optional context-aware checks

- Reference verification
  - JS/TS: checks relative imports/require targets (e.g., `./x`, `./x.ts`, `./x/index.js`) exist
  - Python: checks `import` / `from ... import ...` modules and referenced functions exist
- PR description consistency
  - Flags version bumps or endpoint changes claimed in the description but not reflected (or mismatched) in the diff

Findings appear under “Context checks” in the review body.

---

## Usage

- Trigger by commenting `aido review` on a PR
- Ensure your workflow grants `pull-requests: write` to post inline suggestions
- Add provider secrets as needed (e.g., `GEMINI_API_KEY`, `CHATGPT_API_KEY`, `CLAUDE_API_KEY`)

---

## Best practices

- Use new-file line numbers from the PR diff for suggestions
- Keep each suggestion minimal and precisely scoped
- Prefer a small, high-signal persona set over many overlapping personas
- Make prompts specific to the concerns you want surfaced (security, performance, etc.)

That’s it—set `reviewer`, add a few focused `personas`, and run `aido review` on your PR.
