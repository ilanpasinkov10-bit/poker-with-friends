# Poker With Friends · פוקר עם חברים

A private poker-night manager for groups of friends. It does **not** deal cards
— people play a real, physical game around a real table. The app handles the
money: buy-ins, chips issued, the clock, the final chip count, profit and loss,
and who owes whom at the end of the night.

The interface is **Hebrew-first and RTL**, designed for a phone in one hand.

> **Setup:** see [`docs/SETUP.md`](docs/SETUP.md) for the Supabase and Vercel
> configuration. Nothing in this repository needs editing to get running.

---

## What it does

| | |
|---|---|
| **Open a table** | Buy-in amount, chips per buy-in, max entries, start and end time, join mode, visibility, counting mode. Defaults: 50₪ = 500 chips, 6 entries max. |
| **Invite** | A 5-character join code (`A7K92`) with a share link and native share sheet. The code never grants admin rights. |
| **Join** | Registered users, or guests with no account at all. |
| **Play** | Live dashboard: players, entries, pot, chips on the table, countdown. Players request another entry; the admin approves or rejects. |
| **Count** | Admin counting or self-counting, with chip-discrepancy detection before anything is finalised. |
| **Settle** | Profit/loss per player and the minimal set of transfers: *"דניאל מעביר לאילן 80₪"*. |
| **Remember** | History, statistics, records, profit charts and per-group leaderboards. |

---

## Architecture

```
src/
  app/                    routes (App Router, all screens Hebrew/RTL)
    table/[id]/           live dashboard, counting, results, leaderboard
    join/[code]/          guest and member joining
    profile/              overview · history · stats · tables · settings
  components/
    ui/                   design-system primitives (RTL-aware)
    table/ join/ profile/ charts/ layout/
  lib/
    domain/               pure, unit-tested business logic
    actions/              server actions — the only write path
    data/                 server-side read models
    supabase/             browser · server · service-role · middleware clients
supabase/migrations/      schema, functions, RLS, realtime, storage
tests/                    Vitest suites over the domain layer
```

### Where the rules actually live

Every mutation goes through a **Server Action → `SECURITY DEFINER` Postgres
function**. Those functions derive the actor from `auth.uid()` themselves and
take row locks before they read totals, so the rules hold under concurrency and
cannot be bypassed by a crafted request. The TypeScript in
`src/lib/domain/permissions.ts` mirrors the same rules purely so the UI can hide
controls that would fail — if the two ever disagree, the database wins.

### Money and chips

- Money is stored as **integer agorot**. No floating point touches a financial
  value.
- `buyin_transactions` is an **append-only ledger**. A mistaken entry is
  corrected with a `REVERSAL` row, never by editing history.
- Totals (`total_paid`, `chips_issued`, `buy_in_count`) are **derived by a view**
  over that ledger. There is no client-written counter anywhere.
- Chips convert back to cash with the **largest-remainder method**, so the sum
  of every player's final value is exactly the pot and profit/loss sums to
  exactly zero — no stray agora.
- `finalize_game` recomputes the results itself and **rejects** any settlement
  plan that does not exactly resolve every balance.

### Concurrency

- Approving a rebuy locks the request row, then writes a ledger row whose
  `request_id` is covered by a unique index. A double-tap, or two admins tapping
  at once, cannot produce two buy-ins.
- Max entries are re-counted from the ledger inside a lock on the player row, so
  two concurrent approvals cannot exceed the cap.
- A partial unique index allows only one open rebuy request per player.
- Reversals are keyed by `reverses_transaction_id`, so a buy-in can be reversed
  at most once.

### Guests

A visitor who joins with a code is given a **Supabase anonymous session, minted
server-side**, stored in httpOnly cookies. That means a guest holds a real
signed JWT and a real `auth.uid()`, so:

- RLS and Realtime treat guests exactly like registered users;
- the server never trusts a player id that came from the browser — a guest
  cannot touch another player's record by changing an id;
- the session survives a refresh or a closed tab;
- signing up later **links an email to the same user**, so the games already
  played carry over. Nobody is ever merged by display name.

### Realtime

One channel per table subscribes to `postgres_changes` for that table's rows;
events trigger a debounced `router.refresh()`, so server components re-render
with authoritative data instead of the client duplicating query logic. Realtime
is delivered through RLS. A 30-second poll covers a dropped socket.

### Privacy

- A table can be `OPEN` (everyone sees everyone's entries and investment) or
  `PRIVATE` (each player sees only their own). This is enforced in RLS, not just
  hidden in the UI — a private table returns no ledger rows for other players.
- Results and settlements of a shared table are visible to everyone who sat at
  it; that is what an honest settlement requires.
- Lifetime cross-table history is private by default. `profile_privacy_settings`
  controls whether other players you have shared a table with may see your
  aggregate statistics, and whether detailed history is shared at all. A table
  admin gains no access to anyone's wider financial history.

### History integrity

Once a game is `COMPLETED` its `game_results` are frozen and are the source of
truth for every statistic. Corrections go through `correct_game_results`, which
requires a stated reason, re-validates the chip balance, recomputes the
settlement, bumps a revision number, and snapshots the previous state into
`game_corrections`.

---

## Tech

Next.js 15 (App Router) · React 19 · TypeScript (strict, `noUncheckedIndexedAccess`) ·
Tailwind CSS v4 · Supabase (Postgres, Auth, Realtime, Storage, RLS) · Zod ·
Vitest. Charts are hand-written SVG so the time axis can run right-to-left to
match the Hebrew reading direction.

---

## Previewing the UI without a backend

`/dev/preview` is a development-only gallery of every major screen and state,
rendered from the real components with static fixture props (see
`src/app/dev/preview/`). It exists so the interface can be reviewed before a
Supabase project is configured.

```bash
cp .env.example .env.local        # placeholder values are enough for the gallery
npm run dev                       # then open http://localhost:3000/dev/preview
```

Pick a screen from the selector at the top; append `&bare=1` to hide the
gallery chrome. Buttons that would call a server action are inert without a
backend, but local component state — modals, dialogs, form inputs — works.

The route is blocked in production two ways over: middleware returns a plain
404 for anything under `/dev` when `NODE_ENV=production`, and the page itself
calls `notFound()`. No production module imports anything from that folder.

## Scripts

```bash
npm run dev        # development server
npm run build      # production build
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm test           # Vitest
```

## Tests

The domain layer is pure and directly tested: chip/cash conversion and the
rounding partition, buy-in economics, maximum-entry enforcement, profit/loss,
chip-count validation, the settlement algorithm and its rejection of tampered
plans, permission rules (including "a player may never approve their own
request" and "COMPLETED is unreachable by a plain status change"), lifetime
statistics and records, Israeli date/time/currency formatting, and the guarantee
that no raw database error reaches a user.

## Security notes

- Clients hold `SELECT` only. Every write is a privileged function.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only, never prefixed `NEXT_PUBLIC_`, and
  imported solely from a `server-only` module.
- Join codes authorise *joining*, never administration. Admin rights come only
  from authenticated ownership of the table.
- Database errors are mapped to Hebrew messages; raw Postgres text is never
  shown to a user.
