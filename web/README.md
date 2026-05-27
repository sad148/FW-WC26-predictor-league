# WC26 Predictor — Web (Next.js + Neon Postgres)

Backend rewrite of the Apps Script + Google Sheets prototype. Same data model, real auth (bcrypt + signed cookies), proper SQL, ready to deploy on Vercel. Frontend pages move into this project later.

## Quickstart

```bash
cd web
npm install
cp .env.local.example .env.local
# fill in DATABASE_URL (Neon), SESSION_PASSWORD (32+ chars), ADMIN_PASSWORD

npm run db:push      # create tables in Neon
npm run dev          # http://localhost:3000
```

Verify: `curl http://localhost:3000/api/health`

## Deploy to Vercel

```bash
npm i -g vercel
vercel               # link the project; pick "web" as the root if asked
vercel env add DATABASE_URL
vercel env add SESSION_PASSWORD
vercel env add ADMIN_PASSWORD
vercel --prod
```

## Database

5 tables in [src/db/schema.ts](src/db/schema.ts):

| Table | Replaces (Apps Script tab) | Notes |
|---|---|---|
| `users` | Players | bcrypt `password_hash`; case-insensitive unique name |
| `leagues` | Config `LEAGUE_*` keys | Most-recently-created row is "current" |
| `fixtures` | Fixtures | |
| `bets` | Predictions | UNIQUE `(user_id, match_id)` — one bet per match per user |
| `audit` | Audit | append-only |

`npm run db:push` syncs the schema directly. For production migrations later, switch to `drizzle-kit generate` + `drizzle-kit migrate`.

## Routes

All routes live under `/api/*`. Responses are always `{ ok: boolean, ...payload }` with proper HTTP status codes (200 ok, 201 created, 400 bad input, 401 auth, 404 not found, 409 conflict, 500 server error).

| Method | Path | Auth | Body | Purpose |
|---|---|---|---|---|
| GET | `/api/health` | — | — | Liveness check |
| POST | `/api/auth/register` | — | `{ name, password, leagueCode }` | Register; validates league code; sets session |
| POST | `/api/auth/login` | — | `{ name, password }` | Verifies password; sets session |
| POST | `/api/auth/logout` | — | — | Destroys session |
| GET | `/api/auth/me` | — | — | `{ user, isAdmin }` (user is null if logged out) |
| GET | `/api/fixtures` | — | — | List all matches |
| POST | `/api/fixtures` | admin | `{ nameA, nameB, date?, phase?, group?, venue?, flagA?, flagB? }` | Add fixture |
| PATCH | `/api/fixtures/[id]` | admin | `{ scoreA?, scoreB?, status }` | Update score/status; settles pending bets if status=complete |
| GET | `/api/bets` | user | — | This user's bets |
| POST | `/api/bets` | user | `{ matchId, q1?, q2?, q3?, q4?, wager }` | Place a bet (wager 1–10) |
| GET | `/api/leaderboard` | — | — | Aggregated standings (wins/losses/wallet/pts per player) |
| GET | `/api/league` | — | — | Current league `{ name, code }` |
| POST | `/api/league` | admin | `{ name }` | Create new league; auto-generates code |
| POST | `/api/admin/login` | — | `{ password }` | Sets `session.isAdmin=true` if matches `ADMIN_PASSWORD` |
| POST | `/api/admin/logout` | — | — | Clears admin flag |
| POST | `/api/admin/reset` | admin | — | TRUNCATE every table — testing only |
| POST | `/api/admin/seed-fixtures` | admin | — | Bulk-load 8 sample fixtures (fails if table not empty) |

## Auth model

- **Player sessions**: register or login → server sets an httpOnly signed cookie via iron-session. Subsequent `/api/bets` etc. read `session.userId` from the cookie.
- **Admin sessions**: `/api/admin/login` checks plaintext password against `ADMIN_PASSWORD` env var and sets `session.isAdmin = true`. Admin-only routes call `requireAdmin()`.
- **Cookies** are `httpOnly`, `sameSite=lax`, `secure` in production.

## Bet settlement

When admin `PATCH /api/fixtures/[id]` flips `status` to `'complete'` with both scores set, [src/lib/settle.ts](src/lib/settle.ts) loops every `pending` bet on that match and writes `'win'` or `'loss'` based on Q1/Q3/Q4. Q2 (first scorer) is recorded but not auto-evaluated (no first-scorer data in the schema yet).

## Frontend migration plan

The current shipped UI is the single `index.html` at the repo root (still pointed at the Apps Script). Next steps to migrate:

1. Add a fetch client in `src/lib/api.ts` that calls these routes (replacing `callAS()`).
2. Port the HTML's sections to React components under `src/app/{matches,leaderboard,mybets,account,admin}/page.tsx`.
3. Delete `index.html` and the `apps_script.gs` file once the React port is at parity.
