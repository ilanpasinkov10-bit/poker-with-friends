-- ===========================================================================
-- 0016 — hiding a finished game from your own list.
--
-- A presentation preference, and nothing more. It records that one person does
-- not want one table on their "השולחנות שלי" screen. It grants nothing, revokes
-- nothing, and touches no game data: the table, its seats, its ledger, its
-- results, its settlements and every statistic derived from them are left
-- exactly as they were, and every other participant still sees the game.
--
-- WHY A TABLE OF ITS OWN, AND NOT A COLUMN ON table_players
--
-- Because `table_players` does not have a row for everyone who sees the table.
-- Membership is `is_table_admin(id) OR a table_players row` (0002), and
-- `create_poker_table` only creates that row when the organiser ticked "אני גם
-- משחק". An organiser who runs the game without playing therefore sees the
-- table on their list and has no seat — and they are the person most likely to
-- have a pile of finished games to tidy away. A column on `table_players`
-- would silently do nothing for exactly them.
--
-- One row per (person, table), created when they hide it and deleted when they
-- unhide it. Nothing about their historical relationship to the game lives
-- here, so there is nothing to lose by removing the row.
--
-- REVERSIBLE ON PURPOSE
--
-- `unhide_table` exists and works, though nothing in the app calls it yet.
-- The point of storing this as its own row rather than as a destructive act is
-- that an "ארכיון" screen later is a query, not a migration.
-- ===========================================================================

create table if not exists public.hidden_tables (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  table_id  uuid not null references public.poker_tables(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (user_id, table_id)
);

-- The list reads "which of my tables have I hidden", so the caller's own rows
-- are the access path. The primary key already leads with user_id.
create index if not exists hidden_tables_table_idx on public.hidden_tables (table_id);

alter table public.hidden_tables enable row level security;

-- Read your own rows and nobody else's. There is no write policy: every write
-- goes through the definer functions below, exactly as for every other table
-- in this schema.
drop policy if exists hidden_tables_select_own on public.hidden_tables;
create policy hidden_tables_select_own on public.hidden_tables
  for select to authenticated using (user_id = auth.uid());

revoke all on public.hidden_tables from anon, authenticated;
grant select on public.hidden_tables to authenticated;

-- ---------------------------------------------------------------------------
-- Hiding, and unhiding.
--
-- Only a game that is over. While a table is waiting, being played or being
-- counted, the person may still have to do something about it — approve an
-- entry, submit a count, settle up — and a list they have removed it from is
-- the wrong place to find out. `INVALID_STATUS` is the same refusal the rest
-- of the lifecycle uses for "not at this point in the game".
-- ---------------------------------------------------------------------------
create or replace function public.hide_table(p_table uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := public.require_uid();
  v_status public.table_status;
begin
  -- Membership is checked before anything else, so this cannot be used to
  -- probe which table ids exist.
  if not public.is_table_member(p_table) then raise exception 'NOT_AUTHORIZED'; end if;

  select status into v_status from public.poker_tables where id = p_table;
  if not found then raise exception 'TABLE_NOT_FOUND'; end if;
  if v_status not in ('COMPLETED', 'CANCELLED') then raise exception 'INVALID_STATUS'; end if;

  insert into public.hidden_tables (user_id, table_id)
  values (v_uid, p_table)
  on conflict (user_id, table_id) do nothing;
end;
$$;

create or replace function public.unhide_table(p_table uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.require_uid();
begin
  -- Always allowed: putting a game back on your own list can never be the
  -- unsafe direction, whatever the table is doing now.
  delete from public.hidden_tables where user_id = v_uid and table_id = p_table;
end;
$$;

grant execute on function public.hide_table(uuid)   to authenticated;
grant execute on function public.unhide_table(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Verify, so a partial apply fails loudly rather than looking successful.
-- ---------------------------------------------------------------------------
do $$
declare v_fn text;
begin
  if to_regclass('public.hidden_tables') is null then
    raise exception '0016 failed: hidden_tables is missing';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'hidden_tables'
       and policyname = 'hidden_tables_select_own'
  ) then
    raise exception '0016 failed: the select policy is missing';
  end if;

  -- No write policy may exist: a client must not be able to write a row that
  -- says something about somebody else.
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'hidden_tables' and cmd <> 'SELECT'
  ) then
    raise exception '0016 failed: hidden_tables must have no client write policy';
  end if;

  if has_table_privilege('authenticated', 'public.hidden_tables', 'INSERT')
     or has_table_privilege('authenticated', 'public.hidden_tables', 'UPDATE')
     or has_table_privilege('authenticated', 'public.hidden_tables', 'DELETE') then
    raise exception '0016 failed: authenticated must not write hidden_tables directly';
  end if;

  foreach v_fn in array array['public.hide_table(uuid)', 'public.unhide_table(uuid)'] loop
    if to_regprocedure(v_fn) is null then
      raise exception '0016 failed: % is missing', v_fn;
    end if;
    if not has_function_privilege('authenticated', to_regprocedure(v_fn), 'EXECUTE') then
      raise exception '0016 failed: authenticated cannot execute %', v_fn;
    end if;
  end loop;

  raise notice 'hidden tables verified: one row per person and game, readable only by its owner';
end;
$$;
