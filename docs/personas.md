# Persona reviews (`aido review`)

Aido runs a single **consolidated reviewer** informed by the personas you configure in
`.github/scripts/review/aido-review-config.json`.

- Top-level `reviewer` chooses provider/model (and optional context checks).
- `personas` define roles with `prompt` / `tone` / `style` / `language` to guide the review.
- **Persona house rules apply to the inline suggestions too.** Each persona's `prompt` (or `description`) text — e.g. _"this repo uses neon-http; never suggest wrapping single statements in a transaction"_ — is injected into **both** the faceted review and the inline-suggestions pass, so a suggestion won't contradict your stated constraints.
- The review **body** contains a clean summary, recommendation, faceted notes, and optional context checks.
- All code changes are delivered as **inline PR review suggestions** (with "Apply suggestion" buttons), validated for safety and actionability — not dumped in the body.

## Controls (under `reviewer`)

- `suggestions: false` — skip the inline-suggestions pass entirely (keep the faceted body, zero inline comments).
- `maxSuggestions: N` — cap the number of inline suggestions posted.
- `verifyReferences`, `checkDescriptionConsistency` — optional context checks.

**Keep it reasonable:** start with **3–5 personas** (e.g. pedagogy, architecture, security, performance, QA).

## Pre-curated packs

See [`examples/.github/review/example personas/`](../examples/.github/review/example%20personas/):

- `example-personas.json` (~50 personas)
- `great_defaults-personas.json` (balanced starter set)
- Topic packs: `web_frontend-*.json`, `cloud_and_devops-*.json`, `security-*.json`, and more.
