# Known issues and gotchas

Format: date, issue, workaround or fix, status.

## 2026-11-21: Root folder name ends with a space
The path is `/Users/vaibhavgupta7047/Downloads/Terra Clinic ` (trailing space). Unquoted or trimmed paths fail with "no such file or directory". Always quote the full path. Open: rename the folder.

## 2026-11-21: Railway free plan sleeps when idle
The first request after 5 to 10 minutes idle is slow. Warm the backend before any demo.

## 2026-11-21: Terra prototype carries leftover code
`app.js` and `styles.css` keep shared code from the three-design study (Sage, Pulse, Terra). Use only the Terra parts as the visual reference.

## 2026-11-21: Docker Desktop was not running
Started with `open -a Docker`. If `docker info` fails again, start Docker Desktop first.

## 2026-11-21: Seed wipes all tables
`python -m app.seed` truncates every table before inserting. Re-running it on a database with user-made appointments or sessions deletes them and logs everyone out. Fine for local and first Railway load. Never re-run it on a live demo database.
