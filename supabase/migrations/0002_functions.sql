-- ===========================================================================
-- Poker With Friends — authorization helpers and privileged RPCs
--
-- Every mutation lives in a SECURITY DEFINER function that derives the actor
-- from auth.uid(). Clients never write to the tables directly, and never pass
-- their own identity: a browser-supplied player id can only ever be a *target*,
-- and is always re-checked against auth.uid() before anything is written.
--
-- Errors are raised as stable machine codes (NOT_AUTHORIZED, ...). The Next.js
-- layer maps them to Hebrew messages; raw database errors never reach the user.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_table_admin(p_table uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.poker_tables t
    where t.id = p_table and t.owner_id = auth.uid()
  );
$$;

create or replace function public.is_table_member(p_table uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_table_admin(p_table) or exists (
    select 1 from public.table_players tp
    where tp.table_id = p_table
      and tp.user_id = auth.uid()
      and tp.status in ('PENDING', 'ACTIVE')
  );
$$;

create or replace function public.owns_table_player(p_table_player uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.table_players tp
    where tp.id = p_table_player and tp.user_id = auth.uid()
  );
$$;

-- Do the current user and p_user share at least one table?
create or replace function public.shares_table_with(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.table_players mine
    join public.table_players theirs on theirs.table_id = mine.table_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user
  ) or exists (
    select 1 from public.poker_tables t
    join public.table_players tp on tp.table_id = t.id
    where (t.owner_id = auth.uid() and tp.user_id = p_user)
       or (t.owner_id = p_user and tp.user_id = auth.uid())
  );
$$;

create or replace function public.require_uid()
returns uuid language plpgsql stable as $$
declare v uuid;
begin
  v := auth.uid();
  if v is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Join codes: 5 chars, ambiguous glyphs (I, O, 0, 1) removed.
-- ---------------------------------------------------------------------------
create or replace function public.generate_join_code()
returns text language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i int;
  attempts int := 0;
begin
  loop
    code := '';
    for i in 1..5 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.poker_tables where join_code = code);
    attempts := attempts + 1;
    if attempts > 50 then
      raise exception 'CODE_GENERATION_FAILED';
    end if;
  end loop;
  return code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Table creation
-- ---------------------------------------------------------------------------
create or replace function public.create_poker_table(
  p_name              text,
  p_game_date         date,
  p_planned_start_at  timestamptz,
  p_planned_end_at    timestamptz,
  p_buy_in_agorot     integer,
  p_chips_per_buy_in  integer,
  p_max_buy_ins       integer,
  p_join_mode         text,
  p_player_visibility text,
  p_counting_mode     text,
  p_admin_plays       boolean,
  p_group_id          uuid default null
) returns public.poker_tables
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := public.require_uid();
  v_table  public.poker_tables;
  v_name   text;
  v_player uuid;
begin
  if p_planned_end_at <= p_planned_start_at then
    raise exception 'INVALID_INPUT';
  end if;

  if p_group_id is not null and not exists (
    select 1 from public.poker_groups g where g.id = p_group_id and g.owner_id = v_uid
  ) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  insert into public.poker_tables (
    group_id, owner_id, name, join_code, game_date, planned_start_at, planned_end_at,
    buy_in_agorot, chips_per_buy_in, max_buy_ins, join_mode, player_visibility, counting_mode
  ) values (
    p_group_id, v_uid, btrim(p_name), public.generate_join_code(), p_game_date,
    p_planned_start_at, p_planned_end_at, p_buy_in_agorot, p_chips_per_buy_in,
    p_max_buy_ins, p_join_mode::public.join_mode, p_player_visibility::public.player_visibility,
    p_counting_mode::public.counting_mode
  )
  returning * into v_table;

  if p_admin_plays then
    select coalesce(nullif(btrim(pr.display_name), ''), 'מנהל השולחן')
      into v_name from public.profiles pr where pr.id = v_uid;

    insert into public.table_players (table_id, user_id, display_name, status, is_admin, approved_at)
    values (v_table.id, v_uid, coalesce(v_name, 'מנהל השולחן'), 'ACTIVE', true, now())
    returning id into v_player;

    perform public.internal_add_buyin(v_player, 'INITIAL_BUYIN', null, v_uid);
  end if;

  return v_table;
end;
$$;

-- ---------------------------------------------------------------------------
-- internal_add_buyin — the ONLY path that creates positive ledger rows.
-- Takes a row lock on the player so concurrent approvals cannot exceed the
-- configured maximum, and re-reads totals from the ledger inside the lock.
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

-- ---------------------------------------------------------------------------
-- Public table preview by join code (no membership required, minimal fields)
-- ---------------------------------------------------------------------------
create or replace function public.get_table_preview(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_table public.poker_tables;
  v_admin text;
  v_count int;
begin
  select * into v_table from public.poker_tables
   where join_code = upper(btrim(p_code));
  if not found then
    raise exception 'TABLE_NOT_FOUND';
  end if;

  select display_name into v_admin from public.profiles where id = v_table.owner_id;
  select count(*) into v_count from public.table_players
   where table_id = v_table.id and status = 'ACTIVE';

  return jsonb_build_object(
    'id', v_table.id,
    'name', v_table.name,
    'join_code', v_table.join_code,
    'status', v_table.status,
    'join_mode', v_table.join_mode,
    'planned_start_at', v_table.planned_start_at,
    'planned_end_at', v_table.planned_end_at,
    'buy_in_agorot', v_table.buy_in_agorot,
    'chips_per_buy_in', v_table.chips_per_buy_in,
    'admin_name', coalesce(v_admin, 'מנהל השולחן'),
    'player_count', v_count,
    'already_joined', exists (
      select 1 from public.table_players tp
      where tp.table_id = v_table.id and tp.user_id = auth.uid()
        and tp.status in ('PENDING', 'ACTIVE')
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Joining
-- ---------------------------------------------------------------------------
create or replace function public.join_table(p_code text, p_display_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := public.require_uid();
  v_table  public.poker_tables;
  v_player public.table_players;
  v_name   text := btrim(p_display_name);
  v_status public.player_status;
begin
  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'INVALID_NAME';
  end if;

  select * into v_table from public.poker_tables
   where join_code = upper(btrim(p_code)) for update;
  if not found then
    raise exception 'TABLE_NOT_FOUND';
  end if;

  -- Already at this table? Return the existing seat (idempotent re-join).
  select * into v_player from public.table_players
   where table_id = v_table.id and user_id = v_uid;
  if found then
    if v_player.status in ('REJECTED', 'REMOVED') then
      raise exception 'NOT_AUTHORIZED';
    end if;
    return jsonb_build_object('table_id', v_table.id, 'table_player_id', v_player.id, 'status', v_player.status);
  end if;

  if v_table.status not in ('WAITING', 'ACTIVE') then
    raise exception 'TABLE_CLOSED';
  end if;

  if exists (
    select 1 from public.table_players tp
    where tp.table_id = v_table.id
      and lower(btrim(tp.display_name)) = lower(v_name)
      and tp.status in ('PENDING', 'ACTIVE')
  ) then
    raise exception 'NAME_TAKEN';
  end if;

  v_status := case when v_table.join_mode = 'AUTO_JOIN' then 'ACTIVE' else 'PENDING' end;

  insert into public.table_players (table_id, user_id, display_name, status, approved_at)
  values (v_table.id, v_uid, v_name, v_status,
          case when v_status = 'ACTIVE' then now() else null end)
  returning * into v_player;

  if v_status = 'ACTIVE' then
    perform public.internal_add_buyin(v_player.id, 'INITIAL_BUYIN', null, v_uid);
  end if;

  return jsonb_build_object('table_id', v_table.id, 'table_player_id', v_player.id, 'status', v_status);
end;
$$;

create or replace function public.resolve_join_request(p_table_player uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := public.require_uid();
  v_player public.table_players;
begin
  select * into v_player from public.table_players where id = p_table_player for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  if not public.is_table_admin(v_player.table_id) then raise exception 'NOT_AUTHORIZED'; end if;

  if v_player.status <> 'PENDING' then
    raise exception 'REQUEST_ALREADY_HANDLED';
  end if;

  if p_approve then
    update public.table_players
       set status = 'ACTIVE', approved_at = now()
     where id = p_table_player;
    perform public.internal_add_buyin(p_table_player, 'INITIAL_BUYIN', null, v_uid);
  else
    update public.table_players set status = 'REJECTED' where id = p_table_player;
  end if;
end;
$$;

create or replace function public.remove_player(p_table_player uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_player public.table_players;
  v_table  public.poker_tables;
begin
  perform public.require_uid();
  select * into v_player from public.table_players where id = p_table_player for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  if not public.is_table_admin(v_player.table_id) then raise exception 'NOT_AUTHORIZED'; end if;

  select * into v_table from public.poker_tables where id = v_player.table_id;
  if v_table.status in ('COUNTING', 'COMPLETED') then
    raise exception 'GAME_LOCKED';
  end if;
  if exists (select 1 from public.buyin_transactions where table_player_id = p_table_player) then
    raise exception 'PLAYER_HAS_TRANSACTIONS';
  end if;

  update public.table_players set status = 'REMOVED' where id = p_table_player;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rebuys
-- ---------------------------------------------------------------------------
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

create or replace function public.cancel_rebuy_request(p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.require_uid();
  v_req public.rebuy_requests;
  v_player public.table_players;
begin
  select * into v_req from public.rebuy_requests where id = p_request for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_req.status <> 'PENDING' then raise exception 'REQUEST_ALREADY_HANDLED'; end if;

  select * into v_player from public.table_players where id = v_req.table_player_id;
  if v_player.user_id is distinct from v_uid and not public.is_table_admin(v_req.table_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  update public.rebuy_requests
     set status = 'CANCELLED', resolved_at = now(), resolved_by = v_uid
   where id = p_request;
end;
$$;

-- Atomic and idempotent: the PENDING check happens under a row lock, and the
-- resulting ledger row is uniquely keyed by request_id, so a double-click (or
-- two admins tapping at once) can never produce two buy-ins.
create or replace function public.resolve_rebuy_request(p_request uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.require_uid();
  v_req public.rebuy_requests;
begin
  select * into v_req from public.rebuy_requests where id = p_request for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if not public.is_table_admin(v_req.table_id) then raise exception 'NOT_AUTHORIZED'; end if;
  if v_req.status <> 'PENDING' then raise exception 'REQUEST_ALREADY_HANDLED'; end if;

  if p_approve then
    perform public.internal_add_buyin(v_req.table_player_id, 'REBUY', v_req.id, v_uid);
    update public.rebuy_requests
       set status = 'APPROVED', resolved_at = now(), resolved_by = v_uid
     where id = p_request;
  else
    update public.rebuy_requests
       set status = 'REJECTED', resolved_at = now(), resolved_by = v_uid
     where id = p_request;
  end if;
end;
$$;

create or replace function public.admin_add_buyin(p_table_player uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := public.require_uid();
  v_player public.table_players;
begin
  select * into v_player from public.table_players where id = p_table_player;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  if not public.is_table_admin(v_player.table_id) then raise exception 'NOT_AUTHORIZED'; end if;

  perform public.internal_add_buyin(p_table_player, 'REBUY', null, v_uid);
end;
$$;

-- Corrections are reversals, never edits. Uniquely keyed so one transaction
-- can only be reversed once.
create or replace function public.reverse_buyin(p_transaction uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.require_uid();
  v_tx  public.buyin_transactions;
  v_table public.poker_tables;
begin
  select * into v_tx from public.buyin_transactions where id = p_transaction for update;
  if not found then raise exception 'TRANSACTION_NOT_FOUND'; end if;
  if not public.is_table_admin(v_tx.table_id) then raise exception 'NOT_AUTHORIZED'; end if;
  if v_tx.type = 'REVERSAL' then raise exception 'INVALID_INPUT'; end if;

  select * into v_table from public.poker_tables where id = v_tx.table_id;
  if v_table.status not in ('WAITING', 'ACTIVE') then raise exception 'GAME_LOCKED'; end if;

  if exists (select 1 from public.buyin_transactions where reverses_transaction_id = p_transaction) then
    raise exception 'ALREADY_REVERSED';
  end if;

  insert into public.buyin_transactions (
    table_id, table_player_id, type, amount_agorot, chips, reverses_transaction_id, note, created_by
  ) values (
    v_tx.table_id, v_tx.table_player_id, 'REVERSAL',
    -v_tx.amount_agorot, -v_tx.chips, p_transaction, p_note, v_uid
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Game state and timing
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
         counting_started_at = case when v_next = 'COUNTING' then now() else counting_started_at end
   where id = p_table;

  -- Entering COUNTING closes out any open rebuy requests.
  if v_next = 'COUNTING' then
    update public.rebuy_requests
       set status = 'CANCELLED', resolved_at = now()
     where table_id = p_table and status = 'PENDING';
  end if;
end;
$$;

create or replace function public.extend_game(
  p_table uuid, p_minutes integer default null, p_new_end timestamptz default null
) returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_table public.poker_tables;
  v_end   timestamptz;
begin
  perform public.require_uid();
  select * into v_table from public.poker_tables where id = p_table for update;
  if not found then raise exception 'TABLE_NOT_FOUND'; end if;
  if not public.is_table_admin(p_table) then raise exception 'NOT_AUTHORIZED'; end if;
  if v_table.status in ('COMPLETED', 'CANCELLED') then raise exception 'GAME_LOCKED'; end if;

  if p_new_end is not null then
    v_end := p_new_end;
  elsif p_minutes is not null then
    -- Extend from now when the deadline already passed, otherwise from the deadline.
    v_end := greatest(v_table.planned_end_at, now()) + make_interval(mins => p_minutes);
  else
    raise exception 'INVALID_INPUT';
  end if;

  if v_end <= v_table.planned_start_at then raise exception 'INVALID_INPUT'; end if;

  update public.poker_tables set planned_end_at = v_end where id = p_table;
  return v_end;
end;
$$;

create or replace function public.update_table_settings(
  p_table             uuid,
  p_name              text default null,
  p_max_buy_ins       integer default null,
  p_join_mode         text default null,
  p_player_visibility text default null,
  p_counting_mode     text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_table public.poker_tables;
  v_min   int;
begin
  perform public.require_uid();
  select * into v_table from public.poker_tables where id = p_table for update;
  if not found then raise exception 'TABLE_NOT_FOUND'; end if;
  if not public.is_table_admin(p_table) then raise exception 'NOT_AUTHORIZED'; end if;
  if v_table.status in ('COMPLETED', 'CANCELLED') then raise exception 'GAME_LOCKED'; end if;

  if p_max_buy_ins is not null then
    -- Never lower the cap below what players have already been issued.
    select coalesce(max(buy_in_count), 0) into v_min
      from public.table_player_totals where table_id = p_table;
    if p_max_buy_ins < v_min then raise exception 'MAX_BELOW_ISSUED'; end if;
  end if;

  update public.poker_tables set
    name              = coalesce(btrim(p_name), name),
    max_buy_ins       = coalesce(p_max_buy_ins, max_buy_ins),
    join_mode         = coalesce(p_join_mode::public.join_mode, join_mode),
    player_visibility = coalesce(p_player_visibility::public.player_visibility, player_visibility),
    counting_mode     = coalesce(p_counting_mode::public.counting_mode, counting_mode)
  where id = p_table;
end;
$$;

-- ---------------------------------------------------------------------------
-- Chip counting
-- ---------------------------------------------------------------------------
create or replace function public.submit_chip_count(p_table_player uuid, p_chips integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := public.require_uid();
  v_player public.table_players;
  v_table  public.poker_tables;
begin
  if p_chips is null or p_chips < 0 then raise exception 'INVALID_INPUT'; end if;

  select * into v_player from public.table_players where id = p_table_player;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  if v_player.user_id is distinct from v_uid then raise exception 'NOT_AUTHORIZED'; end if;

  select * into v_table from public.poker_tables where id = v_player.table_id;
  if v_table.status <> 'COUNTING' then raise exception 'INVALID_STATUS'; end if;

  insert into public.chip_count_submissions (table_id, table_player_id, submitted_chips, submitted_by, submitted_at)
  values (v_player.table_id, p_table_player, p_chips, v_uid, now())
  on conflict (table_player_id) do update
    set submitted_chips = excluded.submitted_chips,
        submitted_by    = excluded.submitted_by,
        submitted_at    = now();
end;
$$;

-- Admin entry (ADMIN_COUNT mode) and admin correction/approval (SELF_COUNT).
create or replace function public.admin_set_chip_count(p_table_player uuid, p_chips integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := public.require_uid();
  v_player public.table_players;
  v_table  public.poker_tables;
begin
  if p_chips is null or p_chips < 0 then raise exception 'INVALID_INPUT'; end if;

  select * into v_player from public.table_players where id = p_table_player;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  if not public.is_table_admin(v_player.table_id) then raise exception 'NOT_AUTHORIZED'; end if;

  select * into v_table from public.poker_tables where id = v_player.table_id;
  if v_table.status <> 'COUNTING' then raise exception 'INVALID_STATUS'; end if;

  insert into public.chip_count_submissions (
    table_id, table_player_id, submitted_chips, submitted_by, submitted_at,
    approved_chips, approved_by, approved_at
  ) values (
    v_player.table_id, p_table_player, p_chips, v_uid, now(), p_chips, v_uid, now()
  )
  on conflict (table_player_id) do update
    set approved_chips  = excluded.approved_chips,
        approved_by     = excluded.approved_by,
        approved_at     = now(),
        submitted_chips = coalesce(public.chip_count_submissions.submitted_chips, excluded.submitted_chips),
        submitted_by    = coalesce(public.chip_count_submissions.submitted_by, excluded.submitted_by),
        submitted_at    = coalesce(public.chip_count_submissions.submitted_at, now());
end;
$$;

-- Approve every self-submitted count as-is.
create or replace function public.approve_all_chip_counts(p_table uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.require_uid();
  v_n   int;
begin
  if not public.is_table_admin(p_table) then raise exception 'NOT_AUTHORIZED'; end if;
  if (select status from public.poker_tables where id = p_table) <> 'COUNTING' then
    raise exception 'INVALID_STATUS';
  end if;

  update public.chip_count_submissions
     set approved_chips = submitted_chips, approved_by = v_uid, approved_at = now()
   where table_id = p_table and submitted_chips is not null
     and approved_chips is distinct from submitted_chips;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
