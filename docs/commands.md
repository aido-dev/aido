# Commands

Comment any of these on a **pull request**:

| Command             | Aliases              | What it does                                                          |
| ------------------- | -------------------- | --------------------------------------------------------------------- |
| `aido review`       |                      | Multi-persona code review + digest, with inline applyable suggestions |
| `aido summarize`    | `sum`, `summary`     | High-level PR summary for stakeholders                                |
| `aido explain`      |                      | Developer-focused, step-by-step walkthrough                           |
| `aido docs`         |                      | Draft/augment documentation                                           |
| `aido suggest`      | `improve`            | Concrete improvement ideas & small, safe refactors                    |
| `aido test`         |                      | Structured test plan, coverage gaps, follow-up tasks                  |
| `aido config-check` | `check-config`, `cc` | Validate Aido config files                                            |
| `aido help`         |                      | Show the command list                                                 |

Comment on an **issue**:

| Command       | What it does                                                        |
| ------------- | ------------------------------------------------------------------- |
| `aido triage` | Classify, suggest labels, find similar issues, recommend next steps |

Only repository **owners/collaborators** can trigger commands.

## Summarize vs Explain

They look similar but serve different readers:

|              | `summarize`                                                        | `explain`                                                           |
| ------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| **Audience** | Stakeholders (product / eng leadership)                            | Developers / reviewers                                              |
| **Depth**    | High-level intent, scope, risks, impact — no implementation detail | Step-by-step mechanics, rationale, risks, verification              |
| **Content**  | No code/diffs/suggestions; concise & skimmable                     | May include tiny essential snippets; no large blocks or suggestions |

## Tips

- Prefer **short, focused** prompts and configs.
- Use `aido config-check` if something looks off.
- For UI work, pair `aido explain` with `aido suggest`.
- For releases, run `aido summarize` → `aido docs`.
- Before merging, run `aido test` to surface missing test cases and coverage gaps.
- For new issues, run `aido triage` for a quick classification, label suggestions, and similar-issue links.

See also: [Persona reviews](personas.md) · [Configuration](configuration.md) · [Auto-run & digest](auto-and-digest.md).
