# Agentic Clinic (Terra)

Academic prototype of an AI-assisted clinic app. Fictional and synthetic data only. No diagnosis, prescribing, emergency care or healthcare-compliance claim.

## What this project is

- The visual reference is the Terra design: a standalone HTML, CSS and JavaScript mockup in the repo root (`index.html`, `styles.css`, `app.js`). It uses fake client-side data.
- The target is a presentable MVP with five visible outcomes:
  1. A polished Terra-style clinic dashboard.
  2. Doctor listing, plus appointment booking, rescheduling and cancellation.
  3. A simple assistant that answers clinic and appointment questions.
  4. An Insights page with synthetic metrics and a "Demo forecast" for seven days.
  5. A deployed backend on Railway with persistent demo data.
- MVP architecture: Next.js frontend, FastAPI backend, PostgreSQL. Deployment target for backend and database is Railway. The assistant later calls a Cloudflare Worker (Workers AI).
- Deferred: Chronos, OCI, Azure Foundry, production OAuth, document upload, RAG, clinical workflows, real patient data.
- The long-term design is in `Architecture-and-development-plan.md`. Where it conflicts with the MVP scope above, the MVP scope wins (see `docs/decisions.md`).

## Current stop points (user instruction, 2026-11-21)

- Build everything locally. Do NOT deploy to Railway. Do NOT create or deploy a Cloudflare Worker. The user switches accounts first.
- The assistant uses a local rule-based provider behind an interface. The Cloudflare provider comes later.
- Every step is recorded in `PROJECT-DOCUMENTATION.txt` (repo root).

## Folder map

Note: the root folder name ends with a space: `Terra Clinic `. Quote every path.

```text
Terra Clinic /                           git repo root
  CLAUDE.md                              this file
  PROJECT-DOCUMENTATION.txt              step-by-step build log
  docs/                                  progress.md, decisions.md, known-issues.md
  .claude/agents/                        builder.md, reviewer.md (Haiku workers)
  .claude/skills/reflect/SKILL.md        end-of-session retrospective
  index.html, styles.css, app.js         Terra static prototype (visual reference only)
  README.md                              Terra download and setup guide
  Architecture-and-development-plan.md   long-term plan (OCI, Chronos, RAG)
  docker-compose.yml                     local PostgreSQL 16
  backend/                               FastAPI, SQLAlchemy, pytest
  frontend/                              Next.js, React, Tailwind, Three.js
  Data-Science-Project/                  separate git repo, ignored by the root repo
```

Update this map when folders are added.

## Operating rules

### Role separation
- The main session is the orchestrator. It plans, writes briefs, delegates and verifies.
- Never do bulk implementation or bulk file reading yourself when a Haiku worker can do it.
- Do the work yourself only when a brief costs more than the work, or when it needs judgment (design, security, final verification).

### Worker briefs
- Every worker runs on `haiku`.
- Every brief states: (a) the goal, (b) the exact files to read and modify, (c) a concrete `Done when:` check that can be run or inspected.
- A brief without a `Done when:` line is not sent.

### Verification gate
- Before accepting a worker's output, run its `Done when:` check yourself.
- If it fails, send the exact failure output back to the worker.
- Never pass on a worker's report unchecked.
- After two failed rounds on one check, take the task over and log the cause in `docs/known-issues.md`.

### Session lifecycle
- Start of every session: read `CLAUDE.md`, `docs/progress.md`, `docs/decisions.md`, `docs/known-issues.md`.
- End of every session: update `docs/progress.md`, log decisions and gotchas, append to `PROJECT-DOCUMENTATION.txt`, then run the `reflect` skill. Wait for the user's approval before applying skill or `CLAUDE.md` edits.

### Working style
- Replies: caveman skill. Plain full sentences for anything saved to a file, commit, PR or message for another person.
- Code: ponytail skill, full level. Smallest change that fully solves the task. State what was skipped or not checked.
- `tdd-pentest` is off for this project. New non-trivial logic still gets at least one test.
- Advisor: Opus 5.5 (`claude-opus-5-5`), consulted before committing to an approach and before declaring done.
- Use the question dialog for choices that belong to the user. Assume nothing.

### Standing limits
- Never print or commit secrets. Never commit `.env`. Keep `.env.example` placeholders only.
- Local commits only. Push, PR or any GitHub write needs an explicit ask each time.
- No Claude attribution in commits or PRs: no `Co-Authored-By` trailer, no "Generated with Claude Code" footer.
- Phases: stop, explain, user tests at phase end. Mid-phase run targeted tests only. Full suites once per phase end, with real counts.

## MVP phases

1. Foundation  2. Synthetic clinic backend  3. Appointment flow  4. Demo authentication
5. Assistant MVP (local provider only for now)  6. Insights MVP  7. Railway deployment (NOT YET)  8. Demo verification

Status lives in `docs/progress.md`.
