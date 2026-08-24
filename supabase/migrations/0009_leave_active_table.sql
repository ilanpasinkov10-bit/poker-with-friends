-- ===========================================================================
-- Poker With Friends — leaving a table that is under way
--
-- A player who cashes out mid-game is still a participant in that game: their
-- buy-ins are in the pot, their issued chips came off the rack, and their
-- result belongs in the settlement. So they keep status = 'ACTIVE' and gain a
-- `left_at` timestamp instead of moving to a new status.
--
-- That choice is what keeps the accounting single-pathed. compute_final_rows,
-- assert_counts_complete_and_balanced and finalize_game all select
-- status = 'ACTIVE' and are therefore unchanged: a leaver's money and chips
-- stay in the totals, their recorded count participates in the chip
-- conservation check, and their profit/loss is computed by exactly the same
-- code as everyone else's. There is no second profit/loss path.
--
-- What `left_at` does change is the right to keep playing: no further buy-ins
-- and no rebuy requests.
-- ===========================================================================

alter table public.table_players
  add column if not exists left_at timestamptz;

comment on column public.table_players.left_at is
  'When the player cashed out and left a game in progress. Null while seated. '
  'They remain ACTIVE so their result stays part of the game''s settlement.';

create index if not exists table_players_seated_idx
  on public.table_players (table_id)
  where left_at is null;

-- ---------------------------------------------------------------------------
-- A player who has left may not take on more money.
-- Re-created here rather than edited in 0002, which is already in production.
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
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  if v_player.status <> 'ACTIVE' then
    raise exception 'PLAYER_NOT_ACTIVE';
  end if;
  if v_player.left_at is not null then
    raise exception 'PLAYER_HAS_LEFT';
  end if;

  select * into v_table from public.poker_tables where id = v_player.table_id;
  if v_table.status not in ('WAITING', 'ACTIVE') then
    raise exception 'GAME_LOCKED';
  end if;

  select coalesce(sum(case when type = 'REVERSAL' then -1 else 1 end), 0)
    into v_count
    from public.buyin_transactions
   where table_player_id = p_table_player;

  if v_count >= v_table.max_buy_ins then
    raise exception 'MAX_BUYINS_REACHED';
  end if;

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

  -- A player may only ever request on their own behalf.
  if v_player.user_id is distinct from v_uid then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if v_player.status <> 'ACTIVE' then raise exception 'PLAYER_NOT_ACTIVE'; end if;
  if v_player.left_at is not null then raise exception 'PLAYER_HAS_LEFT'; end if;

  select * into v_table from public.poker_tables where id = v_player.table_id;
  if v_table.status not in ('WAITING', 'ACTIVE') then raise exception 'GAME_LOCKED'; end if;

  select coalesce(sum(case when type = 'REVERSAL' then -1 else 1 end), 0)
    into v_count from public.buyin_transactions where table_player_id = p_table_player;
  if v_count >= v_table.max_buy_ins then raise exception 'MAX_BUYINS_REACHED'; end if;

  select id into v_request from public.rebuy_requests
   where table_player_id = p_table_player and status = 'PENDING';
  if v_request is not null then
    return v_request;  -- idempotent: repeated taps reuse the open request
  end if;

  insert into public.rebuy_requests (table_id, table_player_id)
  values (v_player.table_id, p_table_player)
  returning id into v_request;

  return v_request;
end;
$$;

-- ---------------------------------------------------------------------------
-- leave_table — cash out of a game in progress.
--
-- The chip count is recorded as both submitted and approved, because the
-- player is handing the chips back at that moment and the figure is binding
-- immediately. The admin can still correct it during COUNTING via
-- admin_set_chip_count, and a wrong figure cannot slip through finalisation:
-- the totals would no longer balance against the chips issued.
-- ---------------------------------------------------------------------------
create or replace function public.leave_table(p_table_player uuid, p_chips integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := public.require_uid();
  v_player public.table_players;
  v_table  public.poker_tables;
begin
  if p_chips is null or p_chips < 0 then raise exception 'INVALID_INPUT'; end if;

  select * into v_player from public.table_players where id = p_table_player for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  -- Only ever your own seat: a player id from the browser is a target, never
  -- an identity.
  if v_player.user_id is distinct from v_uid then raise exception 'NOT_AUTHORIZED'; end if;
  if v_player.status <> 'ACTIVE' then raise exception 'PLAYER_NOT_ACTIVE'; end if;

  -- Under the row lock, so two taps cannot both succeed.
  if v_player.left_at is not null then raise exception 'ALREADY_LEFT'; end if;

  select * into v_table from public.poker_tables where id = v_player.table_id;
  if v_table.status not in ('WAITING', 'ACTIVE') then raise exception 'GAME_LOCKED'; end if;

  update public.rebuy_requests
     set status = 'CANCELLED', resolved_at = now(), resolved_by = v_uid
   where table_player_id = p_table_player and status = 'PENDING';

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
