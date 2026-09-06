-- ===========================================================================
-- 0018 — players the admin adds by name.
--
-- Somebody sits down who has no account and does not want one. Until now the
-- only way into a table was `join_table`, which needs a session, so that person
-- either had to make a guest account or be left out of the maths entirely.
--
-- WHAT THIS IS
--
-- One more column on `table_players`, and one function that writes a row. A
-- manual player is a participant of *this table* and nothing else: no auth
-- user, no profile, no friendship, no notification, no push subscription, no
-- leaderboard entry. They exist where the game is, and nowhere above it.
--
-- WHY A FLAG RATHER THAN "user_id IS NULL"
--
-- `user_id` is already nullable, and already null in a case that has nothing to
-- do with this one: the column is `on delete set null`, so deleting an account
-- leaves that person's old seats pointing at nobody. Those are real people who
-- really played. Reading "no account" as "added by hand" would relabel their
-- history. The flag says which is which; the check constraint below makes the
-- other direction — a manual player who somehow has an account — impossible to
-- represent at all.
--
-- WHY NO SEPARATE TABLE
--
-- Every buy-in, chip count, settlement row and game result addresses a
-- participant by `table_players.id`. A second participant table would have to
-- be joined into all of them, which is a second game engine to keep in step
-- with the first. Extending the row that already means "someone in this game"
-- costs one column and changes no arithmetic.
-- ===========================================================================

alter table public.table_players
  add column if not exists is_manual boolean not null default false;

-- A manual player has no account, by construction rather than by convention.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'table_players_manual_has_no_account'
       and conrelid = 'public.table_players'::regclass
  ) then
    alter table public.table_players
      add constraint table_players_manual_has_no_account
      check (not is_manual or user_id is null);
  end if;
end $$;

-- "Who at this table was added by hand" is asked once per table screen, and
-- only ever alongside the table id the roster is already filtered by, so the
-- existing table_players_table_idx serves it. No new index.

-- ---------------------------------------------------------------------------
-- Adding one.
--
-- The only new write in this migration. Everything it does after the insert —
-- the initial buy-in, the chips that go with it — is the same call `join_table`
-- makes, so a manual player is in the game on exactly the terms everybody else
-- is.
-- ---------------------------------------------------------------------------
create or replace function public.add_manual_player(p_table uuid, p_display_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := public.require_uid();
  v_table  public.poker_tables;
  v_name   text := btrim(coalesce(p_display_name, ''));
  v_player public.table_players;
begin
  -- Membership first, so this cannot be used to find out which table ids are
  -- real: an id that does not exist and one that is not yours refuse alike.
  if not public.is_table_admin(p_table) then raise exception 'NOT_AUTHORIZED'; end if;

  select * into v_table from public.poker_tables where id = p_table for update;
  if not found then raise exception 'TABLE_NOT_FOUND'; end if;
  if v_table.status not in ('WAITING', 'ACTIVE') then raise exception 'GAME_LOCKED'; end if;

  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'INVALID_NAME';
  end if;

  -- The same rule a join has to satisfy, and the same wording: two people
  -- called the same thing at one table cannot be told apart on the counting
  -- screen, which is where it would matter most.
  if exists (
    select 1 from public.table_players tp
     where tp.table_id = p_table
       and lower(btrim(tp.display_name)) = lower(v_name)
       and tp.status in ('PENDING', 'ACTIVE')
  ) then
    raise exception 'NAME_TAKEN';
  end if;

  -- Seated straight away. There is nobody to approve, and nobody to wait: the
  -- admin adding them *is* the approval, so the join mode has nothing to
  -- decide here.
  insert into public.table_players (table_id, user_id, display_name, status, is_manual, approved_at)
  values (p_table, null, left(v_name, 40), 'ACTIVE', true, now())
  returning * into v_player;

  -- The entry they just took chips for, through the same function every other
  -- buy-in goes through — so the ledger, the pot and the reversal rules all
  -- treat it identically. Recorded as the admin's action, because it was.
  perform public.internal_add_buyin(v_player.id, 'INITIAL_BUYIN', null, v_uid);

  return jsonb_build_object(
    'table_player_id', v_player.id,
    'display_name', v_player.display_name);
end;
$$;

grant execute on function public.add_manual_player(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Taking one off again.
--
-- `remove_player` refuses anybody who has *ever* had a ledger row. Adding a
-- manual player charges their entry immediately — the same entry `join_table`
-- charges — so under that rule a name typed wrongly could never be taken off
-- the roster again, only left in the game paying for chips nobody held.
--
-- The rule it should have been, and now is: you cannot remove somebody whose
-- money is still in the game. An entry that has been reversed is not in the
-- game. This is the same sentence for a registered player, who had the same
-- trap: reverse their only buy-in and they were still stuck to the table.
--
-- Everything else about the function is untouched: admin only, not once the
-- counting has started, and the seat is marked REMOVED rather than deleted, so
-- the reversed ledger stays as a record of what happened.
-- ---------------------------------------------------------------------------
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

  if exists (
    select 1 from public.buyin_transactions bt
     where bt.table_player_id = p_table_player
       and bt.type in ('INITIAL_BUYIN', 'REBUY')
       and not exists (
         select 1 from public.buyin_transactions r
          where r.reverses_transaction_id = bt.id
       )
  ) then
    raise exception 'PLAYER_HAS_TRANSACTIONS';
  end if;

  update public.table_players set status = 'REMOVED' where id = p_table_player;
end;
$$;

-- ---------------------------------------------------------------------------
-- Verify, so a partial apply fails loudly rather than looking successful.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'table_players'
       and column_name = 'is_manual'
  ) then
    raise exception '0018 failed: table_players.is_manual is missing';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'table_players_manual_has_no_account'
       and conrelid = 'public.table_players'::regclass
  ) then
    raise exception '0018 failed: a manual player could be given an account';
  end if;

  if to_regprocedure('public.add_manual_player(uuid,text)') is null then
    raise exception '0018 failed: add_manual_player is missing';
  end if;

  if not has_function_privilege('authenticated', 'public.add_manual_player(uuid,text)', 'EXECUTE') then
    raise exception '0018 failed: authenticated cannot execute add_manual_player';
  end if;

  -- The seat is only ever written by the function above. Clients hold SELECT
  -- and nothing else on this table (0004), and that is what stops a browser
  -- inserting a seat, or flipping is_manual on somebody else's.
  if has_table_privilege('authenticated', 'public.table_players', 'INSERT')
     or has_table_privilege('authenticated', 'public.table_players', 'UPDATE')
     or has_table_privilege('authenticated', 'public.table_players', 'DELETE') then
    raise exception '0018 failed: authenticated must not write table_players directly';
  end if;

  raise notice 'manual players verified: admin-only to add, no account, table-scoped';
end;
$$;
