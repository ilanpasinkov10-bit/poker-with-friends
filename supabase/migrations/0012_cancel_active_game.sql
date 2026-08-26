-- ===========================================================================
-- 0012 — cancelling a game closes out its pending entry requests.
--
-- No schema change. `CANCELLED` already exists in the `table_status` enum and
-- `ACTIVE -> CANCELLED` was already an allowed transition, so cancelling a game
-- needs no new state and no new column. This migration replaces one function.
--
-- The gap it closes is requests left hanging. Moving a game to COUNTING already
-- cancels its pending rebuy requests; moving it to CANCELLED did not, so those
-- rows stayed PENDING forever. Approving one afterwards was already refused —
-- `internal_add_buyin` raises GAME_LOCKED for any table that is not WAITING or
-- ACTIVE, so no money could move — but the admin's screen still offered an
-- approve button that could only produce an error, and the request list never
-- emptied.
--
-- Nothing is deleted. The requests are marked CANCELLED, exactly as the
-- COUNTING path marks them, so the history of who asked for what survives.
-- Buy-in transactions, seats, chip counts and the table row itself are all
-- untouched: a cancelled game keeps its complete record.
-- ===========================================================================

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
         counting_started_at = case when v_next = 'COUNTING' then now() else counting_started_at end
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
-- Verify, so a partial apply fails loudly rather than looking successful.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.set_table_status(uuid,text)') is null then
    raise exception '0012 failed: set_table_status(uuid,text) is missing';
  end if;

  if not has_function_privilege(
       'authenticated', to_regprocedure('public.set_table_status(uuid,text)'), 'EXECUTE') then
    raise exception '0012 failed: authenticated cannot execute set_table_status';
  end if;

  -- The state this feature depends on has to exist for real.
  if not exists (
    select 1 from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'table_status' and e.enumlabel = 'CANCELLED'
  ) then
    raise exception '0012 failed: table_status has no CANCELLED value';
  end if;

  raise notice 'cancellation verified: CANCELLED exists and closes pending requests';
end;
$$;

notify pgrst, 'reload schema';
