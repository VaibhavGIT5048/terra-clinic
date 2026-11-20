# Decisions

Format: ID, date, decision, why, status. Add entries at the bottom. Never rewrite an accepted entry: supersede it.

## D1 (2026-11-21), accepted: Orchestrator and workers
Orchestrator delegates bulk work to Haiku workers and verifies each result. Why: cut cost and context use.

## D2 (2026-11-21), accepted: Skills
Caveman for replies, ponytail for code, `tdd-pentest` off. Advisor is Opus 5.5.

## D3 (2026-11-21), accepted: Railway PostgreSQL for the prototype
Local development uses Docker PostgreSQL 16. Railway comes after the user switches accounts.

## D4 (2026-11-21), accepted: Demo sessions instead of OAuth
Predefined Patient, Receptionist and Clinic Admin accounts with a server-side session.

## D5 (2026-11-21), accepted: Deterministic "Demo forecast" instead of Chronos
Calculated from previous matching weekdays. Labelled "Demo forecast" in the UI.

## D6 (2026-11-21), accepted: FastAPI backend deploys to Railway
Not done yet. User stop point.

## D7 (2026-11-21), accepted: Cloudflare Workers AI for the assistant only
Not done yet. User stop point. Until then a local rule-based provider answers.

## D8 (2026-11-21), accepted: Frontend local first
Public hosting chosen after the MVP works.

## D9 (2026-11-21), accepted: Git at the repo root
`git init` in `Terra Clinic `. `Data-Science-Project/` keeps its own repo and is ignored by the root repo.

## D10 (2026-11-21), accepted: Assistant behind a provider interface
Rule-based local provider now. Cloudflare provider is one new class later. Any appointment action needs a visible confirmation.
