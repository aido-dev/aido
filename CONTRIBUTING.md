# Contributing to Aido

Thanks for your interest in improving Aido! We welcome issues, PRs, and discussions.

Before you start
- Read README.md for overview and workflows.
- Do not include secrets, tokens, passwords, or private keys in issues, PRs, or examples.
- Prefer Discussions for questions and ideas.
- For security concerns, follow .github/SECURITY.md.

Dev setup
- Node.js 20+
- GitHub Actions is the primary runtime target.
- Scripts live under `.github/scripts/*`; reusable workflows under `.github/workflows/*`.

Running locally (light checks)
- Lint/format (if configured), and validate JSON:
  - Ensure JSON in `.github/scripts/**` parses.
- For logic changes, open a PR and rely on CI to run workflows in a safe sandbox.

Pull requests
- Keep scope focused; include a clear summary and test plan.
- Update docs/examples when behavior changes.
- Avoid noisy diffs (formatters, unrelated refactors).
- For configs/prompts: run `aido config-check` on a PR to surface misconfigurations.
- Add comments where intent may be unclear.

Commit style
- Use descriptive messages. Conventional Commits are welcome but not required.
- Reference issues: “Fixes #123” where applicable.

Review expectations
- We aim to provide timely, constructive feedback.
- You may be asked to split large PRs or add tests/docs.

AI usage
- You may use AI to draft code/docs, but you are responsible for correctness and licensing compliance.
- Verify AI-generated content; models can be wrong or hallucinate details.
- Do not paste sensitive information into prompts.

License
- By contributing, you agree your contributions are licensed under the project’s LICENSE.
