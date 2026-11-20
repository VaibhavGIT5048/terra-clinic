# MVP design and API contract

Single source of truth for backend and frontend. Change it here first.

## Data owner and states

Postgres owns all data. The browser holds only the session cookie.

### Appointment states
| State | Meaning | Allowed moves | Function that does the move |
|---|---|---|---|
| booked | future visit reserved | booked -> booked (new slot), booked -> cancelled | `appointments.reschedule`, `appointments.cancel` |
| cancelled | terminal | none | |
| completed | seeded past visit, terminal | none | |
| no_show | seeded past visit, terminal | none | |

- Only `appointments.book`, `reschedule` and `cancel` (in `backend/app/services/appointments.py`) change appointments. Routes and the assistant both call them.
- Double-booking guard: a partial unique index on `appointments(slot_id) WHERE status = 'booked'`. The database rejects a second booking of one slot, even with two writers at once. The service turns that error into `409 slot_taken`.
- Each move runs in one transaction. If interrupted, nothing is written.
- Moving a non-`booked` appointment returns `409 invalid_state`.
- Retry: booking the same slot twice by the same patient returns `409 slot_taken` the second time. Cancelling an already cancelled appointment returns `409 invalid_state`.

### Assistant action states
`assistant_actions.status`: pending -> confirmed | dismissed | failed. The only mover is `assistant.confirm` / `assistant.dismiss`, using `UPDATE ... WHERE status='pending' RETURNING` as the atomic guard. A second confirm returns `409 invalid_state`. An action belongs to one user and only that user can confirm it.

## Tables
- `clinics(id, name, address, phone, hours)`
- `users(id, name, email, role)` role: patient | receptionist | admin
- `doctors(id, clinic_id, name, specialty, bio)`
- `slots(id, doctor_id, starts_at timestamptz, ends_at timestamptz)` unique (doctor_id, starts_at)
- `appointments(id, patient_id, slot_id, status, reason, created_at, updated_at)`
- `sessions(token pk, user_id, created_at, expires_at)`
- `clinic_guides(id, slug unique, title, body)`
- `daily_counts(day pk, booked, completed, cancelled, no_show)` synthetic history, 60 days ending yesterday
- `assistant_actions(id, user_id, type, params jsonb, summary, status, created_at)`

Seed (deterministic, fixed random seed, dates relative to "today" at seed time): 1 clinic ("Terra Family Clinic"), 6 doctors, 3 demo users (Patient "Maya Patel", Receptionist "Sam Rivera", Clinic Admin "Dr. Alex Chen"), 2 other patients, slots for the next 14 days (weekdays, 09:00 to 16:30, 30 min), a few past and cancelled appointments for Maya, 6 guides (opening hours, booking, rescheduling and cancellation policy, what to bring, parking and directions, privacy and demo notice), 60 days of daily_counts. Seed is idempotent: running it twice leaves one copy.

## Auth (demo session)
- `POST /api/auth/demo-login` body `{"role":"patient|receptionist|admin"}`. Sets httpOnly cookie `session` (SameSite=Lax, path `/`). Returns `{"id","name","email","role"}`.
- `POST /api/auth/logout` deletes the session and cookie. `204`.
- `GET /api/auth/me` returns the user or `401`.
- Roles: patient sees own appointments only. receptionist and admin see all and may book for any patient. Insights: receptionist and admin only (`403` for patient).

## Endpoints (prefix `/api`, JSON, errors as `{"detail":{"code":"...","message":"..."}}`)
| Method and path | Who | Notes |
|---|---|---|
| `GET /health` (no prefix) | any | `{"status":"ok","db":"ok"}` |
| `GET /api/doctors` | auth | `[{id,name,specialty,bio,clinic:{id,name}}]` |
| `GET /api/doctors/{id}/slots?days=14` | auth | free slots only (no booked appointment, in the future): `[{id,starts_at,ends_at}]` |
| `GET /api/appointments?status=` | auth | patient: own. staff: all. Item: `{id,status,reason,patient:{id,name},doctor:{id,name,specialty},slot:{id,starts_at,ends_at}}`, ordered by starts_at |
| `POST /api/appointments` | auth | `{slot_id, reason, patient_id?}` patient_id only for staff. `201`. `409 slot_taken`, `404 slot_not_found`, `422` |
| `POST /api/appointments/{id}/reschedule` | owner or staff | `{slot_id}`. `409 slot_taken`, `409 invalid_state` |
| `POST /api/appointments/{id}/cancel` | owner or staff | `409 invalid_state`. Returns the appointment |
| `GET /api/dashboard` | auth | `{user, next_appointment|null, counts:{upcoming,completed,cancelled}, recent_activity:[{kind,text,at}]}` |
| `GET /api/guides` | auth | `[{slug,title}]` |
| `GET /api/guides/{slug}` | auth | `{slug,title,body}` |
| `GET /api/insights` | staff | see below |
| `POST /api/assistant/message` | auth | `{message}` -> `{reply, citations:[{slug,title}], proposed_action: null | {id,type,summary,params}}` |
| `POST /api/assistant/actions/{id}/confirm` | action owner | runs the action through the appointment service. Returns `{status:"confirmed", appointment}` |
| `POST /api/assistant/actions/{id}/dismiss` | action owner | `{status:"dismissed"}` |

Past or cancelled appointments cannot be rescheduled. A slot in the past cannot be booked (`422 slot_in_past`).

### Insights response
```json
{
  "totals": {"booked": 0, "completed": 0, "cancelled": 0, "no_show": 0, "cancellation_rate": 0.0, "no_show_rate": 0.0},
  "window_days": 30,
  "history": [{"day": "YYYY-MM-DD", "booked": 0, "completed": 0, "cancelled": 0, "no_show": 0}],
  "forecast": {"label": "Demo forecast", "method": "Mean of the same weekday over the previous 4 weeks (booked appointments)", "points": [{"day": "YYYY-MM-DD", "predicted_booked": 0.0}]}
}
```
`history` holds the last 30 days from `daily_counts`. `forecast.points` has 7 days starting tomorrow. Each point is the mean `booked` of the 4 most recent same-weekday days in `daily_counts`, rounded to 1 decimal. Never labelled as Chronos.

## Assistant (local rule-based provider, interface `AssistantProvider.reply(message, context) -> ProviderResult`)
- Scope: clinic guide answers and appointment suggestions only. Anything else returns a fixed refusal: "I can only help with Terra Clinic information and your appointments."
- Intents by keyword: hours/open/location/address/parking/bring/privacy/policy -> best matching guide (keyword overlap), cite it; "my appointments"/"upcoming" -> list the user's next booked ones; "cancel" -> proposes `cancel` of the user's next booked appointment; "reschedule"/"move" -> proposes `reschedule` of the next booked appointment to the earliest free slot of the same doctor; "book" + doctor name or specialty -> proposes `book` of the earliest free slot of the matching doctor.
- Never executes anything. It only stores a `pending` assistant_action. The UI shows the summary with Confirm and Dismiss buttons.
- The provider interface is where the Cloudflare provider plugs in later.

## Frontend (Next.js, Terra look)
Routes: `/login` (role picker), `/` Overview, `/appointments`, `/doctors`, `/assistant`, `/insights` (staff only, link hidden for patients). API base `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`), `credentials: "include"`. Backend CORS allows `http://localhost:3000`.
Every screen has loading, empty, error and success states.
