# Why navigation is fast, and how to keep it that way

Moving between screens in this app is almost entirely a question of **how many
network round trips happen in series** before the destination can render.
Nothing else comes close. On a phone talking to a Supabase project in another
region, one round trip is 100–250ms; the code decides how many of those are
stacked end to end.

Two numbers from the same measurement make the point. With the backend
answering every call in 150ms:

| | before | after |
|---|---|---|
| serial round trips on `/profile` | 5 | 1 |
| tap → profile on screen | 824ms | 217ms |

The work was not caching. Nothing is cached across navigations; every screen
still reads the database on every visit. The work was removing waits.

---

## 1. Verify the session locally, not over the network

`supabase.auth.getUser()` sends the access token to the auth service and waits
for it to say who the token belongs to. `supabase.auth.getClaims()` verifies the
token's **signature** instead, against a public key fetched once and cached for
the whole server process — no round trip at all.

The security is the same. A token that has been tampered with fails signature
verification exactly as it fails server-side validation, and a request carrying
it is rejected by PostgREST too. What changes is that the answer no longer costs
a network leg.

This matters more than its own 150ms, because that call sat *in front of* every
route: a page cannot ask for its own data until it knows who is asking. It was
not one round trip out of three, it was the one the other two queued behind.

`src/lib/auth.ts` is the only place that does this.

### This needs asymmetric JWT signing keys

Local verification is only possible when the project signs its tokens with an
asymmetric key (ECC or RSA), because only then is there a public key to verify
against. A project still using the legacy shared HS256 secret has no such key,
and `getClaims()` quietly falls back to `getUser()` — correct, but back to a
round trip.

To switch, in the Supabase dashboard: **Authentication → JWT Keys → Migrate to
asymmetric keys**, then rotate. Existing sessions keep working; tokens issued
after the switch are signed with the new key. Nothing in this repository needs
to change.

Measured on the same nine navigations, at 150ms backend latency:

| signing keys | median tap → visible |
|---|---|
| before any of this work | 501ms |
| after, legacy HS256 | 346ms |
| after, asymmetric | 199ms |

The structural work below is what earns the middle row; the key migration is
what earns the last one.

---

## 2. Let a query start before it knows who is asking

Several screens filtered nothing by user id — RLS already decides which rows
come back — but still waited for the session check before asking. Those reads
now run *alongside* the check:

```ts
const [user, rows] = await Promise.all([requireUserId('/tables'), loadMyTables()]);
```

The check still runs and still redirects. It simply no longer blocks a query
whose result it does not shape. Where the id *is* needed, it is applied when the
rows are shaped, not when they are requested.

This is why the "legacy HS256" row above is still much faster than before: even
when the session check costs a round trip, it is no longer a round trip
everything else is stacked behind.

---

## 3. Ask for related rows in the same request

A query that needs the ids returned by a previous query cannot begin until that
one has finished. Where the relationship is a foreign key, PostgREST can return
both in one request:

```ts
supabase.from('poker_tables').select('*, table_players(status)')
```

Four places do this now — the tables list, the friends list, a player's history,
and the table screen. The history one collapsed a four-deep chain
(`game_results` → `poker_tables` → `poker_groups`, plus a separate sibling read)
into a single request.

**RLS is unaffected.** An embedded relation is filtered by its own policies
exactly as a standalone select on it would be. A row the viewer may not read is
absent from the embed just as it was absent from the separate query.

**Embeds resolve by constraint name.** `friendships` has two foreign keys into
`profiles`, so each is named explicitly. If a constraint were renamed, the embed
would not raise — the screen would come back quietly empty. The database tests
pin all eight names the app embeds through, so that failure mode is a failing
test instead of a blank list.

---

## 4. What was deliberately not done

**No prefetching.** `router.prefetch()` on `pointerdown` was measured. It works
— the navigation drops to ~80ms — but the payload it caches is reused on later
visits too. Prefetching, then sitting idle for 15 seconds, then navigating
served the 15-second-old copy and read the database zero times. For a live poker
table, a pending buy-in or a balance that is 15 seconds old is worse than a
navigation that is 100ms slower. Next offers no way to say "use this once, then
discard", so this stays off.

**No caching across navigations.** Every screen re-reads on every visit. There
is a probe for this: the measurement stub numbers each read of the tables list,
so a screen showing a number it has shown before is a screen serving stale data.

**No loading skeletons.** See PR #19. The previous screen stays on until the
next one is ready. Making navigation fast is what makes that pleasant; a
skeleton would only be hiding the wait described above.

---

## 5. If navigation gets slow again

Count the serial round trips, do not guess. The pattern to look for is an
`await` whose result is used as an argument to the next `await`. Anything else
belongs in a `Promise.all`, and anything joined by a foreign key belongs in the
same request.
