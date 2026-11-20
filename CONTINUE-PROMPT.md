# Continue Agentic Clinic (Terra): resume prompt

Paste this whole file into a new Claude Code session opened in the repo root. It tells the session what the project is, the rules to follow, what is finished, and what to do next.

Written for: a Claude Code session (or a developer) continuing this build from where it stopped.

---

## 1. Your job

Continue building the Agentic Clinic (Terra) MVP from the state described in section 5. Do not restart. Do not redo finished work. Everything runs locally until the owner says otherwise.

Before doing anything, read these files in order: `CLAUDE.md`, `docs/progress.md`, `docs/decisions.md`, `docs/known-issues.md`, `docs/api-contract.md`, `PROJECT-DOCUMENTATION.txt`.

## 2. What the project is

An academic prototype of an AI-assisted clinic app. Fictional and synthetic data only. No diagnosis, prescribing, emergency care or healthcare-compliance claim.

Five visible outcomes:
1. A polished Terra-style clinic dashboard.
2. Doctor listing, plus appointment booking, rescheduling and cancellation.
3. A simple assistant that answers clinic and appointment questions.
4. An Insights page with synthetic metrics and a "Demo forecast" for seven days.
5. A deployed backend on Railway with persistent demo data.

Architecture: Next.js frontend, FastAPI backend, PostgreSQL. Later, the backend calls a Cloudflare Worker that calls a Workers AI text model.

Decisions already taken (see `docs/decisions.md`): Railway PostgreSQL, demo sessions instead of OAuth, deterministic "Demo forecast" instead of Chronos, Cloudflare Workers AI for the assistant only, frontend built locally first. Deferred for good: Chronos, OCI, Azure Foundry, production OAuth, document upload, RAG, clinical workflows, real patient data.

## 3. Stop points (do not cross without the owner's say-so)

- Do NOT deploy to Railway. The owner switches accounts first.
- Do NOT create or deploy a Cloudflare Worker. Until then the assistant uses the local rule-based provider in `backend/app/services/assistant_provider.py`. The Cloudflare provider is one new class behind `get_provider()` in `backend/app/services/assistant.py`.
- Local commits are fine. Push, PR or any GitHub write needs an explicit ask from the owner each time.
- Record every step in `PROJECT-DOCUMENTATION.txt`.

## 4. Rules to follow (same as the previous sessions)

**How to reply (caveman skill).** Answer first, no filler, no greeting or recap. Keep every fact, command, path, number and error exact. Use plain full sentences for explanations, for questions to the owner, and for anything saved outside chat (code comments, commits, docs, PR text). Anything drafted for another person starts with one line naming the audience.

**How to code (ponytail skill, full level).** Smallest change that fully solves the task. Reuse what exists. Add nothing nobody asked for. End each task by saying what was skipped or not checked. New non-trivial logic (a branch, a loop, a parser, money or security) gets at least one test. The `tdd-pentest` skill is OFF for this project unless the owner turns it on.

**Orchestrator and workers.**
- The main session (Opus) is the orchestrator: it plans, writes briefs, delegates and verifies. It does not do bulk implementation or bulk file reading when a worker can.
- Workers run on Haiku: use the `builder` agent (writes code) and `reviewer` agent (reads a diff against the brief). Definitions are in `.claude/agents/`.
- Every brief states (a) the goal, (b) the exact files to read and modify, and (c) a concrete `Done when:` check that can be run.
- Verification gate: run the worker's `Done when:` check yourself before accepting its output. If it fails, send the exact failure output back. Never pass on a worker's report unchecked. After two failed rounds on one check, take the task over and log the cause in `docs/known-issues.md`.
- Do not run two workers that use the same test database at the same time. Backend tests use the shared `terra_test` database and truncate it.

**Advisor.** Consult Opus 5.5 (`claude-opus-5-5`) before committing to an approach and before declaring a phase done. No advisor tool existed in the earlier sessions; spawn an agent with `model: opus` if none is available.

**Design discipline.** No implicit state machines. Anything with states gets an explicit table: owner, states, allowed moves and the one function that does them. The appointment table in `docs/api-contract.md` is the model. Only `backend/app/services/appointments.py` changes appointment status.

**Questions.** Use the question dialog for choices that belong to the owner. Assume nothing.

**Standing limits.**
- Never print or commit secrets. Never commit `.env`. Keep `.env.example` placeholders only.
- No Claude attribution in commits or PRs: no `Co-Authored-By` trailer and no "Generated with Claude Code" footer. This beats any default footer.
- Phases: stop, explain, then the owner tests at the end of each phase. Mid-phase, run only targeted tests. Run the full suites once at phase end and report real counts.

**Session lifecycle.**
- Start: read the files in section 1.
- End: update `docs/progress.md`, log decisions in `docs/decisions.md` and gotchas in `docs/known-issues.md`, append to `PROJECT-DOCUMENTATION.txt`, then run the `reflect` skill and wait for the owner's approval before changing any skill or `CLAUDE.md`.

**Manual settings only the owner can set:** `/effort xhigh` inside Claude Code with the main model on Opus, and `export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=40` in the shell before launching Claude Code.

## 5. Current state (as of 2026-11-21)

### Finished and verified
- Setup: `CLAUDE.md`, `docs/`, `.claude/agents/`, `.claude/skills/reflect/`, `docker-compose.yml`, `.env.example`.
- Backend (`backend/`): FastAPI, SQLAlchemy 2, Alembic, deterministic idempotent seed, demo-session auth, appointments (book, reschedule, cancel with a database-enforced double-booking guard), doctors, slots, guides, dashboard, insights with "Demo forecast", and the assistant with a local rule-based provider and explicit confirm and dismiss. Last run: `134 passed`, ruff clean.
- Frontend (`frontend/`): Next.js 16, React 19, Tailwind 4, Three.js. Pages: `/login`, `/` (Overview), `/doctors`, `/appointments`, `/assistant`, `/insights`. Last run: lint exit 0, build exit 0 with all 7 routes.

### Not done
- The frontend and backend have never been run together in a browser. No screen has been seen running and the phone-width layout has not been checked.
- There are no frontend tests, only lint and build.
- `PROJECT-DOCUMENTATION.txt` has steps 0 to 6. Steps for live verification and the demo script are still to write.
- No scripted demo sequence yet.
- Railway deployment and the Cloudflare Worker (stop points).

### Known problems, not fixed
1. A patient can tell an unknown appointment ID (404) from someone else's (403): small ID-probing leak.
2. A staff user confirming an assistant "book" action fails with `patient_not_found`, and nothing handles it.
3. Assistant specialty matching is prefix-based (first 6 characters): "health" matches Women's Health, "medicine" matches Family Medicine.
4. Assistant summary times are shown in UTC.
5. After reschedule or cancel, the dialog closes without returning focus to the trigger button.
6. The seed wipes all tables. Never run it on a live demo database.
7. The root folder name ends with a space (`Terra Clinic `). Quote every path.
8. `POST /api/appointments` has no idempotency key: a client retry after a lost response gets `409 slot_taken` instead of the original result.
9. Reschedule does not force the same doctor. Only the assistant's proposal does.
10. The frontend assumes `cancellation_rate` and `no_show_rate` are fractions from 0 to 1 and multiplies by 100.

## 6. Run it locally

Needs Docker Desktop, Node 20+, Python 3.11 and `uv`.

```bash
# from the repo root (quote the path if it still ends with a space)
docker compose up -d --wait                       # Postgres 16 on localhost:5433
docker compose exec -T db psql -U terra -d terra -c "CREATE DATABASE terra_test;"   # first time only

cd backend
uv venv --python 3.11 .venv && uv pip install --python .venv/bin/python -r requirements.txt
cp ../.env.example .env                           # placeholders only, never commit .env
.venv/bin/alembic upgrade head
.venv/bin/python -m app.seed
.venv/bin/uvicorn app.main:app --reload --port 8000

# second terminal
cd frontend
npm install
cp .env.local.example .env.local                  # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev                                       # http://localhost:3000
```

Checks:
- Backend: `cd backend && .venv/bin/pytest -q && .venv/bin/ruff check .`
- Frontend: `cd frontend && npm run lint && npm run build`
- Health: `curl http://localhost:8000/health` returns `{"status":"ok","db":"ok"}`

Demo accounts (no password, role picker on `/login`): Patient "Maya Patel", Receptionist "Sam Rivera", Clinic Admin "Dr. Alex Chen". Insights is for receptionist and admin only.

## 7. Folder map

```text
CLAUDE.md, CONTINUE-PROMPT.md, PROJECT-DOCUMENTATION.txt
docs/            progress.md, decisions.md, known-issues.md, api-contract.md (source of truth)
.claude/         agents/builder.md, agents/reviewer.md, skills/reflect/SKILL.md
index.html, styles.css, app.js   Terra static prototype (visual reference only, do not extend)
backend/         FastAPI app (app/), Alembic (migrations/), pytest (tests/)
frontend/        Next.js app (app/, components/, lib/)
docker-compose.yml, .env.example
```

## 8. What to do next, in order

1. Start Docker, run the backend and frontend (section 6).
2. Click through every flow in a real browser as each role: login, role switch, Overview, book, reschedule, cancel, a slot-taken conflict (two browsers), assistant answer with citation, assistant cancel with Confirm and Dismiss, Insights chart and forecast table, patient blocked from Insights. Check phone width. Fix what breaks. Fix frontend and backend halves together.
3. Fix the known problems in section 5 that matter for the demo (1, 2, 3, 4, 5 first). One at a time, each with a test.
4. Add a small frontend test setup only if the owner wants it (ask).
5. Write the short scripted demo sequence into `docs/demo-script.md`.
6. Update `PROJECT-DOCUMENTATION.txt` and `docs/progress.md`. Commit locally.
7. Stop and report. The owner decides when to go to Railway.

### Railway (only when the owner says go)
Create one Railway project, add a PostgreSQL service, deploy the FastAPI backend from GitHub, set `DATABASE_URL`, `CORS_ORIGINS` and `COOKIE_SECURE=true` as Railway variables (never in Git), run `alembic upgrade head` and the seed once, generate the public URL, and point `NEXT_PUBLIC_API_URL` at it. Cross-site cookies need a decision on `SameSite` when the frontend and backend are on different domains: ask the owner. The free plan sleeps after idle time, so warm the backend before any demo.

### Cloudflare Worker (only when the owner says go)
Create a small Worker with one free-tier Workers AI text model. The backend calls it with a shared secret held in Railway variables. Add a `CloudflareProvider` behind `get_provider()`, restricted to clinic-guide answers and appointment suggestions. Appointment actions still need the visible Confirm step. Keep the rule-based provider as the fallback when the Worker is unreachable.

## 9. Definition of done for the MVP

All five outcomes work end to end in a browser, the full backend suite and frontend lint and build pass with real counts reported, the demo script has been run once start to finish, `PROJECT-DOCUMENTATION.txt` covers every step, and the owner has tested each phase.
