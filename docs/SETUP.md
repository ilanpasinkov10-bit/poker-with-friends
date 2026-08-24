# Connecting the app to your Supabase project

Work through these in order. Nothing in the repository needs editing — this is
all configuration.

> **Never paste keys into a chat, an issue, a commit, or a screenshot.** Every
> value below is copied from the Supabase dashboard straight into either your
> local `.env.local` (git-ignored) or your host's encrypted environment
> settings. If a key is ever exposed, rotate it in
> **Project Settings → API Keys**.

---

## 1. Which variables you need

| Variable | Required? | Where it goes | Secret? |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | `.env.local` + host env | no |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | `.env.local` + host env | no |
| `NEXT_PUBLIC_SITE_URL` | recommended | `.env.local` + host env | no |
| `SUPABASE_SECRET_KEY` | **no — leave unset** | — | yes |

Both required values come from **Supabase Dashboard → Project Settings → API Keys**.

### About the publishable key

It is *designed* to be public: it ships inside the JavaScript bundle and
identifies the project, not the user. It grants nothing on its own — every
request it makes is still evaluated by Row Level Security, and every write goes
through a `SECURITY DEFINER` function that authorises against the caller's own
session. Treat it as a project identifier, not a credential.

### About the secret key — do not configure it

The app **never calls it**. `src/lib/supabase/admin.ts` exists for future
maintenance work but nothing imports it, so there is no secret to leak. Leave
`SUPABASE_SECRET_KEY` unset in every environment.

If you ever do need it: it bypasses RLS completely, so it belongs only in a
server-side environment variable, must never carry a `NEXT_PUBLIC_` prefix, and
must never appear in `next.config.ts`, a client component, or the browser.

---

## 2. Configure your machine

```bash
cp .env.example .env.local
```

Open `.env.local` in your editor and paste the two values from the dashboard.
`.env.local` is git-ignored — confirm with `git check-ignore -v .env.local`.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Older projects issue an `anon` key (a JWT) instead of a publishable key. Set
`NEXT_PUBLIC_SUPABASE_ANON_KEY` in that case — the app accepts either name.

---

## 3. Configure your host (Vercel)

Add the same variables under
**Project → Settings → Environment Variables**, scoped to Production, Preview
and Development. Vercel stores them encrypted; they are never committed.

Set `NEXT_PUBLIC_SITE_URL` to your production origin, or leave it out entirely —
the app falls back to `VERCEL_URL`.

Do **not** add `SUPABASE_SECRET_KEY`.

---

## 4. Apply the database migrations

Six migrations create the schema, the privileged functions, every RLS policy,
the realtime publication, and the avatar storage bucket. Apply them in order.

### Option A — Supabase CLI (recommended)

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

`db push` applies anything not yet recorded in the project's migration history,
so it is safe to re-run.

### Option B — SQL Editor

Open **SQL Editor → New query** and run each file's contents, one at a time,
waiting for success before the next:

1. `supabase/migrations/0001_schema.sql`
2. `supabase/migrations/0002_functions.sql`
3. `supabase/migrations/0003_finalization.sql`
4. `supabase/migrations/0004_rls.sql`
5. `supabase/migrations/0005_realtime_storage.sql`
6. `supabase/migrations/0006_groups.sql`
7. `supabase/migrations/0007_fix_function_grants.sql`
8. `supabase/migrations/0008_delete_profiles_leaderboard.sql`
9. `supabase/migrations/0009_leave_active_table.sql`

Order matters: later files reference objects created by earlier ones.

### What each file sets up

| File | What it configures |
|---|---|
| `0001` | Tables, enums, constraints, indexes, the profile trigger, the totals view |
| `0002` | Join codes, and every privileged function (joining, buy-ins, game state) |
| `0003` | Final calculations, chip validation, settlement checks, rankings |
| `0004` | **RLS** — enables it on every table, revokes client writes, adds all policies |
| `0005` | **Realtime** publication and **Storage** bucket + policies |
| `0006` | Recurring groups |
| `0007` | Grants `compute_final_rows` to `authenticated`, and self-checks that every RPC the app calls is executable |
| `0008` | Table deletion, public profiles, the global leaderboard, and the opt-in `show_on_leaderboard` privacy switch (defaults to off) |
| `0009` | Leaving a game in progress: `table_players.left_at` and `leave_table` |

Realtime, Storage and RLS need no dashboard clicks — they are configured by
`0004` and `0005`.

---

## 5. Authentication

**Authentication → Sign In / Providers.**

### 5a. Email — required

Enable the **Email** provider. Leave *Confirm email* on for production; turning
it off while testing means sign-up logs you straight in.

### 5b. Anonymous sign-ins — required for guests

Enable **Anonymous sign-ins**.

This is how guest players work. Someone joining with a code is issued a real,
Supabase-signed anonymous session in httpOnly cookies, so RLS and Realtime treat
them exactly like a registered user and the server never trusts a player id sent
by the browser. It is also what lets a guest attach an email later and keep the
games they already played, with no matching on display names.

With it disabled, guest joining fails with a clear Hebrew message
(*"הצטרפות כאורח אינה זמינה כרגע"*) and registered accounts still work.

Consider enabling **CAPTCHA protection** too, since anonymous sign-in is an
unauthenticated endpoint.

### 5c. Redirect URLs

**Authentication → URL Configuration:**

- **Site URL** — `http://localhost:3000` while developing, your production
  origin once deployed.
- **Redirect URLs** — add both:
  - `http://localhost:3000/auth/callback`
  - `https://<your-domain>/auth/callback`

Email confirmation links land on `/auth/callback`.

---

## 6. Verify

```bash
npm install
npm run dev          # http://localhost:3000
```

Checks that do not need a second device:

- The home page shows the Hebrew screen, not the "not connected" notice.
- **Table Editor** lists twelve tables, each showing the RLS shield as enabled.
- **Database → Publications → supabase_realtime** includes `poker_tables`,
  `table_players`, `buyin_transactions`, `rebuy_requests`,
  `chip_count_submissions`, `game_results`, `settlements`.
- **Storage** shows an `avatars` bucket.
- Sign up, open a table, and confirm a five-character join code appears.

Then the full path, with a phone or a private window as the second device:

1. **A** — sign up, open a table, tick *"אני גם משחק"*.
2. **B** — open `/join`, enter the code, pick a name, join **without an
   account**. A shows the new player within a second.
3. **B** — *"בקש כניסה נוספת"*. A receives the request live.
4. **A** — *"אשר"*. Pot and chip totals move on both devices.
5. **A** — *"סיים משחק"*, then enter counts. Enter a wrong total first and
   confirm the Hebrew discrepancy message appears.
6. Correct the counts, then *"סיים וחשב התחשבנות"*.
7. Both devices show the results and who transfers what.
8. **B** — *"שמור את הפרופיל שלי"* → register. The finished game appears in
   that account's history.

---

## Verifying the database layer offline

The SQL layer has its own test suite, which applies every migration to a
throwaway PostgreSQL instance and asserts the guarantees that matter — money,
locking, authorization and RLS:

```bash
npm run test:db     # needs a local PostgreSQL (initdb/pg_ctl/psql)
```

Run it after changing a migration, before pushing to a real project.

---

## Troubleshooting

**"האפליקציה עדיין לא חוברה ל‑Supabase"** — `.env.local` is missing or
incomplete. Restart `npm run dev` after editing it; Next only reads env files at
startup.

**Guests cannot join** — anonymous sign-ins are disabled (step 5b).

**A confirmation link bounces** — the redirect URL is not on the allow list
(step 5c).

**Nothing updates without a refresh** — check the realtime publication. The app
also polls every 30 seconds, so a table that only updates on that cadence points
at realtime rather than at the data.

**Avatar upload fails** — the `avatars` bucket is missing; re-run
`0005_realtime_storage.sql`.

**A player sees no financial data for others** — that is the `PRIVATE`
visibility setting working as designed, enforced in RLS rather than merely
hidden. Change it under *הגדרות שולחן*.
