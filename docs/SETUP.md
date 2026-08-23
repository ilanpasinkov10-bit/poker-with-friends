# Setup — Poker With Friends

Everything in this repository is ready to run; the only work left is creating
the external services and pasting three values into `.env.local`. Follow the
steps in order — they take about 15 minutes.

---

## 1. Prerequisites

- Node.js 20 or newer (`node -v`)
- A free [Supabase](https://supabase.com) account
- Optionally, a [Vercel](https://vercel.com) account for deployment

---

## 2. Create the Supabase project

1. Go to <https://supabase.com/dashboard> → **New project**.
2. Pick a name, a strong database password, and the region closest to Israel
   (`eu-central-1` — Frankfurt — is a good default).
3. Wait for provisioning to finish (~2 minutes).

---

## 3. Run the database migrations

The migrations create the schema, the privileged functions, all RLS policies,
the realtime publication, and the avatar storage bucket. Run them **in order**.

### Option A — Supabase SQL Editor (no tooling required)

Open **SQL Editor** in the dashboard and run each file's contents, one at a
time, in this order:

| # | File |
|---|------|
| 1 | `supabase/migrations/0001_schema.sql` |
| 2 | `supabase/migrations/0002_functions.sql` |
| 3 | `supabase/migrations/0003_finalization.sql` |
| 4 | `supabase/migrations/0004_rls.sql` |
| 5 | `supabase/migrations/0005_realtime_storage.sql` |
| 6 | `supabase/migrations/0006_groups.sql` |

Each should report success before you move to the next.

### Option B — Supabase CLI

```bash
npm install -g supabase
supabase link --project-ref <your-project-ref>
supabase db push
```

### Verifying

In **Table Editor** you should now see `profiles`, `poker_tables`,
`table_players`, `buyin_transactions`, `rebuy_requests`,
`chip_count_submissions`, `game_results`, `settlements`, `game_corrections`,
`poker_groups`, `saved_players` and `profile_privacy_settings`, each with the
RLS shield enabled.

---

## 4. Authentication

Go to **Authentication → Sign In / Providers**.

### 4a. Email (required)

- Enable the **Email** provider.
- **Confirm email**: your choice.
  - *Off* is friendlier while you are testing — sign-up logs the user straight in.
  - *On* is the right production setting.

### 4b. Anonymous sign-ins (required — this is how guests work)

Enable **Anonymous sign-ins**.

This is not optional. Guests who join with a code are given a real, Supabase-
signed anonymous session stored in httpOnly cookies. That session is what RLS,
Realtime and every privileged function authorise against — the app never trusts
a player id supplied by the browser. It is also what lets a guest later attach
an email and keep the games they already played, with no name matching.

If this stays disabled, guest joining fails with a clear Hebrew message
(*"הצטרפות כאורח אינה זמינה כרגע"*) and registered accounts still work.

While you are there, consider enabling **CAPTCHA protection**, since anonymous
sign-in is an unauthenticated endpoint.

### 4c. Redirect URLs

Under **Authentication → URL Configuration**:

- **Site URL**: `http://localhost:3000` for development, your production origin
  once deployed.
- **Redirect URLs** — add both:
  - `http://localhost:3000/auth/callback`
  - `https://<your-domain>/auth/callback`

The app handles the confirmation link at `/auth/callback`.

---

## 5. Realtime

`0005_realtime_storage.sql` already adds the relevant tables to the
`supabase_realtime` publication and sets `REPLICA IDENTITY FULL` where the
client needs the old row.

To confirm: **Database → Publications → supabase_realtime** should list
`poker_tables`, `table_players`, `buyin_transactions`, `rebuy_requests`,
`chip_count_submissions`, `game_results` and `settlements`.

Realtime is delivered *through* RLS, so a player is only ever notified about
rows they are already allowed to read.

---

## 6. Storage (avatars)

The same migration creates a public `avatars` bucket limited to 2 MB and to
`image/jpeg`, `image/png`, `image/webp` and `image/gif`, plus policies that pin
each file to `avatars/<user-id>/…`. A user can only write inside their own
folder.

Confirm under **Storage** that the `avatars` bucket exists.

---

## 7. Environment variables

```bash
cp .env.example .env.local
```

Fill in the values from **Project Settings → API**:

| Variable | Where to find it | Exposed to browser |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` / publishable key | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` / secret key | **no — server only** |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` locally | yes |

`SUPABASE_SERVICE_ROLE_KEY` bypasses RLS entirely. It is deliberately *not*
prefixed with `NEXT_PUBLIC_`, is only read from `src/lib/supabase/admin.ts`
(which is marked `server-only`), and must never be committed.

`.env.local` is git-ignored. Do not commit real credentials.

---

## 8. Run it locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

Other scripts:

```bash
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm test           # Vitest
npm run build      # production build
```

---

## 9. Deploy to Vercel

1. Push this repository to GitHub.
2. In Vercel: **Add New → Project**, import the repository. The framework is
   detected automatically; no build settings need changing.
3. Add the four environment variables from step 7 under
   **Settings → Environment Variables**. Set `NEXT_PUBLIC_SITE_URL` to your
   production origin (or leave it unset — the app falls back to `VERCEL_URL`).
4. Deploy.
5. Return to Supabase → **Authentication → URL Configuration** and add the
   production `Site URL` and `https://<your-domain>/auth/callback` redirect.

---

## 10. Smoke test

Two devices (or one browser plus one private window) are enough:

1. **Device A** — sign up, open a table, tick *"אני גם משחק"*.
2. Copy the join code from the table screen.
3. **Device B** — open `/join`, enter the code, pick a name, join **without
   signing up**. Device A should show the new player within a second.
4. Device B: tap **"בקש כניסה נוספת"**. Device A gets the request live.
5. Device A: **"אשר"**. Both devices update; the pot and chip totals move.
6. Device A: **"סיים משחק"** → enter chip counts. Deliberately enter a wrong
   total first and confirm the Hebrew discrepancy message appears.
7. Fix the counts so they balance, then **"סיים וחשב התחשבנות"**.
8. Both devices see the results and the transfer list.
9. Device B: **"שמור את הפרופיל שלי"** → register. The finished game appears in
   that account's history.

---

## Troubleshooting

**"האפליקציה עדיין לא חוברה ל‑Supabase"** — `.env.local` is missing or
incomplete. Restart `npm run dev` after editing it.

**Guests cannot join** — anonymous sign-ins are disabled (step 4b).

**Nothing updates without refreshing** — check the realtime publication
(step 5). The app also polls every 30 seconds as a fallback, so a table that
only updates on that cadence points at a realtime problem rather than a data
one.

**Avatar upload fails** — the `avatars` bucket is missing; re-run
`0005_realtime_storage.sql`.

**A player sees no financial data for others** — that is the `PRIVATE`
visibility setting working as intended. Change it under *הגדרות שולחן*.
