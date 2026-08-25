-- ===========================================================================
-- 0011 — push notification settings, subscriptions, and the end-of-game hook.
--
-- Additive only. Nothing here changes an existing column's meaning, and every
-- statement is idempotent so a partial apply can simply be re-run.
--
-- Three things are added:
--   1. Two per-user switches, both on by default, alongside the existing
--      privacy switches. They are deliberately independent: sound is a local
--      nuisance, a push notification is a message to a device, and a player
--      may well want one without the other.
--   2. A table of Web Push subscriptions. One row per browser/device, keyed by
--      the endpoint the push service hands out.
--   3. A timestamp on poker_tables that makes the "one hour to go" reminder
--      fire exactly once, however many times the scheduler runs.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The two switches.
--
-- Default true for both: the request is that notifications are on unless the
-- player turns them off. That is safe here because a subscription is still
-- only created after the browser's own permission prompt is accepted — this
-- flag decides whether we *ask* and whether we *send*, never whether the
-- browser grants anything.
-- ---------------------------------------------------------------------------
alter table public.profile_privacy_settings
  add column if not exists push_notifications_enabled boolean not null default true;

alter table public.profile_privacy_settings
  add column if not exists game_sounds_enabled boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2. Push subscriptions.
--
-- `endpoint` is the push service's URL for one browser and is unique by
-- definition, so it carries the primary key work: re-subscribing from the same
-- browser updates the row rather than accumulating duplicates, which is what
-- would otherwise cause the same phone to buzz twice.
--
-- The keys stored here are what allows a message to be *sent* to that device,
-- so this table is readable only by its owner. Sending happens server-side
-- under the service role; nothing in the browser ever reads another player's
-- row. There is deliberately no policy that would let a table-mate read them.
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_profile_idx
  on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'push_subscriptions'
       and policyname = 'own subscriptions are readable'
  ) then
    create policy "own subscriptions are readable" on public.push_subscriptions
      for select using (profile_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'push_subscriptions'
       and policyname = 'own subscriptions are writable'
  ) then
    create policy "own subscriptions are writable" on public.push_subscriptions
      for insert with check (profile_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'push_subscriptions'
       and policyname = 'own subscriptions are updatable'
  ) then
    create policy "own subscriptions are updatable" on public.push_subscriptions
      for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'push_subscriptions'
       and policyname = 'own subscriptions are removable'
  ) then
    create policy "own subscriptions are removable" on public.push_subscriptions
      for delete using (profile_id = auth.uid());
  end if;
end;
$$;

grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The "one hour to go" reminder.
--
-- Every other notification is sent by the action that caused it, so it fires
-- once by construction. This one has no user action behind it: a scheduler
-- has to notice that a game is an hour from its planned end. Recording when
-- it was sent, and only ever claiming rows where that is still null, makes the
-- reminder exactly-once even if the scheduler runs twice or two instances
-- overlap — the claiming UPDATE is a single atomic statement.
-- ---------------------------------------------------------------------------
alter table public.poker_tables
  add column if not exists ending_soon_notified_at timestamptz;

-- Narrow partial index: the scheduler only ever looks at live games that have
-- not been reminded yet, which is a handful of rows at any moment.
create index if not exists poker_tables_ending_soon_idx
  on public.poker_tables (planned_end_at)
  where status = 'ACTIVE' and ending_soon_notified_at is null;

-- ---------------------------------------------------------------------------
-- 4. Verify, so a partial apply fails loudly rather than silently leaving the
--    feature half-installed.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profile_privacy_settings'
       and column_name = 'push_notifications_enabled'
  ) then
    raise exception '0011 failed: push_notifications_enabled is missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profile_privacy_settings'
       and column_name = 'game_sounds_enabled'
  ) then
    raise exception '0011 failed: game_sounds_enabled is missing';
  end if;

  if to_regclass('public.push_subscriptions') is null then
    raise exception '0011 failed: push_subscriptions was not created';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.push_subscriptions'::regclass) then
    raise exception '0011 failed: RLS is not enabled on push_subscriptions';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'poker_tables'
       and column_name = 'ending_soon_notified_at'
  ) then
    raise exception '0011 failed: poker_tables.ending_soon_notified_at is missing';
  end if;

  raise notice 'notifications verified: settings, subscriptions and the reminder hook are present';
end;
$$;

notify pgrst, 'reload schema';
