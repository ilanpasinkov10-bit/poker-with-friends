-- ===========================================================================
-- 0015 — optional automatic blind increases.
--
-- Off by default, and a table that does not use it behaves exactly as before:
-- every column added here is nullable or defaulted, no existing column changes
-- meaning, and no existing function changes behaviour for a table whose timer
-- is DISABLED.
--
-- WHERE THE STATE LIVES
--
-- On `poker_tables`, not in a table of its own. Three reasons, all of them
-- about not making the app slower:
--
--   * the table screen already selects this row, so the timer costs no extra
--     query and no extra network round trip;
--   * the realtime subscription the screen already holds is filtered on
--     `poker_tables.id`, so timer changes reach every player through the
--     existing channel — no second subscription;
--   * one game owns one timer. A row per table is exactly that, and makes a
--     per-player timer impossible to write by accident.
--
-- WHAT IS STORED, AND WHAT IS NOT
--
-- A structure and an anchor. Not a countdown, and not a "current remaining
-- seconds" that something would have to keep writing:
--
--   blind_levels            the whole structure, ordered
--   blind_level_index       which level the anchor refers to
--   blind_level_started_at  when that level began
--   blind_paused_at         set only while paused — the instant it froze
--   blind_status            DISABLED / READY / RUNNING / PAUSED / STOPPED
--
-- Everything else is derived from those and the current time, by the same pure
-- function on the server and in the browser (src/lib/domain/blinds.ts). A
-- level that has run out is not a level waiting for something to advance it;
-- it is simply not the level the derivation returns any more.
--
-- So automatic advancement needs no cron job, no background worker, and
-- nobody's browser left open — and it writes nothing. The row changes only
-- when a person does something: start, pause, resume, next, previous, stop.
-- Between those, the database is not touched at all, however long the game
-- runs.
--
-- It is also why a phone that was locked for eight minutes comes back showing
-- twelve minutes left rather than twenty: there was never any ticking state
-- for it to lose.
--
-- STOPPING
--
-- The timer is gated on the game being ACTIVE rather than being stopped by
-- each ending path in turn. Counting, finishing, cancelling and correcting a
-- finished game therefore all stop it without any of them knowing it exists,
-- and no future ending path can forget to.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. State
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'blind_timer_status') then
    create type public.blind_timer_status as enum
      ('DISABLED', 'READY', 'RUNNING', 'PAUSED', 'STOPPED');
  end if;
end $$;

alter table public.poker_tables
  add column if not exists blind_levels           jsonb not null default '[]'::jsonb,
  add column if not exists blind_status           public.blind_timer_status not null default 'DISABLED',
  add column if not exists blind_level_index      smallint not null default 0,
  add column if not exists blind_level_started_at timestamptz,
  add column if not exists blind_paused_at        timestamptz;

-- ---------------------------------------------------------------------------
-- 2. What counts as a valid structure.
--
-- The same rules the create-table form applies, enforced here so they hold
-- whatever calls in. Kept as a function rather than inline so the constraint
-- and the RPC cannot drift apart.
-- ---------------------------------------------------------------------------
create or replace function public.blind_levels_valid(p_levels jsonb)
returns boolean language sql immutable set search_path = public as $$
  select
    jsonb_typeof(p_levels) = 'array'
    and jsonb_array_length(p_levels) between 0 and 30
    -- Every entry well-formed…
    and not exists (
      select 1 from jsonb_array_elements(p_levels) e
      where jsonb_typeof(e) <> 'object'
         or (e ->> 'kind') not in ('BLINDS', 'BREAK')
         or (e ->> 'minutes') is null
         or (e ->> 'minutes') !~ '^[0-9]+$'
         or (e ->> 'minutes')::bigint not between 1 and 600
         or (
           (e ->> 'kind') = 'BLINDS' and (
                (e ->> 'small_blind') is null
             or (e ->> 'big_blind')   is null
             or (e ->> 'small_blind') !~ '^[0-9]+$'
             or (e ->> 'big_blind')   !~ '^[0-9]+$'
             or (e ->> 'small_blind')::bigint not between 1 and 100000000
             or (e ->> 'big_blind')::bigint   not between 1 and 100000000
             or (e ->> 'big_blind')::bigint  <= (e ->> 'small_blind')::bigint
           )
         )
    )
    -- …and either empty, or a real structure: at least two levels, one of
    -- which actually sets blinds. A ladder of nothing but breaks is not one.
    and (
      jsonb_array_length(p_levels) = 0
      or (
        jsonb_array_length(p_levels) >= 2
        and exists (
          select 1 from jsonb_array_elements(p_levels) e where (e ->> 'kind') = 'BLINDS'
        )
      )
    );
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'poker_tables_blind_levels_valid') then
    alter table public.poker_tables
      add constraint poker_tables_blind_levels_valid check (public.blind_levels_valid(blind_levels));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'poker_tables_blind_index_range') then
    alter table public.poker_tables
      add constraint poker_tables_blind_index_range check (blind_level_index >= 0);
  end if;
  -- A running or paused timer must have an anchor to be read from, and only a
  -- paused one may carry a freeze instant.
  if not exists (select 1 from pg_constraint where conname = 'poker_tables_blind_anchor') then
    alter table public.poker_tables
      add constraint poker_tables_blind_anchor check (
        (blind_status in ('RUNNING', 'PAUSED')) = (blind_level_started_at is not null)
        and (blind_paused_at is not null) <= (blind_status = 'PAUSED')
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Configuring the ladder — before the game starts only.
--
-- Editing the structure under a running clock would move the ground the anchor
-- stands on: the level in play is derived by walking the ladder from the
-- anchor, so changing a duration earlier in it silently changes which level
-- everyone is on. The first version therefore refuses, and an admin with a
-- game in progress uses next / previous / pause instead.
-- ---------------------------------------------------------------------------
create or replace function public.set_blind_structure(p_table uuid, p_levels jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_table public.poker_tables;
begin
  perform public.require_uid();
  select * into v_table from public.poker_tables where id = p_table for update;
  if not found then raise exception 'TABLE_NOT_FOUND'; end if;
  if not public.is_table_admin(p_table) then raise exception 'NOT_AUTHORIZED'; end if;
  if v_table.status <> 'WAITING' then raise exception 'GAME_ALREADY_STARTED'; end if;
  if not public.blind_levels_valid(p_levels) then raise exception 'INVALID_BLIND_STRUCTURE'; end if;

  update public.poker_tables
     set blind_levels = coalesce(p_levels, '[]'::jsonb),
         blind_status = case
           when p_levels is null or jsonb_array_length(p_levels) = 0
             then 'DISABLED'::public.blind_timer_status
           else 'READY'::public.blind_timer_status
         end,
         blind_level_index = 0,
         blind_level_started_at = null,
         blind_paused_at = null
   where id = p_table;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Starting the game starts the clock.
--
-- Folded into the existing transition rather than offered as a second call, so
-- there is no window in which the game is running and the timer is not, and no
-- way for a client to start one without the other. A table with no structure
-- configured is untouched by this.
--
-- The body below is 0012's, plus the two blind branches.
-- ---------------------------------------------------------------------------
create or replace function public.set_table_status(p_table uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_table public.poker_tables;
  v_next  public.table_status := p_status::public.table_status;
begin
  perform public.require_uid();
  select * into v_table from public.poker_tables where id = p_table for update;
  if not found then raise exception 'TABLE_NOT_FOUND'; end if;
  if not public.is_table_admin(p_table) then raise exception 'NOT_AUTHORIZED'; end if;

  if v_table.status = v_next then return; end if;

  -- COMPLETED is only ever reached through finalize_game().
  if not (
       (v_table.status = 'WAITING'  and v_next in ('ACTIVE', 'CANCELLED'))
    or (v_table.status = 'ACTIVE'   and v_next in ('COUNTING', 'CANCELLED'))
    or (v_table.status = 'COUNTING' and v_next = 'ACTIVE')
  ) then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.poker_tables
     set status = v_next,
         started_at = case when v_next = 'ACTIVE' and started_at is null then now() else started_at end,
         counting_started_at = case when v_next = 'COUNTING' then now() else counting_started_at end,
         -- Level one begins when the manager starts the game, not when the
         -- table was created. Only ever on the first start: returning to
         -- ACTIVE from COUNTING leaves the clock where it was.
         blind_status = case
           when v_next = 'ACTIVE' and blind_status = 'READY' then 'RUNNING'::public.blind_timer_status
           else blind_status
         end,
         blind_level_index = case
           when v_next = 'ACTIVE' and blind_status = 'READY' then 0
           else blind_level_index
         end,
         blind_level_started_at = case
           when v_next = 'ACTIVE' and blind_status = 'READY' then now()
           else blind_level_started_at
         end
   where id = p_table;

  -- Leaving play behind — for counting or for good — closes any open request.
  -- A cancelled game must not leave an approve button that can only fail.
  if v_next in ('COUNTING', 'CANCELLED') then
    update public.rebuy_requests
       set status = 'CANCELLED', resolved_at = now()
     where table_id = p_table and status = 'PENDING';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. The manager's controls.
--
-- `internal_blind_effective` is the same walk the browser does, and is the one
-- place that answers "which level is actually in play". Pause and the two step
-- actions all need that answer before they can write anything.
-- ---------------------------------------------------------------------------
create or replace function public.internal_blind_effective(p_table public.poker_tables)
returns table (level_index int, elapsed_in_level interval)
language plpgsql stable set search_path = public as $$
declare
  v_idx      int := greatest(0, p_table.blind_level_index);
  v_count    int := jsonb_array_length(p_table.blind_levels);
  v_base     timestamptz;
  v_elapsed  interval;
  v_duration interval;
begin
  if v_count = 0 or p_table.blind_level_started_at is null then return; end if;
  if v_idx > v_count - 1 then v_idx := v_count - 1; end if;

  -- A paused clock reads the instant it froze, so time passing changes nothing.
  v_base := case when p_table.blind_status = 'PAUSED'
                 then coalesce(p_table.blind_paused_at, p_table.blind_level_started_at)
                 else now() end;
  v_elapsed := greatest(interval '0', v_base - p_table.blind_level_started_at);

  loop
    v_duration := make_interval(mins => ((p_table.blind_levels -> v_idx) ->> 'minutes')::int);
    if v_elapsed < v_duration or v_idx = v_count - 1 then
      level_index := v_idx;
      elapsed_in_level := least(v_elapsed, v_duration);
      return next;
      return;
    end if;
    v_elapsed := v_elapsed - v_duration;
    v_idx := v_idx + 1;
  end loop;
end;
$$;

/** Shared preamble: locks the row, checks the caller runs this table. */
create or replace function public.internal_blind_admin_table(p_table uuid)
returns public.poker_tables language plpgsql set search_path = public as $$
declare
  v_table public.poker_tables;
begin
  perform public.require_uid();
  select * into v_table from public.poker_tables where id = p_table for update;
  if not found then raise exception 'TABLE_NOT_FOUND'; end if;
  if not public.is_table_admin(p_table) then raise exception 'NOT_AUTHORIZED'; end if;
  if v_table.status <> 'ACTIVE' then raise exception 'INVALID_STATUS'; end if;
  if v_table.blind_status not in ('RUNNING', 'PAUSED') then raise exception 'BLIND_TIMER_NOT_RUNNING'; end if;
  return v_table;
end;
$$;

create or replace function public.pause_blind_timer(p_table uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_table public.poker_tables := public.internal_blind_admin_table(p_table);
  v_eff   record;
begin
  if v_table.blind_status = 'PAUSED' then return; end if;
  select * into v_eff from public.internal_blind_effective(v_table);
  if not found then raise exception 'BLIND_TIMER_NOT_RUNNING'; end if;

  -- Records where in the level the game had got to, not merely that it
  -- stopped: the start moves forward to "now minus what had elapsed", so the
  -- remaining time is exact through any number of pauses and needs no separate
  -- column that could drift out of step with it.
  update public.poker_tables
     set blind_status = 'PAUSED'::public.blind_timer_status,
         blind_level_index = v_eff.level_index,
         blind_level_started_at = now() - v_eff.elapsed_in_level,
         blind_paused_at = now()
   where id = p_table;
end;
$$;

create or replace function public.resume_blind_timer(p_table uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_table public.poker_tables := public.internal_blind_admin_table(p_table);
begin
  if v_table.blind_status <> 'PAUSED' then return; end if;

  update public.poker_tables
     set blind_status = 'RUNNING'::public.blind_timer_status,
         blind_level_started_at =
           now() - (v_table.blind_paused_at - v_table.blind_level_started_at),
         blind_paused_at = null
   where id = p_table;
end;
$$;

create or replace function public.step_blind_level(p_table uuid, p_direction int)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_table public.poker_tables := public.internal_blind_admin_table(p_table);
  v_eff   record;
  v_next  int;
begin
  if p_direction not in (-1, 1) then raise exception 'INVALID_INPUT'; end if;
  select * into v_eff from public.internal_blind_effective(v_table);
  if not found then raise exception 'BLIND_TIMER_NOT_RUNNING'; end if;

  v_next := v_eff.level_index + p_direction;
  if v_next < 0 or v_next > jsonb_array_length(v_table.blind_levels) - 1 then
    raise exception 'NO_SUCH_BLIND_LEVEL';
  end if;

  -- A step restarts that level's countdown. Stepping while paused keeps the
  -- clock frozen, at the full duration of the level stepped into.
  update public.poker_tables
     set blind_level_index = v_next,
         blind_level_started_at = now(),
         blind_paused_at = case when blind_status = 'PAUSED' then now() else null end
   where id = p_table;

  return v_next;
end;
$$;

create or replace function public.stop_blind_timer(p_table uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_table public.poker_tables := public.internal_blind_admin_table(p_table);
begin
  update public.poker_tables
     set blind_status = 'STOPPED'::public.blind_timer_status,
         blind_level_started_at = null,
         blind_paused_at = null
   where id = v_table.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants. Reading rides the existing `tables_select_members` policy: a
-- player who may see the table sees its timer, and nobody else does. Writing
-- is only ever through the functions above, which check is_table_admin.
-- ---------------------------------------------------------------------------
revoke execute on function public.internal_blind_effective(public.poker_tables) from public, anon, authenticated;
revoke execute on function public.internal_blind_admin_table(uuid) from public, anon, authenticated;

grant execute on function public.set_blind_structure(uuid, jsonb) to authenticated;
grant execute on function public.pause_blind_timer(uuid)          to authenticated;
grant execute on function public.resume_blind_timer(uuid)         to authenticated;
grant execute on function public.step_blind_level(uuid, int)      to authenticated;
grant execute on function public.stop_blind_timer(uuid)           to authenticated;
grant execute on function public.blind_levels_valid(jsonb)        to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Verify, so a partial apply fails loudly rather than looking successful.
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.set_blind_structure(uuid,jsonb)',
    'public.pause_blind_timer(uuid)',
    'public.resume_blind_timer(uuid)',
    'public.step_blind_level(uuid,integer)',
    'public.stop_blind_timer(uuid)'
  ] loop
    if to_regprocedure(v_fn) is null then
      raise exception '0015 failed: % is missing', v_fn;
    end if;
    if not has_function_privilege('authenticated', to_regprocedure(v_fn), 'EXECUTE') then
      raise exception '0015 failed: authenticated cannot execute %', v_fn;
    end if;
  end loop;

  -- The internal helpers must not be reachable over the API.
  foreach v_fn in array array[
    'public.internal_blind_effective(public.poker_tables)',
    'public.internal_blind_admin_table(uuid)'
  ] loop
    if has_function_privilege('authenticated', to_regprocedure(v_fn), 'EXECUTE') then
      raise exception '0015 failed: % must not be callable by authenticated', v_fn;
    end if;
  end loop;

  -- Clients must not be able to write the timer directly.
  if has_table_privilege('authenticated', 'public.poker_tables', 'UPDATE')
     or has_table_privilege('authenticated', 'public.poker_tables', 'INSERT') then
    raise exception '0015 failed: authenticated must not write poker_tables directly';
  end if;

  if not exists (select 1 from pg_constraint where conname = 'poker_tables_blind_levels_valid') then
    raise exception '0015 failed: the blind structure constraint is missing';
  end if;

  -- Existing tables must be untouched: no timer, and nothing to derive from.
  if exists (
    select 1 from public.poker_tables
     where blind_status <> 'DISABLED' and blind_levels = '[]'::jsonb
  ) then
    raise exception '0015 failed: a table has a timer status but no structure';
  end if;

  raise notice 'blind timer verified: one timer per table, admin-only, read with the table row';
end;
$$;
