# Aido Example Personas & Packs

## Purpose
This library provides **ready-to-use persona configurations** for the Aido Review workflow.
Personas represent different reviewer roles (e.g. security expert, performance reviewer, product owner).
Each persona has its own **prompt, tone, and style** to guide the consolidated reviewer’s facets.
Per‑persona provider/model are ignored in consolidated mode; set provider/model once in the top‑level `reviewer` block.

The goal is to help teams get **richer feedback** by combining perspectives, while keeping configurations consistent and easy to manage.

---

## Files

- `example-personas.json` – the full library of ~50 personas.
- Pack files:
  - `great_defaults-personas.json` – a slim, balanced set of 8–10 useful defaults.
  - `web_frontend-personas.json` – frontend/UI specialists.
  - `cloud_and_devops-personas.json` – infra, DevOps, cloud services.
  - `security-personas.json` – security-focused reviewers.
  - `database_and_data_engineering-personas.json` – DBAs, ETL, streaming, analytics.
  - `performance_and_efficiency-personas.json` – runtime, async, memory, networking.
  - `quality_and_best_practices-personas.json` – testing, style, release hygiene.
  - `backend_and_systems-personas.json` – backend frameworks and systems programming.
  - `mobile_and_client_apps-personas.json` – mobile apps, UI/UX, accessibility.
  - `packaging_and_delivery-personas.json` – packaging, CLI/UX, monorepo, feature flags.

---

## How to Use

1. **Select a pack**
   Pick the persona pack that matches your review context. For general usage, start with `great_defaults`.

2. **Reference it in your config**
   Copy the persona objects into `.github/scripts/review/aido-review-config.json`
   or merge them with your existing config.

3. **Run the review**
   Comment `aido review` on a PR.
   The Aido workflow loads your personas and runs a single consolidated review (one LLM call) guided by those roles. Applyable code changes are posted as inline PR review suggestions only.

4. **Keep it reasonable**
   - **Use 3–5 personas.**
     Too many personas at once can produce noise, higher cost, and long runtimes.
   - Select personas based on the PR:
     - Security-sensitive change? Include `security expert` and `auth/OAuth/OIDC specialist`.
     - Big schema change? Add `SQL performance analyst` or `GraphQL schema reviewer`.
     - UI update? Bring in `UI/UX designer` and `accessibility reviewer`.

---

## Packs Overview

### 🎯 Great Defaults
A balanced mix for everyday PRs:
- pedagogical colleague
- architecture nerd
- security expert
- performance reviewer
- qa/test specialist
- documentation nerd
- DevOps/SRE reviewer
- product owner
- frontend reviewer (React)
- backend reviewer (Node/Express)

### 🎨 Web Frontend
Frontend/UI-focused reviewers:
- React, Vue, Angular reviewers
- UI/UX designer
- accessibility (a11y) reviewer

### ☁️ Cloud & DevOps
Infrastructure, CI/CD, and cloud specialists:
- DevOps/SRE
- Kubernetes, Dockerfile, Terraform reviewers
- GitHub Actions specialist
- AWS, GCP, Azure solution reviewers
- serverless architect

### 🔒 Security
Security-first reviewers:
- security expert
- OAuth/OIDC specialist
- cryptography reviewer
- OWASP Top 10
- GDPR/privacy
- supply chain
- secrets & configs

### 🗄️ Database & Data Engineering
Data systems and pipelines:
- PostgreSQL SQL analyst
- MongoDB/NoSQL reviewer
- Redis reviewer
- Kafka/streaming systems
- data engineer
- analytics & event taxonomy

### ⚡ Performance & Efficiency
Efficiency specialists:
- runtime performance
- web vitals
- memory/leaks
- concurrency & async
- networking & HTTP
- edge & CDN strategist

### ✅ Quality & Best Practices
Testing, QA, and hygiene:
- qa/test specialist
- testing strategist
- E2E reviewer (Playwright/Cypress)
- style guide enforcer
- release engineer
- configuration & feature flags
- logging & auditability

### 💻 Backend & Systems
Backend frameworks and systems:
- Java/Spring
- C#/.NET
- PHP/Laravel
- Go
- Rust
- C/C++

### 📱 Mobile & Client Apps
Mobile and UX:
- Android/Kotlin
- iOS/Swift
- UI/UX designer
- accessibility reviewer
- localization QA (Swedish)

### 📦 Packaging & Delivery
Delivery and packaging:
- package maintainer (npm/pypi)
- CLI/UX reviewer
- monorepo & dependency hygiene
- feature toggles & experimentation

---

## Notes

- Personas are **configurable JSON objects** — you can edit prompts, tone, or models to suit your needs.
- Packs are just **pre-curated groups** to save time.
- Consider creating your own custom packs based on your team’s domain (e.g. “AI/ML”, “IoT”, “FinTech”).
- This library is meant as a starting point. Keep iterating!
