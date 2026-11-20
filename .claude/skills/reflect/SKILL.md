---
name: reflect
description: End-of-session retrospective. Lists what went wrong or took too long, proposes the smallest edit to a skill or CLAUDE.md that would have prevented it, and waits for approval. Use at the end of every session or when the user says "reflect".
---

# Reflect

Run at the end of a session, after `docs/progress.md`, `docs/decisions.md` and `docs/known-issues.md` are updated.

## Steps
1. List what went wrong or took too long this session. Use evidence only: a failed check, a brief that had to be redone, a repeated mistake, a surprise in the repo. Quote the command or message. If nothing went wrong, say so and stop.
2. For each problem, find the cause: a missing rule, a vague brief, a missing check, or an unwritten gotcha.
3. For each cause, propose the smallest targeted edit to a skill file or `CLAUDE.md`. Show the file, the exact old text (or "add after line X") and the exact new text. One edit per problem. No general rewrites.
4. Gotchas go to `docs/known-issues.md` and decisions to `docs/decisions.md`, not into skills.
5. Present a numbered list and wait. Apply nothing until the user approves each edit by number.

## Rules
- No proposal without evidence from this session.
- Prefer deleting or tightening a rule over adding one.
- Never edit a skill or `CLAUDE.md` before the user approves.
