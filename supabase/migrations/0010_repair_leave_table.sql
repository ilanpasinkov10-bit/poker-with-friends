-- ===========================================================================
-- Poker With Friends — repair and harden the leave flow
--
-- Production reports "action unavailable", which the application maps only
-- from PostgREST's PGRST202/PGRST204 — the database is behind the deployed
-- code and `public.leave_table` cannot be found in the schema cache. The
-- roster grouping is correct there, so `table_players.left_at` does exist:
-- 0009 landed partially, most likely because the statements after the column
-- never ran.
--
-- Rather than assume which part is missing, this migration is self-contained
-- and idempotent: it recreates every object the leave flow needs, verifies
-- them, and asks PostgREST to reload. Running it twice is harmless, and
-- running it on a database where 0009 fully succeeded changes only the error
-- codes.
--
-- It also replaces leave_table's generic codes with specific ones, so a
-- failure names its own cause in the server log instead of arriving as an
-- unattributable error.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The state field. Null means seated; a timestamp means the player
--    completed the leave flow. Nothing else expresses that state.
-- ---------------------------------------------------------------------------
alter table public.table_players
  add column if not exists left_at timestamptz;

comment on column public.table_players.left_at is
  'When the player cashed out and left a game in progress. Null while seated. '
  'They remain ACTIVE so their result stays part of the game''s settlement.';

create index if not exists table_players_seated_idx
  on public.table_players (table_id)
  where left_at is null;

-- ---------------------------------------------------------------------------
-- 2. A player who has left may take on no more money.
-- ---------------------------------------------------------------------------
create or replace function public.internal_add_buyin(
  p_table_player uuid,
  p_type         public.buyin_type,
  p_request      uuid,
  p_actor        uuid
) returns public.buyin_transactions
language plpgsql security definer set search_path = public as $$
declare
  v_player public.table_players;
  v_table  public.poker_tables;
  v_count  int;
  v_tx     public.buyin_transactions;
begin
  select * into v_player from public.table_players where id = p_table_player for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  if v_player.status <> 'ACTIVE' then raise exception 'PLAYER_NOT_ACTIVE'; end if;
  if v_player.left_at is not null then raise exception 'PLAYER_HAS_LEFT'; end if;

  select * into v_table from public.poker_tables where id = v_player.table_id;
  if v_table.status not in ('WAITING', 'ACTIVE') then raise exception 'GAME_LOCKED'; end if;

  select coalesce(sum(case when type = 'REVERSAL' then -1 else 1 end), 0)
    into v_count from public.buyin_transactions where table_player_id = p_table_player;
  if v_count >= v_table.max_buy_ins then raise exception 'MAX_BUYINS_REACHED'; end if;

  insert into public.buyin_transactions (
    table_id, table_player_id, type, amount_agorot, chips, request_id, created_by
  ) values (
    v_player.table_id, p_table_player, p_type,
    v_table.buy_in_agorot, v_table.chips_per_buy_in, p_request, p_actor
  )
  returning * into v_tx;

  return v_tx;
end;
$$;

create or replace function public.request_rebuy(p_table_player uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := public.require_uid();
  v_player  public.table_players;
  v_table   public.poker_tables;
  v_count   int;
  v_request uuid;
begin
  select * into v_player from public.table_players where id = p_table_player for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  if v_player.user_id is distinct from v_uid then raise exception 'NOT_AUTHORIZED'; end if;
  if v_player.status <> 'ACTIVE' then raise exception 'PLAYER_NOT_ACTIVE'; end if;
  if v_player.left_at is not null then raise exception 'PLAYER_HAS_LEFT'; end if;

  select * into v_table from public.poker_tables where id = v_player.table_id;
  if v_table.status not in ('WAITING', 'ACTIVE') then raise exception 'GAME_LOCKED'; end if;

  select coalesce(sum(case when type = 'REVERSAL' then -1 else 1 end), 0)
    into v_count from public.buyin_transactions where table_player_id = p_table_player;
  if v_count >= v_table.max_buy_ins then raise exception 'MAX_BUYINS_REACHED'; end if;

  select id into v_request from public.rebuy_requests
   where table_player_id = p_table_player and status = 'PENDING';
  if v_request is not null then return v_request; end if;

  insert into public.rebuy_requests (table_id, table_player_id)
  values (v_player.table_id, p_table_player)
  returning id into v_request;

  return v_request;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. leave_table, with a distinct code per refusal.
--
--    The whole body is one statement, so it is one transaction: if any check
--    or write fails, nothing is committed and the player stays seated.
--
--    Order matters. Ownership is established before anything about the
--    player's state is revealed, and `already left` is evaluated under the row
--    lock so two taps cannot both pass it.
--
--    Note what is deliberately NOT a reason to refuse: an existing chip count
--    submission. A player may have submitted or had a count approved without
--    ever leaving, so only `left_at` decides whether they have gone.
-- ---------------------------------------------------------------------------
create or replace function public.leave_table(p_table_player uuid, p_chips integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid;
  v_player public.table_players;
  v_table  public.poker_tables;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'LEAVE_UNAUTHORIZED'; end if;

  if p_chips is null or p_chips < 0 then raise exception 'LEAVE_INVALID_CHIPS'; end if;

  select * into v_player from public.table_players where id = p_table_player for update;
  if not found then raise exception 'LEAVE_PLAYER_NOT_FOUND'; end if;

  -- Only ever your own seat. A player id from the browser is a target, never
  -- an identity. This holds identically for an anonymous guest, whose
  -- auth.uid() is a real signed subject.
  if v_player.user_id is distinct from v_uid then raise exception 'LEAVE_UNAUTHORIZED'; end if;

  if v_player.status <> 'ACTIVE' then raise exception 'LEAVE_INVALID_STATE'; end if;
  if v_player.left_at is not null then raise exception 'LEAVE_ALREADY_LEFT'; end if;

  select * into v_table from public.poker_tables where id = v_player.table_id;
  if not found then raise exception 'LEAVE_PLAYER_NOT_FOUND'; end if;
  if v_table.status not in ('WAITING', 'ACTIVE') then
    raise exception 'LEAVE_TABLE_NOT_ACTIVE';
  end if;

  update public.rebuy_requests
     set status = 'CANCELLED', resolved_at = now(), resolved_by = v_uid
   where table_player_id = p_table_player and status = 'PENDING';

  -- The declared count feeds the same finalisation path as everyone else's.
  insert into public.chip_count_submissions (
    table_id, table_player_id, submitted_chips, submitted_by, submitted_at,
    approved_chips, approved_by, approved_at
  ) values (
    v_player.table_id, p_table_player, p_chips, v_uid, now(), p_chips, v_uid, now()
  )
  on conflict (table_player_id) do update
    set submitted_chips = excluded.submitted_chips,
        submitted_by    = excluded.submitted_by,
        submitted_at    = now(),
        approved_chips  = excluded.approved_chips,
        approved_by     = excluded.approved_by,
        approved_at     = now();

  update public.table_players set left_at = now() where id = p_table_player;
end;
$$;

grant execute on function public.leave_table(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Verify. If anything here is missing the migration fails loudly rather
--    than leaving production in the state that produced this bug.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'table_players'
       and column_name = 'left_at'
  ) then
    raise exception 'repair failed: table_players.left_at is missing';
  end if;

  if to_regprocedure('public.leave_table(uuid,integer)') is null then
    raise exception 'repair failed: leave_table(uuid,integer) was not created';
  end if;

  if not has_function_privilege(
       'authenticated', to_regprocedure('public.leave_table(uuid,integer)'), 'EXECUTE') then
    raise exception 'repair failed: authenticated cannot execute leave_table';
  end if;

  raise notice 'leave flow verified: column, function and grant are all present';
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Ask PostgREST to rebuild its schema cache, so the new function is
--    reachable immediately rather than after the next restart. This is what
--    turns "applied" into "actually callable".
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
