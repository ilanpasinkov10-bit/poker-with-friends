-- ===========================================================================
-- End-to-end verification of the database layer against a real PostgreSQL.
--
-- Every check that matters for money or authorization is asserted here, so a
-- change to a migration cannot quietly break the guarantees the app relies on.
-- Run with: npm run test:db
-- ===========================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset pager off

create or replace function test_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user)::text, false);
end;
$$;

-- Asserts a statement fails with an exact machine code.
create or replace function expect_error(p_sql text, p_code text, p_label text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_code then
      raise notice 'ok    % (%)', p_label, p_code;
      return;
    end if;
    raise exception 'FAIL  %: expected %, got %', p_label, p_code, sqlerrm;
  end;
  raise exception 'FAIL  %: expected % but the call succeeded', p_label, p_code;
end;
$$;

create or replace function expect(p_condition boolean, p_label text)
returns void language plpgsql as $$
begin
  if not p_condition then raise exception 'FAIL  %', p_label; end if;
  raise notice 'ok    %', p_label;
end;
$$;

insert into auth.users (id, email, raw_user_meta_data, is_anonymous) values
  ('a0000000-0000-4000-8000-000000000001', 'ilan@example.com',  '{"display_name":"אילן"}',  false),
  ('a0000000-0000-4000-8000-000000000002', 'shay@example.com',  '{"display_name":"שי"}',    false),
  ('a0000000-0000-4000-8000-000000000003', 'michal@example.com','{"display_name":"מיכל"}',  false),
  ('a0000000-0000-4000-8000-000000000004', null,                '{"display_name":"דניאל"}', true),
  ('a0000000-0000-4000-8000-000000000005', null,                '{"display_name":"רועי"}',  true);

\echo '── profiles ──'
do $$
begin
  perform expect((select count(*) from public.profiles) = 5,
                 'a profile is created for every auth user');
  perform expect((select count(*) from public.profile_privacy_settings) = 5,
                 'privacy settings default for every profile');
  perform expect((select count(*) from public.profiles where is_guest) = 2,
                 'anonymous users are flagged as guests');
end $$;

\echo '── table creation and joining ──'
do $$
declare t public.poker_tables; code text;
begin
  perform test_as('a0000000-0000-4000-8000-000000000001');
  t := public.create_poker_table('פוקר של יום חמישי', current_date, now(),
        now() + interval '4 hours', 5000, 500, 6, 'AUTO_JOIN', 'OPEN', 'ADMIN_COUNT', true);
  code := t.join_code;

  perform expect(code ~ '^[A-Z0-9]{5}$', 'a five-character join code is generated');
  perform expect((select count(*) from public.table_players
                   where table_id = t.id and is_admin) = 1,
                 'an admin who plays gets a seat');
  perform expect((select count(*) from public.buyin_transactions where table_id = t.id) = 1,
                 'the first seat receives its initial buy-in');

  perform test_as('a0000000-0000-4000-8000-000000000002');
  perform expect((public.join_table(code, 'שי') ->> 'status') = 'ACTIVE',
                 'AUTO_JOIN seats a player immediately');
  perform test_as('a0000000-0000-4000-8000-000000000003');
  perform public.join_table(code, 'מיכל');
  perform test_as('a0000000-0000-4000-8000-000000000004');
  perform public.join_table(code, 'דניאל');
  perform test_as('a0000000-0000-4000-8000-000000000005');
  perform public.join_table(code, 'רועי');

  perform expect((select sum(total_paid_agorot) from public.table_player_totals) = 25000
             and (select sum(chips_issued)      from public.table_player_totals) = 2500,
                 'totals are derived from the ledger (5 entries = 250₪ / 2,500 chips)');
end $$;

\echo '── a player may never approve their own rebuy ──'
do $$
declare daniel uuid := 'a0000000-0000-4000-8000-000000000004'; seat uuid; req uuid;
begin
  select id into seat from public.table_players where user_id = daniel;
  perform test_as(daniel);
  req := public.request_rebuy(seat);

  perform expect_error(format('select public.resolve_rebuy_request(%L, true)', req),
    'NOT_AUTHORIZED', 'a player cannot approve their own rebuy');
  perform expect_error(format('select public.request_rebuy(%L)',
    (select id from public.table_players where user_id = 'a0000000-0000-4000-8000-000000000002')),
    'NOT_AUTHORIZED', 'a player cannot request a rebuy for someone else');
end $$;

\echo '── repeated approval cannot double-charge ──'
do $$
declare seat uuid; req uuid; n int; paid int;
begin
  select id into seat from public.table_players
   where user_id = 'a0000000-0000-4000-8000-000000000004';
  select id into req from public.rebuy_requests
   where table_player_id = seat and status = 'PENDING';

  perform test_as('a0000000-0000-4000-8000-000000000001');
  perform public.resolve_rebuy_request(req, true);
  select count(*), sum(amount_agorot) into n, paid
    from public.buyin_transactions where table_player_id = seat;
  perform expect(n = 2 and paid = 10000, 'approval adds exactly one entry (100₪ total)');

  perform expect_error(format('select public.resolve_rebuy_request(%L, true)', req),
    'REQUEST_ALREADY_HANDLED', 'the same request cannot be approved twice');

  select count(*), sum(amount_agorot) into n, paid
    from public.buyin_transactions where table_player_id = seat;
  perform expect(n = 2 and paid = 10000, 'the ledger is unchanged by the second approval');
end $$;

\echo '── the maximum number of entries is enforced ──'
do $$
declare seat uuid; i int;
begin
  select id into seat from public.table_players
   where user_id = 'a0000000-0000-4000-8000-000000000004';
  perform test_as('a0000000-0000-4000-8000-000000000001');
  for i in 3..6 loop perform public.admin_add_buyin(seat); end loop;

  perform expect((select buy_in_count from public.table_player_totals
                   where table_player_id = seat) = 6, 'six entries are allowed');
  perform expect_error(format('select public.admin_add_buyin(%L)', seat),
    'MAX_BUYINS_REACHED', 'the seventh entry is refused');

  perform test_as('a0000000-0000-4000-8000-000000000004');
  perform expect_error(format('select public.request_rebuy(%L)', seat),
    'MAX_BUYINS_REACHED', 'a player at the cap cannot even request one');
end $$;

\echo '── only the table owner may administer the game ──'
do $$
declare t uuid;
begin
  select id into t from public.poker_tables limit 1;
  perform test_as('a0000000-0000-4000-8000-000000000002');
  perform expect_error(format('select public.set_table_status(%L, ''COUNTING'')', t),
    'NOT_AUTHORIZED', 'a player cannot change the game state');
  perform expect_error(format('select public.extend_game(%L, 30)', t),
    'NOT_AUTHORIZED', 'a player cannot extend the game');
  perform expect_error(format('select public.update_table_settings(%L, ''hacked'')', t),
    'NOT_AUTHORIZED', 'a player cannot change table settings');
  perform expect_error(format('select public.finalize_game(%L, ''[]''::jsonb)', t),
    'NOT_AUTHORIZED', 'a player cannot finalise the game');

  perform test_as('a0000000-0000-4000-8000-000000000005');
  perform expect(not public.is_table_admin(t) and public.is_table_member(t),
    'joining by code makes a member, never an admin');
end $$;

\echo '── the game state machine ──'
do $$
declare t uuid;
begin
  select id into t from public.poker_tables limit 1;
  perform test_as('a0000000-0000-4000-8000-000000000001');
  perform expect_error(format('select public.set_table_status(%L, ''COUNTING'')', t),
    'INVALID_TRANSITION', 'WAITING cannot jump straight to COUNTING');
  perform expect_error(format('select public.set_table_status(%L, ''COMPLETED'')', t),
    'INVALID_TRANSITION', 'COMPLETED is unreachable without finalising');

  perform public.set_table_status(t, 'ACTIVE');
  perform public.set_table_status(t, 'COUNTING');
  perform expect((select status from public.poker_tables where id = t) = 'COUNTING',
    'WAITING → ACTIVE → COUNTING is allowed');
end $$;

\echo '── chip counting and finalisation ──'
do $$
declare t uuid; seat uuid; r record; winner uuid; loser uuid; plan jsonb;
begin
  select id into t from public.poker_tables limit 1;
  perform test_as('a0000000-0000-4000-8000-000000000001');

  select id into seat from public.table_players
   where user_id = 'a0000000-0000-4000-8000-000000000002';
  perform expect_error(format('select public.admin_add_buyin(%L)', seat),
    'GAME_LOCKED', 'buy-ins are closed once counting starts');

  perform expect_error(format('select public.finalize_game(%L, ''[]''::jsonb)', t),
    'MISSING_CHIP_COUNTS', 'finalising before everyone has counted');

  for r in select tp.id, tot.chips_issued from public.table_players tp
             join public.table_player_totals tot on tot.table_player_id = tp.id
            where tp.table_id = t and tp.status = 'ACTIVE' loop
    perform public.admin_set_chip_count(r.id, r.chips_issued);
  end loop;

  select tp.id into seat from public.table_players tp where tp.table_id = t limit 1;
  perform public.admin_set_chip_count(seat,
    (select chips_issued from public.table_player_totals where table_player_id = seat) - 100);
  perform expect_error(format('select public.finalize_game(%L, ''[]''::jsonb)', t),
    'CHIP_MISMATCH', 'a 100-chip shortfall blocks finalisation');

  -- Balance the count, moving 500 chips from one player to another.
  for r in select tp.id, tot.chips_issued from public.table_players tp
             join public.table_player_totals tot on tot.table_player_id = tp.id
            where tp.table_id = t and tp.status = 'ACTIVE' loop
    perform public.admin_set_chip_count(r.id, r.chips_issued);
  end loop;

  select (array_agg(id order by joined_at))[1], (array_agg(id order by joined_at))[2]
    into winner, loser
    from public.table_players where table_id = t and status = 'ACTIVE';

  perform public.admin_set_chip_count(winner,
    (select chips_issued from public.table_player_totals where table_player_id = winner) + 500);
  perform public.admin_set_chip_count(loser,
    (select chips_issued from public.table_player_totals where table_player_id = loser) - 500);

  perform expect_error(format('select public.finalize_game(%L, %L::jsonb)', t,
    json_build_array(json_build_object('from', loser, 'to', winner, 'amount', 1))::text),
    'INVALID_SETTLEMENT', 'a plan that does not resolve every balance is rejected');

  plan := json_build_array(json_build_object('from', loser, 'to', winner, 'amount', 5000))::jsonb;
  perform public.finalize_game(t, plan);

  perform expect((select status from public.poker_tables where id = t) = 'COMPLETED',
    'the game reaches COMPLETED through finalize_game');
  perform expect((select sum(profit_loss_agorot) from public.game_results where table_id = t) = 0,
    'profit and loss sum to exactly zero');
  perform expect((select count(*) from public.settlements where table_id = t) = 1,
    'the transfer plan is stored');

  perform expect_error(format('select public.finalize_game(%L, ''[]''::jsonb)', t),
    'ALREADY_COMPLETED', 'a finished game cannot be finalised again');
  perform expect_error(format('select public.set_table_status(%L, ''ACTIVE'')', t),
    'INVALID_TRANSITION', 'a finished game cannot be reopened');
end $$;

\echo '── row level security ──'
do $$
declare t public.poker_tables; code text;
begin
  perform test_as('a0000000-0000-4000-8000-000000000001');
  t := public.create_poker_table('שולחן פרטי', current_date, now(),
        now() + interval '3 hours', 5000, 500, 6, 'AUTO_JOIN', 'PRIVATE', 'ADMIN_COUNT', true);
  code := t.join_code;
  perform test_as('a0000000-0000-4000-8000-000000000002');
  perform public.join_table(code, 'שי');
  perform test_as('a0000000-0000-4000-8000-000000000003');
  perform public.join_table(code, 'מיכל');
end $$;

-- These run as the real `authenticated` role, which does not bypass RLS.
do $$
declare t uuid; admin_rows int; member_rows int; outsider_rows int;
begin
  select id into t from public.poker_tables where name = 'שולחן פרטי';

  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001"}', true);
  select count(*) into admin_rows from public.buyin_transactions where table_id = t;

  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002"}', true);
  select count(*) into member_rows from public.buyin_transactions where table_id = t;

  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000005"}', true);
  select count(*) into outsider_rows from public.buyin_transactions where table_id = t;
  reset role;

  perform expect(admin_rows = 3, 'the admin sees every ledger row at a PRIVATE table');
  perform expect(member_rows = 1, 'a player at a PRIVATE table sees only their own rows');
  perform expect(outsider_rows = 0, 'a non-member sees nothing');
end $$;

\echo '── clients cannot write directly ──'
do $$
declare t uuid; seat uuid; other uuid; changed int;
begin
  select id into t from public.poker_tables where name = 'שולחן פרטי';
  select id into seat from public.table_players
   where table_id = t and user_id = 'a0000000-0000-4000-8000-000000000002';
  select id into other from public.table_players
   where table_id = t and user_id <> 'a0000000-0000-4000-8000-000000000002' limit 1;

  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002"}', true);

  perform expect_error(
    format('insert into public.buyin_transactions (table_id, table_player_id, type, amount_agorot, chips) values (%L,%L,''REBUY'',5000,500)', t, seat),
    'permission denied for table buyin_transactions', 'a player cannot insert a buy-in');
  perform expect_error(
    format('update public.table_players set is_admin = true where id = %L', seat),
    'permission denied for table table_players', 'a player cannot make themselves admin');
  perform expect_error(
    format('update public.poker_tables set buy_in_agorot = 1 where id = %L', t),
    'permission denied for table poker_tables', 'a player cannot change the buy-in price');
  perform expect_error(
    'update public.rebuy_requests set status = ''APPROVED''',
    'permission denied for table rebuy_requests', 'a player cannot approve requests directly');

  -- Profile updates ARE granted, but RLS narrows them to the caller's own row.
  with upd as (update public.profiles set display_name = 'pwned'
               where id <> 'a0000000-0000-4000-8000-000000000002' returning 1)
  select count(*) into changed from upd;
  reset role;
  perform expect(changed = 0, 'a profile update cannot reach another user''s row');
end $$;

\echo '── deleting a table that never started ──'
do $$
declare
  admin  uuid := 'a0000000-0000-4000-8000-000000000001';
  other  uuid := 'a0000000-0000-4000-8000-000000000002';
  t_new  public.poker_tables;
  t_done uuid;
  seats  int;
begin
  perform test_as(admin);
  t_new := public.create_poker_table('שולחן למחיקה', current_date, now(),
             now() + interval '3 hours', 5000, 500, 6, 'AUTO_JOIN', 'OPEN', 'ADMIN_COUNT', true);

  -- Someone else's table is never deletable, whatever they hold.
  perform test_as(other);
  perform expect_error(format('select public.delete_poker_table(%L)', t_new.id),
    'NOT_AUTHORIZED', 'a user cannot delete another user''s table');

  -- A finished game must never be erased by this path.
  select id into t_done from public.poker_tables where status = 'COMPLETED' limit 1;
  perform test_as(admin);
  perform expect_error(format('select public.delete_poker_table(%L)', t_done),
    'GAME_ALREADY_STARTED', 'a completed game cannot be deleted');

  -- Nor can a game that is merely under way.
  perform public.set_table_status(t_new.id, 'ACTIVE');
  perform expect_error(format('select public.delete_poker_table(%L)', t_new.id),
    'GAME_ALREADY_STARTED', 'a started game cannot be deleted');

  -- An unknown id fails safely rather than doing anything surprising.
  perform expect_error(
    'select public.delete_poker_table(''00000000-0000-4000-8000-000000000000'')',
    'TABLE_NOT_FOUND', 'an unknown table id is refused');

  -- The permitted case: still WAITING, never started.
  t_new := public.create_poker_table('שולחן זמני', current_date, now(),
             now() + interval '3 hours', 5000, 500, 6, 'AUTO_JOIN', 'OPEN', 'ADMIN_COUNT', true);
  select count(*) into seats from public.table_players where table_id = t_new.id;
  perform expect(seats = 1, 'the throwaway table has a seat before deletion');

  perform public.delete_poker_table(t_new.id);
  perform expect((select count(*) from public.poker_tables where id = t_new.id) = 0,
    'the owner can delete a table that never started');
  perform expect((select count(*) from public.table_players where table_id = t_new.id) = 0,
    'deleting cascades to its seats');
  perform expect((select count(*) from public.buyin_transactions where table_id = t_new.id) = 0,
    'deleting cascades to its ledger rows');
end $$;

\echo '── global leaderboard ──'
do $$
declare payload jsonb; rows_ jsonb; guest_rows int; ids text[];
begin
  perform test_as('a0000000-0000-4000-8000-000000000001');

  -- The board is opt-in: nobody appears until they ask to.
  payload := public.get_global_leaderboard('ALL', 100);
  perform expect(jsonb_array_length(payload -> 'rows') = 0,
    'the leaderboard is empty until players opt in');

  -- A player with no settings row at all must not slip through the default.
  delete from public.profile_privacy_settings
   where profile_id = 'a0000000-0000-4000-8000-000000000003';
  select array_agg(r ->> 'user_id') into ids
    from jsonb_array_elements(public.get_global_leaderboard('ALL', 100) -> 'rows') r;
  perform expect(not ('a0000000-0000-4000-8000-000000000003' = any(coalesce(ids, '{}'))),
    'a missing settings row is not a way onto the leaderboard');
  insert into public.profile_privacy_settings (profile_id)
  values ('a0000000-0000-4000-8000-000000000003')
  on conflict (profile_id) do nothing;

  -- Opting in — including two guests, who must still be excluded.
  update public.profile_privacy_settings set show_on_leaderboard = true
   where profile_id in (
     'a0000000-0000-4000-8000-000000000001',
     'a0000000-0000-4000-8000-000000000002',
     'a0000000-0000-4000-8000-000000000003',
     'a0000000-0000-4000-8000-000000000004',
     'a0000000-0000-4000-8000-000000000005'
   );

  rows_ := public.get_global_leaderboard('ALL', 100) -> 'rows';
  perform expect(jsonb_array_length(rows_) > 0, 'opted-in players are ranked');

  select count(*) into guest_rows
    from jsonb_array_elements(rows_) r
    join public.profiles pr on pr.id = (r ->> 'user_id')::uuid
   where pr.is_guest;
  perform expect(guest_rows = 0,
    'guests are excluded even after opting in');

  perform expect(
    (select bool_and(a >= b) from (
       select (r ->> 'net_agorot')::bigint as a,
              lead((r ->> 'net_agorot')::bigint) over () as b
       from jsonb_array_elements(rows_) r
     ) x where b is not null),
    'the leaderboard is ordered by lifetime profit');

  -- And opting back out removes a player again.
  update public.profile_privacy_settings
     set show_on_leaderboard = false
   where profile_id = 'a0000000-0000-4000-8000-000000000002';

  select array_agg(r ->> 'user_id') into ids
    from jsonb_array_elements(public.get_global_leaderboard('ALL', 100) -> 'rows') r;
  perform expect(not ('a0000000-0000-4000-8000-000000000002' = any(coalesce(ids, '{}'))),
    'a player who opts out is removed from the leaderboard');

  update public.profile_privacy_settings
     set show_on_leaderboard = true
   where profile_id = 'a0000000-0000-4000-8000-000000000002';
end $$;

\echo '── opting in does not widen anything else ──'
do $$
declare stranger uuid := 'a0000000-0000-4000-8000-000000000007'; p jsonb;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (stranger, 'nobody@example.com', '{"display_name":"עובר אורח"}')
  on conflict (id) do nothing;

  -- אילן is on the board, so a stranger may see the same aggregates it shows...
  perform test_as(stranger);
  p := public.get_public_profile('a0000000-0000-4000-8000-000000000001');
  perform expect((p ->> 'stats_visible')::boolean,
    'opting into the leaderboard makes those aggregates public');

  -- ...but never the per-game detail, which has its own switch.
  perform expect(not (p ->> 'history_visible')::boolean,
    'the leaderboard opt-in does not expose per-game history');
  perform expect(not (p::text ilike '%@example.com%'),
    'no email leaks to a stranger');
end $$;

\echo '── public profiles ──'
do $$
declare
  admin uuid := 'a0000000-0000-4000-8000-000000000001';
  other uuid := 'a0000000-0000-4000-8000-000000000003';
  guest uuid := 'a0000000-0000-4000-8000-000000000004';
  p jsonb;
begin
  perform test_as(admin);

  p := public.get_public_profile(admin);
  perform expect((p ->> 'is_self')::boolean, 'viewing yourself is marked as self');
  perform expect((p ->> 'stats_visible')::boolean, 'you always see your own statistics');

  -- No authentication identifier or contact detail may ever be returned.
  perform expect(not (p ? 'email'), 'a public profile carries no email');
  perform expect(not (p ? 'raw_user_meta_data'), 'a public profile carries no auth metadata');
  perform expect(not (p::text ilike '%@example.com%'), 'no email address leaks through any field');

  p := public.get_public_profile(other);
  perform expect((p ->> 'display_name') is not null, 'a shared-table player is viewable');
  perform expect(not (p::text ilike '%@example.com%'), 'no email leaks for another player');

  -- A guest shows as a guest and gets no invented history.
  p := public.get_public_profile(guest);
  perform expect((p ->> 'is_guest')::boolean, 'a guest is flagged as a guest');
  perform expect((p ->> 'member_since') is null, 'a guest has no join date shown');
  perform expect(jsonb_array_length(p -> 'recent_games') = 0,
    'no history is fabricated for a guest');
end $$;

\echo '── profile privacy is enforced ──'
do $$
declare
  viewer uuid := 'a0000000-0000-4000-8000-000000000002';
  target uuid := 'a0000000-0000-4000-8000-000000000003';
  p jsonb;
begin
  -- Detailed history stays hidden unless its owner shares it.
  perform test_as(viewer);
  p := public.get_public_profile(target);
  perform expect(not (p ->> 'history_visible')::boolean,
    'per-game history is hidden by default');
  perform expect(jsonb_array_length(p -> 'recent_games') = 0,
    'no games are listed while history is private');

  perform test_as(target);
  update public.profile_privacy_settings
     set share_detailed_history = true where profile_id = target;

  perform test_as(viewer);
  p := public.get_public_profile(target);
  perform expect((p ->> 'history_visible')::boolean,
    'history appears once its owner shares it');

  perform test_as(target);
  update public.profile_privacy_settings
     set share_detailed_history = false, show_on_leaderboard = false,
         share_stats_with_table_members = false
   where profile_id = target;

  -- Someone who shared a table still sees the person, but with every switch
  -- off they see no numbers.
  perform test_as(viewer);
  p := public.get_public_profile(target);
  perform expect((p ->> 'display_name') is not null,
    'a former opponent can still identify the player');
  perform expect(not (p ->> 'stats_visible')::boolean,
    'a former opponent sees no statistics once sharing is off');
  perform expect((p -> 'stats') = 'null'::jsonb,
    'the statistics payload is absent, not merely hidden in the UI');

  -- A true stranger — never at the same table — cannot reach it at all.
  insert into auth.users (id, email, raw_user_meta_data)
  values ('a0000000-0000-4000-8000-000000000006', 'stranger@example.com',
          '{"display_name":"זר"}')
  on conflict (id) do nothing;

  perform test_as('a0000000-0000-4000-8000-000000000006');
  perform expect_error(format('select public.get_public_profile(%L)', target),
    'NOT_AUTHORIZED', 'a fully private profile is unreachable by a stranger');

  perform test_as(target);
  update public.profile_privacy_settings
     set share_stats_with_table_members = true
   where profile_id = target;
end $$;

\echo '── guests cannot reach unrelated tables ──'
do $$
declare t uuid; visible int;
begin
  select id into t from public.poker_tables where name = 'שולחן פרטי';

  set local role authenticated;
  -- רועי never joined the private table.
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000005"}', true);
  select count(*) into visible from public.poker_tables where id = t;
  reset role;
  perform expect(visible = 0, 'a guest cannot see a table they were not invited to');

  perform test_as('a0000000-0000-4000-8000-000000000005');
  perform expect_error(format('select public.delete_poker_table(%L)', t),
    'NOT_AUTHORIZED', 'a guest cannot delete a table they do not own');
  perform expect_error(format('select public.set_table_status(%L, ''ACTIVE'')', t),
    'NOT_AUTHORIZED', 'a guest cannot drive a table they do not belong to');
end $$;

\echo '── leaving a game in progress ──'
do $$
declare
  admin  uuid := 'a0000000-0000-4000-8000-000000000001';
  leaver uuid := 'a0000000-0000-4000-8000-000000000002';
  other  uuid := 'a0000000-0000-4000-8000-000000000003';
  t      public.poker_tables;
  seat_admin uuid; seat_leaver uuid; seat_other uuid;
  paid_before int; issued_before int; pot_before int;
  paid_after int; pot_after int; counted int;
  rows_ int;
begin
  perform test_as(admin);
  t := public.create_poker_table('שולחן עזיבה', current_date, now(),
         now() + interval '4 hours', 5000, 500, 6, 'AUTO_JOIN', 'OPEN', 'ADMIN_COUNT', true);
  perform public.set_table_status(t.id, 'ACTIVE');

  perform test_as(leaver);
  perform public.join_table(t.join_code, 'שי');
  perform test_as(other);
  perform public.join_table(t.join_code, 'מיכל');

  select id into seat_admin  from public.table_players where table_id = t.id and user_id = admin;
  select id into seat_leaver from public.table_players where table_id = t.id and user_id = leaver;
  select id into seat_other  from public.table_players where table_id = t.id and user_id = other;

  -- The leaver takes two more entries: three in total, 150₪, 1,500 chips.
  perform test_as(admin);
  perform public.admin_add_buyin(seat_leaver);
  perform public.admin_add_buyin(seat_leaver);

  select total_paid_agorot, chips_issued into paid_before, issued_before
    from public.table_player_totals where table_player_id = seat_leaver;
  select sum(total_paid_agorot) into pot_before
    from public.table_player_totals where table_id = t.id;
  perform expect(paid_before = 15000 and issued_before = 1500,
    'the leaver has three entries before leaving (150₪ / 1,500 chips)');

  -- Nobody else may submit their leave.
  perform test_as(other);
  perform expect_error(format('select public.leave_table(%L, 400)', seat_leaver),
    'LEAVE_UNAUTHORIZED', 'a player cannot make another player leave');
  perform test_as(admin);
  perform expect_error(format('select public.leave_table(%L, 400)', seat_leaver),
    'LEAVE_UNAUTHORIZED', 'even the admin cannot submit a player''s leave for them');

  -- A negative count is refused.
  perform test_as(leaver);
  perform expect_error(format('select public.leave_table(%L, -1)', seat_leaver),
    'LEAVE_INVALID_CHIPS', 'a negative chip count is refused');

  -- The real thing: cashing out with 800 chips.
  perform public.leave_table(seat_leaver, 800);
  perform expect((select left_at is not null from public.table_players where id = seat_leaver),
    'the player is marked as having left');

  -- Leaving twice is impossible.
  perform expect_error(format('select public.leave_table(%L, 900)', seat_leaver),
    'LEAVE_ALREADY_LEFT', 'the same player cannot leave twice');

  -- Their money and chips stay in the game.
  select total_paid_agorot into paid_after
    from public.table_player_totals where table_player_id = seat_leaver;
  select sum(total_paid_agorot) into pot_after
    from public.table_player_totals where table_id = t.id;
  perform expect(paid_after = paid_before, 'the leaver''s buy-ins are preserved');
  perform expect(pot_after = pot_before, 'the pot is unchanged by someone leaving');

  -- Their count is recorded and already approved.
  select approved_chips into counted
    from public.chip_count_submissions where table_player_id = seat_leaver;
  perform expect(counted = 800, 'the chip count they declared is recorded and approved');

  -- But they can take on no more money.
  perform test_as(admin);
  perform expect_error(format('select public.admin_add_buyin(%L)', seat_leaver),
    'PLAYER_HAS_LEFT', 'a player who left cannot be given another entry');
  perform test_as(leaver);
  perform expect_error(format('select public.request_rebuy(%L)', seat_leaver),
    'PLAYER_HAS_LEFT', 'a player who left cannot request another entry');

  -- The remaining players carry on as normal.
  perform test_as(admin);
  perform public.admin_add_buyin(seat_other);
  perform expect((select buy_in_count from public.table_player_totals
                   where table_player_id = seat_other) = 2,
    'the remaining players continue playing normally');

  -- And the leaver is still part of the settlement.
  select count(*) into rows_ from public.compute_final_rows(t.id, false) r
   where r.table_player_id = seat_leaver;
  perform expect(rows_ = 1, 'the leaver still appears in the final calculation');
end $$;

\echo '── a game finalises correctly after someone left ──'
do $$
declare
  admin uuid := 'a0000000-0000-4000-8000-000000000001';
  t uuid; seat_admin uuid; seat_leaver uuid; seat_other uuid;
  issued int; remaining int; plan jsonb; zero_sum bigint; leaver_pl int;
begin
  select id into t from public.poker_tables where name = 'שולחן עזיבה';
  select id into seat_leaver from public.table_players
   where table_id = t and user_id = 'a0000000-0000-4000-8000-000000000002';
  select id into seat_other from public.table_players
   where table_id = t and user_id = 'a0000000-0000-4000-8000-000000000003';
  select id into seat_admin from public.table_players
   where table_id = t and user_id = admin;

  perform test_as(admin);
  perform public.set_table_status(t, 'COUNTING');

  -- Chips issued across everyone, including the leaver.
  select sum(tot.chips_issued) into issued
    from public.table_players tp
    join public.table_player_totals tot on tot.table_player_id = tp.id
   where tp.table_id = t and tp.status = 'ACTIVE';

  -- The 800 the leaver took are already counted; the rest is still on the felt.
  remaining := issued - 800;
  perform public.admin_set_chip_count(seat_admin, remaining);
  perform public.admin_set_chip_count(seat_other, 0);

  -- Build the transfer plan from the computed balances.
  with rows_ as (select * from public.compute_final_rows(t, true)),
       creditors as (select table_player_id, profit_loss_agorot amt from rows_ where profit_loss_agorot > 0),
       debtors   as (select table_player_id, -profit_loss_agorot amt from rows_ where profit_loss_agorot < 0)
  select coalesce(jsonb_agg(jsonb_build_object(
           'from', d.table_player_id, 'to', c.table_player_id,
           'amount', least(c.amt, d.amt))), '[]'::jsonb)
    into plan
    from creditors c, debtors d;

  -- Only valid when a single creditor faces a single debtor, which is the
  -- shape this fixture produces.
  perform public.finalize_game(t, plan);

  select sum(profit_loss_agorot) into zero_sum from public.game_results where table_id = t;
  perform expect(zero_sum = 0, 'profit and loss still sum to zero with a leaver in the game');

  select profit_loss_agorot into leaver_pl
    from public.game_results where table_id = t and table_player_id = seat_leaver;
  -- Paid 150₪, cashed out 800 chips = 80₪, so down 70₪.
  perform expect(leaver_pl = -7000,
    'the leaver''s result is computed by the same accounting as everyone else');

  perform expect((select count(*) from public.game_results where table_id = t) = 3,
    'the leaver is included in the stored results');
end $$;

\echo '── guest ownership through the leave RPC ──'
do $$
declare
  admin uuid := 'a0000000-0000-4000-8000-000000000001';
  guest uuid := 'c0000000-0000-4000-8000-00000000000c';
  other uuid := 'a0000000-0000-4000-8000-000000000003';
  t public.poker_tables;
  seat_guest uuid; seat_admin uuid; seat_other uuid;
begin
  -- An anonymous Supabase user: authenticated, but is_guest on the profile.
  insert into auth.users (id, email, raw_user_meta_data, is_anonymous)
  values (guest, null, '{"display_name":"אורח"}', true)
  on conflict (id) do nothing;

  perform expect((select is_guest from public.profiles where id = guest),
    'an anonymous user gets a guest profile');

  perform test_as(admin);
  t := public.create_poker_table('שולחן אורחים', current_date, now(),
         now() + interval '4 hours', 5000, 500, 6, 'AUTO_JOIN', 'OPEN', 'ADMIN_COUNT', true);
  perform public.set_table_status(t.id, 'ACTIVE');

  perform test_as(guest);
  perform public.join_table(t.join_code, 'אורח');
  perform test_as(other);
  perform public.join_table(t.join_code, 'מיכל');

  select id into seat_guest from public.table_players where table_id = t.id and user_id = guest;
  select id into seat_admin from public.table_players where table_id = t.id and user_id = admin;
  select id into seat_other from public.table_players where table_id = t.id and user_id = other;

  -- Every seat starts seated, guest included.
  perform expect((select count(*) from public.table_players
                   where table_id = t.id and status = 'ACTIVE' and left_at is null) = 3,
    'a new guest and a new registered player both start seated');

  -- Ownership is the anonymous uid, so the guest owns their own seat only.
  perform expect((select user_id from public.table_players where id = seat_guest) = guest,
    'the guest seat is owned by the anonymous auth user');

  perform test_as(guest);
  perform expect_error(format('select public.leave_table(%L, 100)', seat_other),
    'LEAVE_UNAUTHORIZED', 'a guest cannot submit another player''s leave');
  perform expect_error(format('select public.leave_table(%L, -5)', seat_guest),
    'LEAVE_INVALID_CHIPS', 'a negative chip count is refused for a guest too');

  -- The reported failure: a guest leaving their own seat.
  perform test_as(admin);
  perform public.admin_add_buyin(seat_guest);   -- two entries: 100₪ / 1,000 chips
  perform test_as(guest);
  perform public.leave_table(seat_guest, 300);

  perform expect((select left_at is not null from public.table_players where id = seat_guest),
    'a guest can leave their own seat');
  perform expect((select approved_chips from public.chip_count_submissions
                   where table_player_id = seat_guest) = 300,
    'the guest''s declared count is recorded');
  perform expect((select total_paid_agorot from public.table_player_totals
                   where table_player_id = seat_guest) = 10000,
    'the guest''s buy-ins survive leaving');
  perform expect_error(format('select public.leave_table(%L, 300)', seat_guest),
    'LEAVE_ALREADY_LEFT', 'a guest cannot leave twice');

  -- Everyone else stays seated.
  perform expect((select count(*) from public.table_players
                   where table_id = t.id and status = 'ACTIVE' and left_at is null) = 2,
    'the remaining players stay seated after a guest leaves');
end $$;

\echo '── pre-feature rows and multiple leavers ──'
do $$
declare
  admin uuid := 'a0000000-0000-4000-8000-000000000001';
  guest uuid := 'c0000000-0000-4000-8000-00000000000c';
  other uuid := 'a0000000-0000-4000-8000-000000000003';
  t uuid; seat_admin uuid; seat_other uuid; seat_guest uuid;
  issued int; zero_sum bigint; plan jsonb;
begin
  select id into t from public.poker_tables where name = 'שולחן אורחים';
  select id into seat_admin from public.table_players where table_id = t and user_id = admin;
  select id into seat_other from public.table_players where table_id = t and user_id = other;
  select id into seat_guest from public.table_players where table_id = t and user_id = guest;

  -- Rows that existed before 0009 added the column carry null, which is the
  -- seated state. Nothing needs backfilling.
  perform expect((select count(*) from public.table_players
                   where table_id = t and left_at is null) = 2,
    'rows untouched by the leave flow remain seated (null left_at)');

  -- A second player leaves later; the two leaves must not interfere.
  perform test_as(other);
  perform public.leave_table(seat_other, 200);
  perform expect((select count(*) from public.table_players
                   where table_id = t and status = 'ACTIVE' and left_at is not null) = 2,
    'two players can leave at different times');
  perform expect((select approved_chips from public.chip_count_submissions
                   where table_player_id = seat_guest) = 300,
    'the first leaver''s count is untouched by the second');

  -- The game still finalises, with both leavers in the settlement.
  perform test_as(admin);
  perform public.set_table_status(t, 'COUNTING');
  select sum(tot.chips_issued) into issued
    from public.table_players tp
    join public.table_player_totals tot on tot.table_player_id = tp.id
   where tp.table_id = t and tp.status = 'ACTIVE';
  perform public.admin_set_chip_count(seat_admin, issued - 300 - 200);

  with rows_ as (select * from public.compute_final_rows(t, true)),
       c as (select table_player_id, profit_loss_agorot amt from rows_ where profit_loss_agorot > 0),
       d as (select table_player_id, -profit_loss_agorot amt from rows_ where profit_loss_agorot < 0)
  select coalesce(jsonb_agg(jsonb_build_object(
           'from', d.table_player_id, 'to', c.table_player_id, 'amount', least(c.amt, d.amt))), '[]'::jsonb)
    into plan from c, d;

  perform public.finalize_game(t, plan);
  select sum(profit_loss_agorot) into zero_sum from public.game_results where table_id = t;
  perform expect(zero_sum = 0,
    'the game settles to zero with two players having left early');
  perform expect((select count(*) from public.game_results where table_id = t) = 3,
    'both leavers are in the stored results');
end $$;

\echo '── direct API attempts cannot bypass ownership ──'
do $$
declare t uuid; seat_admin uuid; changed int;
begin
  select id into t from public.poker_tables where name = 'שולחן אורחים';
  select id into seat_admin from public.table_players
   where table_id = t and user_id = 'a0000000-0000-4000-8000-000000000001';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"c0000000-0000-4000-8000-00000000000c","is_anonymous":true}', true);

  -- Writing left_at straight at the table is refused outright.
  perform expect_error(
    format('update public.table_players set left_at = now() where id = %L', seat_admin),
    'permission denied for table table_players',
    'a guest cannot stamp left_at directly through the API');
  perform expect_error(
    'update public.chip_count_submissions set approved_chips = 99999',
    'permission denied for table chip_count_submissions',
    'a guest cannot write a chip count directly');
  reset role;
end $$;

\echo '── production-equivalent leave: pre-feature rows, ACTIVE table ──'
do $$
declare
  admin uuid := 'a0000000-0000-4000-8000-000000000001';
  reg   uuid := 'a0000000-0000-4000-8000-000000000003';
  guest uuid := 'd0000000-0000-4000-8000-00000000000d';
  t public.poker_tables;
  seat_admin uuid; seat_reg uuid; seat_guest uuid;
  paid int; issued int;
begin
  insert into auth.users (id, email, raw_user_meta_data, is_anonymous)
  values (guest, null, '{"display_name":"אורח ותיק"}', true)
  on conflict (id) do nothing;

  perform test_as(admin);
  t := public.create_poker_table('שולחן ייצור', current_date, now(),
         now() + interval '5 hours', 5000, 500, 6, 'AUTO_JOIN', 'OPEN', 'ADMIN_COUNT', true);

  perform test_as(reg);
  perform public.join_table(t.join_code, 'מיכל');
  perform test_as(guest);
  perform public.join_table(t.join_code, 'אורח ותיק');

  -- The table is genuinely running: ACTIVE with started_at populated.
  perform test_as(admin);
  perform public.set_table_status(t.id, 'ACTIVE');
  perform expect((select status = 'ACTIVE' and started_at is not null
                    from public.poker_tables where id = t.id),
    'the fixture table is ACTIVE with started_at populated');

  select id into seat_admin from public.table_players where table_id = t.id and user_id = admin;
  select id into seat_reg   from public.table_players where table_id = t.id and user_id = reg;
  select id into seat_guest from public.table_players where table_id = t.id and user_id = guest;

  -- Model rows that predate the leave feature: left_at was added as a nullable
  -- column, so every existing row carries null. Set it explicitly to be sure
  -- the fixture matches production rather than relying on insert defaults.
  update public.table_players set left_at = null where table_id = t.id;

  -- They have buy-ins and issued chips, and have never left.
  perform public.admin_add_buyin(seat_reg);
  perform public.admin_add_buyin(seat_guest);
  select total_paid_agorot, chips_issued into paid, issued
    from public.table_player_totals where table_player_id = seat_reg;
  perform expect(paid = 10000 and issued = 1000,
    'the pre-feature player has buy-ins and issued chips');
  perform expect((select count(*) from public.chip_count_submissions
                   where table_player_id = seat_reg) = 0,
    'no leave has ever succeeded for this player');
  perform expect((select count(*) from public.table_players
                   where table_id = t.id and left_at is null) = 3,
    'all three seats read as seated before anyone leaves');

  -- A. Registered authenticated user leaves.
  perform test_as(reg);
  perform public.leave_table(seat_reg, 100);
  perform expect((select left_at is not null from public.table_players where id = seat_reg),
    'A. a registered user on a pre-feature row can leave an ACTIVE table');

  -- B. Supabase anonymous authenticated guest leaves.
  perform test_as(guest);
  perform public.leave_table(seat_guest, 100);
  perform expect((select left_at is not null from public.table_players where id = seat_guest),
    'B. an anonymous guest on a pre-feature row can leave an ACTIVE table');

  -- The admin is untouched and still playing.
  perform expect((select left_at is null from public.table_players where id = seat_admin),
    'the remaining player stays seated');
end $$;

\echo '── a submitted chip count is not, by itself, leaving ──'
do $$
declare
  admin uuid := 'a0000000-0000-4000-8000-000000000001';
  t public.poker_tables; seat uuid;
begin
  perform test_as(admin);
  t := public.create_poker_table('ספירה ללא עזיבה', current_date, now(),
         now() + interval '3 hours', 5000, 500, 6, 'AUTO_JOIN', 'OPEN', 'SELF_COUNT', true);
  perform public.set_table_status(t.id, 'ACTIVE');
  select id into seat from public.table_players where table_id = t.id and user_id = admin;

  -- Move to counting, submit a count, then come back to play.
  perform public.set_table_status(t.id, 'COUNTING');
  perform public.submit_chip_count(seat, 400);
  perform public.set_table_status(t.id, 'ACTIVE');

  perform expect((select submitted_chips from public.chip_count_submissions
                   where table_player_id = seat) = 400,
    'a chip count exists for this player');
  perform expect((select left_at is null from public.table_players where id = seat),
    'having a chip count submission does NOT mean the player left');

  -- And leaving still works despite the pre-existing submission row.
  perform public.leave_table(seat, 700);
  perform expect((select left_at is not null from public.table_players where id = seat),
    'an existing chip submission does not block leaving');
  perform expect((select approved_chips from public.chip_count_submissions
                   where table_player_id = seat) = 700,
    'the leave count overwrites the earlier submission');
end $$;

\echo '── every leave refusal reports its own code ──'
do $$
declare
  admin uuid := 'a0000000-0000-4000-8000-000000000001';
  other uuid := 'a0000000-0000-4000-8000-000000000002';
  t public.poker_tables; seat_admin uuid; seat_other uuid;
begin
  perform test_as(admin);
  t := public.create_poker_table('קודי שגיאה', current_date, now(),
         now() + interval '3 hours', 5000, 500, 6, 'AUTO_JOIN', 'OPEN', 'ADMIN_COUNT', true);
  perform test_as(other);
  perform public.join_table(t.join_code, 'שי');
  select id into seat_admin from public.table_players where table_id = t.id and user_id = admin;
  select id into seat_other from public.table_players where table_id = t.id and user_id = other;

  perform test_as(other);
  perform expect_error(format('select public.leave_table(%L, 100)', seat_admin),
    'LEAVE_UNAUTHORIZED', 'leaving for another player');
  perform expect_error(format('select public.leave_table(%L, -1)', seat_other),
    'LEAVE_INVALID_CHIPS', 'a negative chip count');
  perform expect_error(format('select public.leave_table(%L, null)', seat_other),
    'LEAVE_INVALID_CHIPS', 'a null chip count');
  perform expect_error(
    'select public.leave_table(''00000000-0000-4000-8000-000000000000'', 100)',
    'LEAVE_PLAYER_NOT_FOUND', 'an unknown seat');

  -- Once the game is past playing, leaving is closed.
  perform test_as(admin);
  perform public.set_table_status(t.id, 'ACTIVE');
  perform public.set_table_status(t.id, 'COUNTING');
  perform test_as(other);
  perform expect_error(format('select public.leave_table(%L, 100)', seat_other),
    'LEAVE_TABLE_NOT_ACTIVE', 'leaving once counting has started');

  perform test_as(admin);
  perform public.set_table_status(t.id, 'ACTIVE');
  perform test_as(other);
  perform public.leave_table(seat_other, 100);
  perform expect_error(format('select public.leave_table(%L, 100)', seat_other),
    'LEAVE_ALREADY_LEFT', 'leaving a second time');
end $$;

\echo '── the leave transaction persists what the card displays ──'
do $$
declare
  admin uuid := 'a0000000-0000-4000-8000-000000000001';
  other uuid := 'a0000000-0000-4000-8000-000000000002';
  t public.poker_tables; seat uuid; seat_admin uuid;
  row_c public.chip_count_submissions;
  paid bigint; value_agorot bigint;
begin
  perform test_as(admin);
  -- 5,000 agorot per 500 chips, so 1,200 chips are worth exactly 12,000.
  t := public.create_poker_table('כרטיס עזיבה', current_date, now(),
         now() + interval '3 hours', 5000, 500, 6, 'AUTO_JOIN', 'OPEN', 'ADMIN_COUNT', true);
  select id into seat_admin from public.table_players
   where table_id = t.id and user_id = admin;

  perform test_as(other);
  perform public.join_table(t.join_code, 'ליאור');
  select id into seat from public.table_players where table_id = t.id and user_id = other;

  perform test_as(admin);
  perform public.set_table_status(t.id, 'ACTIVE');
  -- Three entries in total: 15,000 agorot in, 1,500 chips out.
  perform public.admin_add_buyin(seat);
  perform public.admin_add_buyin(seat);
  select total_paid_agorot into paid from public.table_player_totals where table_player_id = seat;
  perform expect(paid = 15000, 'the leaver paid in 15,000 agorot over three entries');

  perform test_as(other);
  perform public.leave_table(seat, 1200);

  select * into row_c from public.chip_count_submissions where table_player_id = seat;
  perform expect(row_c.submitted_chips = 1200,
    'the declared count is stored as the submitted count');
  perform expect(row_c.approved_chips = 1200,
    'the declared count is stored as the approved count the card reads');
  perform expect(row_c.approved_at is not null and row_c.approved_by is not null,
    'the count is approved by the leave transaction itself');
  perform expect((select left_at is not null from public.table_players where id = seat),
    'left_at marks the leave as completed');

  -- The paid-in total is untouched by leaving, so the displayed result is
  -- stable across refreshes: value 12,000 - paid 15,000 = -3,000 (-30₪).
  select total_paid_agorot into paid from public.table_player_totals where table_player_id = seat;
  perform expect(paid = 15000, 'leaving does not disturb the ledger total');
  value_agorot := (row_c.approved_chips::bigint * t.buy_in_agorot) / t.chips_per_buy_in;
  perform expect(value_agorot = 12000, 'the stored count converts to 12,000 agorot');
  perform expect(value_agorot - paid = -3000, 'the realised result is -3,000 agorot');

  -- And finalization credits the leaver that same value, so the card and the
  -- settlement cannot disagree.
  perform test_as(admin);
  perform public.set_table_status(t.id, 'COUNTING');
  perform public.admin_set_chip_count(seat_admin, 800);
  perform expect((select final_value_agorot from public.compute_final_rows(t.id, false)
                   where table_player_id = seat) = value_agorot,
    'finalization credits the leaver exactly the value shown on their card');
  perform expect((select profit_loss_agorot from public.compute_final_rows(t.id, false)
                   where table_player_id = seat) = -3000,
    'finalization reports the same realised result');
  perform expect((select sum(profit_loss_agorot) from public.compute_final_rows(t.id, false)) = 0,
    'the results still sum to zero with a leaver in the game');
end $$;

\echo '── notification settings and push subscriptions ──'
do $$
declare
  admin uuid := 'a0000000-0000-4000-8000-000000000001';
  other uuid := 'a0000000-0000-4000-8000-000000000002';
  n int;
begin
  -- Both switches default on. Asserted against the column defaults rather than
  -- a row count, because the settings table is behind RLS and a count here
  -- would only ever see the current user's own row.
  perform expect((select count(*) from information_schema.columns
                   where table_schema = 'public'
                     and table_name = 'profile_privacy_settings'
                     and column_name in ('push_notifications_enabled', 'game_sounds_enabled')
                     and column_default = 'true'
                     and is_nullable = 'NO') = 2,
    'both notification switches default on and are never null');

  perform test_as(admin);
  perform expect((select push_notifications_enabled and game_sounds_enabled
                    from public.profile_privacy_settings where profile_id = admin),
    'an existing profile reads both switches as on');

  -- They are independent: turning one off leaves the other alone.
  update public.profile_privacy_settings
     set push_notifications_enabled = false where profile_id = admin;
  perform expect((select game_sounds_enabled from public.profile_privacy_settings
                   where profile_id = admin),
    'turning push off does not turn sounds off');
  update public.profile_privacy_settings
     set push_notifications_enabled = true where profile_id = admin;

  -- A subscription belongs to its owner, and only to them.
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
  values (admin, 'https://push.example.com/admin', 'k', 'a');
  perform expect((select count(*) from public.push_subscriptions) = 1,
    'a player can record their own push subscription');

  -- Re-subscribing from the same browser refreshes the row rather than adding
  -- a second one, which would make every notification arrive twice.
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
  values (admin, 'https://push.example.com/admin', 'k2', 'a2')
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth;
  select count(*) into n from public.push_subscriptions;
  perform expect(n = 1, 're-subscribing the same browser does not duplicate the row');
  perform expect((select p256dh from public.push_subscriptions
                   where endpoint = 'https://push.example.com/admin') = 'k2',
    'the refreshed keys replace the old ones');

end $$;

-- These keys are what allows a message to be sent to a device, so the
-- isolation matters more than most. Checked under the `authenticated` role,
-- because RLS does not apply to the superuser the rest of the suite runs as.
do $$
declare
  admin uuid := 'a0000000-0000-4000-8000-000000000001';
  other uuid := 'a0000000-0000-4000-8000-000000000002';
begin
  set local role authenticated;

  perform set_config('request.jwt.claims', json_build_object('sub', admin)::text, true);
  perform expect((select count(*) from public.push_subscriptions) = 1,
    'a player can read their own push subscription');

  perform set_config('request.jwt.claims', json_build_object('sub', other)::text, true);
  perform expect((select count(*) from public.push_subscriptions) = 0,
    'another player cannot read someone else''s push subscription');

  begin
    insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
    values (admin, 'https://push.example.com/forged', 'k', 'a');
    reset role;
    raise exception 'FAIL  a player could record a subscription against someone else';
  exception when insufficient_privilege then
    raise notice 'ok    a player cannot record a subscription against someone else';
  end;

  perform expect((select count(*) from public.push_subscriptions
                   where endpoint = 'https://push.example.com/admin') = 0,
    'the other player still cannot see the row they tried to write beside');

  reset role;
end $$;

\echo '── the one-hour reminder fires exactly once ──'
do $$
declare
  admin uuid := 'a0000000-0000-4000-8000-000000000001';
  t public.poker_tables; claimed int;
begin
  perform test_as(admin);
  t := public.create_poker_table('תזכורת סיום', current_date, now(),
         now() + interval '45 minutes', 5000, 500, 6, 'AUTO_JOIN', 'OPEN', 'ADMIN_COUNT', true);
  perform public.set_table_status(t.id, 'ACTIVE');

  perform expect((select ending_soon_notified_at is null from public.poker_tables where id = t.id),
    'a new table has not been reminded');

  -- The scheduler's claim: one atomic statement that only ever takes rows
  -- nobody has taken yet.
  with claimed_rows as (
    update public.poker_tables
       set ending_soon_notified_at = now()
     where id = t.id and status = 'ACTIVE' and ending_soon_notified_at is null
       and planned_end_at <= now() + interval '75 minutes'
    returning 1
  )
  select count(*) into claimed from claimed_rows;
  perform expect(claimed = 1, 'the first run claims the table');

  with claimed_rows as (
    update public.poker_tables
       set ending_soon_notified_at = now()
     where id = t.id and status = 'ACTIVE' and ending_soon_notified_at is null
       and planned_end_at <= now() + interval '75 minutes'
    returning 1
  )
  select count(*) into claimed from claimed_rows;
  perform expect(claimed = 0, 'a second run claims nothing, so nobody is reminded twice');
end $$;

\echo '── cancelling an active game ──'
do $$
declare
  admin uuid := 'a0000000-0000-4000-8000-000000000001';
  other uuid := 'a0000000-0000-4000-8000-000000000002';
  t public.poker_tables; seat uuid; seat_admin uuid; req uuid;
  entries_before int; pot_before bigint;
begin
  perform test_as(admin);
  t := public.create_poker_table('משחק שיבוטל', current_date, now(),
         now() + interval '4 hours', 5000, 500, 6, 'AUTO_JOIN', 'OPEN', 'ADMIN_COUNT', true);
  select id into seat_admin from public.table_players
   where table_id = t.id and user_id = admin;

  perform test_as(other);
  perform public.join_table(t.join_code, 'דני');
  select id into seat from public.table_players where table_id = t.id and user_id = other;

  perform test_as(admin);
  perform public.set_table_status(t.id, 'ACTIVE');
  perform public.admin_add_buyin(seat);

  -- An admin adds their own entry directly. This is the path the player card
  -- now uses for the admin, instead of raising a request they must approve.
  perform public.admin_add_buyin(seat_admin);
  perform expect((select buy_in_count from public.table_player_totals
                   where table_player_id = seat_admin) = 2,
    'the admin can add an entry for themselves without a request');

  -- And a request left outstanding when the game is called off.
  perform test_as(other);
  req := public.request_rebuy(seat);
  perform expect((select status from public.rebuy_requests where id = req) = 'PENDING',
    'a player has an outstanding entry request');

  select count(*), sum(amount_agorot) into entries_before, pot_before
    from public.buyin_transactions where table_id = t.id;

  -- A player cannot call the game off.
  perform expect_error(format('select public.set_table_status(%L, ''CANCELLED'')', t.id),
    'NOT_AUTHORIZED', 'a player cannot cancel the game');

  perform test_as(admin);
  perform public.set_table_status(t.id, 'CANCELLED');
  perform expect((select status from public.poker_tables where id = t.id) = 'CANCELLED',
    'the admin can cancel an active game');

  -- Nothing was settled. Cancelling is not finishing.
  perform expect((select count(*) from public.game_results where table_id = t.id) = 0,
    'no results are written for a cancelled game');
  perform expect((select count(*) from public.settlements where table_id = t.id) = 0,
    'no settlement is written for a cancelled game');
  perform expect((select completed_at is null from public.poker_tables where id = t.id),
    'a cancelled game is never marked completed');

  -- Nothing was deleted. The record of the evening survives.
  perform expect((select count(*) from public.buyin_transactions where table_id = t.id)
                   = entries_before,
    'every entry transaction is preserved');
  perform expect((select sum(amount_agorot) from public.buyin_transactions where table_id = t.id)
                   = pot_before,
    'the money history is preserved exactly');
  perform expect((select count(*) from public.table_players where table_id = t.id) = 2,
    'the players are preserved');

  -- The outstanding request is closed out rather than left dangling.
  perform expect((select status from public.rebuy_requests where id = req) = 'CANCELLED',
    'a pending entry request is closed when the game is cancelled');
  perform expect_error(format('select public.resolve_rebuy_request(%L, true)', req),
    'REQUEST_ALREADY_HANDLED', 'the closed request can no longer be approved');

  -- The game is shut for every mutation that only makes sense while playing.
  perform expect_error(format('select public.admin_add_buyin(%L)', seat),
    'GAME_LOCKED', 'no new entries once cancelled');
  perform test_as(other);
  perform expect_error(format('select public.request_rebuy(%L)', seat),
    'GAME_LOCKED', 'no new entry requests once cancelled');
  perform expect_error(format('select public.leave_table(%L, 100)', seat),
    'LEAVE_TABLE_NOT_ACTIVE', 'no cashing out of a cancelled game');

  -- And it is a dead end: no route back to playing, counting or completed.
  perform test_as(admin);
  perform expect_error(format('select public.set_table_status(%L, ''ACTIVE'')', t.id),
    'INVALID_TRANSITION', 'a cancelled game cannot be reopened');
  perform expect_error(format('select public.set_table_status(%L, ''COUNTING'')', t.id),
    'INVALID_TRANSITION', 'a cancelled game cannot move to counting');
  perform expect_error(format('select public.finalize_game(%L, ''[]''::jsonb)', t.id),
    'INVALID_STATUS', 'a cancelled game cannot be settled');

  -- The admin can open a fresh table straight afterwards.
  perform public.create_poker_table('המשחק הבא', current_date, now(),
    now() + interval '4 hours', 5000, 500, 6, 'AUTO_JOIN', 'OPEN', 'ADMIN_COUNT', true);
  raise notice 'ok    the admin can open a new table after cancelling';
end $$;


-- The isolation checks below reuse the stranger created for the public-profile
-- section: user 6 has never sat at a table with anybody, so `shares_table_with`
-- cannot make a profile visible to them. Every other fixture user has shared a
-- table by this point, which would make those checks vacuous.

\echo '── friendships ──'
do $$
declare
  ilan   uuid := 'a0000000-0000-4000-8000-000000000001';
  shay   uuid := 'a0000000-0000-4000-8000-000000000002';
  michal uuid := 'a0000000-0000-4000-8000-000000000003';
  guest  uuid := 'a0000000-0000-4000-8000-000000000004';
  -- Shares no table with anyone, so visibility here can only come from
  -- friendship.
  outsider uuid := 'a0000000-0000-4000-8000-000000000006';
  pair   uuid[];
begin
  pair := public.friend_pair(ilan, shay);
  perform expect(pair[1] < pair[2], 'a pair key is always in canonical order');
  perform expect(public.friend_pair(ilan, shay) = public.friend_pair(shay, ilan),
                 'the pair key does not depend on who asks');

  -- 1. A sends a request to B.
  perform test_as(ilan);
  perform expect(public.send_friend_request(shay) = 'PENDING',
                 'a request can be sent');
  perform expect(
    (select count(*) from public.friendships
      where user_a = pair[1] and user_b = pair[2] and status = 'PENDING'
        and requested_by = ilan) = 1,
    'exactly one row records the request, and who sent it');

  -- 5. Duplicates are refused.
  perform expect_error(format('select public.send_friend_request(%L)', shay),
    'REQUEST_ALREADY_SENT', 'the same request cannot be sent twice');

  -- 6. Nobody can friend themselves.
  perform expect_error(format('select public.send_friend_request(%L)', ilan),
    'CANNOT_FRIEND_SELF', 'a user cannot friend themselves');

  -- Guests are not accounts and cannot be befriended. The target's refusal
  -- has its own code so it cannot be confused with the sender's.
  perform expect_error(format('select public.send_friend_request(%L)', guest),
    'TARGET_IS_GUEST', 'a guest cannot be added as a friend');

  -- 2. B sees the incoming request.
  perform test_as(shay);
  set local role authenticated;
  perform expect(
    (select count(*) from public.friendships
      where status = 'PENDING' and requested_by <> shay) = 1,
    'the recipient sees one incoming request');
  reset role;

  -- 13. A third party can neither see nor touch the pair. Visibility is
  --     checked under the real `authenticated` role, which does not bypass RLS.
  perform test_as(michal);
  set local role authenticated;
  perform expect((select count(*) from public.friendships) = 0,
                 'a non-participant sees no rows at all');
  reset role;
  perform expect_error(
    format('select public.respond_to_friend_request(%L, true)', ilan),
    'FRIEND_REQUEST_NOT_FOUND', 'a non-participant cannot accept another pair''s request');
  perform expect_error(format('select public.remove_friend(%L)', ilan),
    'NOT_FRIENDS', 'a non-participant cannot end another pair''s friendship');

  -- The sender cannot accept their own request.
  perform test_as(ilan);
  perform expect_error(
    format('select public.respond_to_friend_request(%L, true)', shay),
    'NOT_AUTHORIZED', 'the sender cannot accept their own request');

  -- 3. B accepts.
  perform test_as(shay);
  perform expect(public.respond_to_friend_request(ilan, true) = 'ACCEPTED',
                 'the recipient can accept');

  -- 4. Both sides now see the friendship, from either direction.
  perform expect(public.is_friend_of(ilan), 'the accepter sees the friendship');
  perform test_as(ilan);
  perform expect(public.is_friend_of(shay), 'the sender sees the friendship');
  perform expect(
    (select count(*) from public.friendships
      where status = 'ACCEPTED' and (user_a = ilan or user_b = ilan)) = 1,
    'one accepted row serves both users');

  -- A second request on top of an accepted friendship is refused, either way.
  perform expect_error(format('select public.send_friend_request(%L)', shay),
    'ALREADY_FRIENDS', 'no request can be made to an existing friend');
  perform test_as(shay);
  perform expect_error(format('select public.send_friend_request(%L)', ilan),
    'ALREADY_FRIENDS', 'nor from the other side');

  -- Friends may now read each other's profile row, which the list needs.
  -- Again under `authenticated`, or the policy would not be consulted at all.
  perform test_as(ilan);
  set local role authenticated;
  perform expect((select count(*) from public.profiles where id = shay) = 1,
                 'a friend''s name and avatar become readable');
  reset role;
  perform test_as(outsider);
  set local role authenticated;
  perform expect((select count(*) from public.profiles where id = shay) = 0,
                 'a stranger''s profile stays hidden');
  reset role;

  -- 9. Removal, from the side that did not send the original request.
  perform test_as(shay);
  perform public.remove_friend(ilan);
  perform expect((select count(*) from public.friendships
                   where user_a = pair[1] and user_b = pair[2]) = 0,
                 'removing a friend deletes the row');
  perform expect(not public.is_friend_of(ilan), 'and the friendship is gone for both');
  perform test_as(ilan);
  perform expect(not public.is_friend_of(shay), 'from either direction');
  perform expect_error(format('select public.remove_friend(%L)', shay),
    'NOT_FRIENDS', 'removing a friendship that does not exist is refused');

  -- 10. Remove then re-add behaves exactly like a first-time request.
  perform expect(public.send_friend_request(shay) = 'PENDING',
                 'a removed friend can be added again');
  perform test_as(shay);
  perform expect(public.respond_to_friend_request(ilan, true) = 'ACCEPTED',
                 'and accepted again');
  perform expect(public.is_friend_of(ilan), 'the friendship is restored');
  perform public.remove_friend(ilan);

  -- 7. Declining.
  perform test_as(ilan);
  perform public.send_friend_request(shay);
  perform test_as(shay);
  perform expect(public.respond_to_friend_request(ilan, false) = 'DECLINED',
                 'the recipient can decline');
  perform expect(not public.is_friend_of(ilan), 'declining creates no friendship');
  perform expect(
    (select count(*) from public.friendships
      where user_a = pair[1] and user_b = pair[2] and status = 'PENDING') = 0,
    'a declined request no longer shows as pending');
  perform expect_error(
    format('select public.respond_to_friend_request(%L, true)', ilan),
    'FRIEND_REQUEST_NOT_FOUND', 'a declined request cannot then be accepted');

  -- Asking again after a decline is allowed, and the new asker owns it.
  perform expect(public.send_friend_request(ilan) = 'PENDING',
                 'the other side may ask after a decline');
  perform expect(
    (select requested_by from public.friendships
      where user_a = pair[1] and user_b = pair[2]) = shay,
    'and the new request belongs to whoever sent it');

  -- 8. The sender cancels.
  perform expect_error(format('select public.cancel_friend_request(%L)', michal),
    'FRIEND_REQUEST_NOT_FOUND', 'there is nothing to cancel for a stranger');
  perform test_as(ilan);
  perform expect_error(format('select public.cancel_friend_request(%L)', shay),
    'FRIEND_REQUEST_NOT_FOUND', 'only the sender may cancel their request');
  perform test_as(shay);
  perform public.cancel_friend_request(ilan);
  perform expect((select count(*) from public.friendships
                   where user_a = pair[1] and user_b = pair[2]) = 0,
                 'cancelling removes the row entirely');

  -- Asking somebody who has already asked you accepts, rather than deadlocking.
  perform test_as(ilan);
  perform public.send_friend_request(shay);
  perform test_as(shay);
  perform expect(public.send_friend_request(ilan) = 'ACCEPTED',
                 'asking back accepts the request that was already waiting');
  perform expect((select count(*) from public.friendships
                   where user_a = pair[1] and user_b = pair[2]) = 1,
                 'and still leaves exactly one row');
  perform public.remove_friend(ilan);
end $$;

\echo '── friend search exposes only what it must ──'
do $$
declare
  ilan  uuid := 'a0000000-0000-4000-8000-000000000001';
  shay  uuid := 'a0000000-0000-4000-8000-000000000002';
  guest uuid := 'a0000000-0000-4000-8000-000000000004';
  hits  jsonb;
  keys  text[];
begin
  perform test_as(ilan);

  -- 11. By name, and by pasted id.
  hits := public.search_users('שי');
  perform expect(jsonb_array_length(hits) >= 1, 'a user can be found by display name');
  perform expect(exists (
    select 1 from jsonb_array_elements(hits) h where h ->> 'id' = shay::text),
    'the right user comes back');

  hits := public.search_users(shay::text);
  perform expect(jsonb_array_length(hits) = 1, 'a user can be found by their id');

  hits := public.search_users('א');
  perform expect(jsonb_array_length(hits) = 0,
                 'a one-character query is refused rather than listing everyone');

  hits := public.search_users('דניאל');
  perform expect(not exists (
    select 1 from jsonb_array_elements(hits) h where h ->> 'id' = guest::text),
    'guests never appear in search results');

  hits := public.search_users('אילן');
  perform expect(not exists (
    select 1 from jsonb_array_elements(hits) h where h ->> 'id' = ilan::text),
    'a search never returns the person doing it');

  -- 12. Only the four public fields plus the relationship.
  hits := public.search_users('שי');
  select array_agg(distinct k) into keys
    from jsonb_array_elements(hits) h, jsonb_object_keys(h) k;
  perform expect(
    keys <@ array['id', 'display_name', 'avatar_url', 'status', 'requested_by'],
    'search returns nothing beyond name, avatar and the relationship');
  perform expect(
    not (keys && array['email', 'is_guest', 'created_at', 'updated_at',
                       'share_stats_with_table_members', 'share_detailed_history',
                       'show_on_leaderboard', 'push_notifications_enabled']),
    'no private or auth field is exposed by search');

  -- The relationship travels with the result, so a button can be labelled
  -- correctly without a second query.
  perform public.send_friend_request(shay);
  hits := public.search_users('שי');
  perform expect(exists (
    select 1 from jsonb_array_elements(hits) h
     where h ->> 'id' = shay::text and h ->> 'status' = 'PENDING'
       and h ->> 'requested_by' = ilan::text),
    'a result carries the current relationship and its direction');
  perform public.cancel_friend_request(shay);
end $$;

\echo '── clients cannot write friendships directly ──'
do $$
declare
  ilan uuid := 'a0000000-0000-4000-8000-000000000001';
  shay uuid := 'a0000000-0000-4000-8000-000000000002';
  pair uuid[] := public.friend_pair('a0000000-0000-4000-8000-000000000001',
                                    'a0000000-0000-4000-8000-000000000002');
begin
  perform test_as(ilan);
  perform public.send_friend_request(shay);

  -- The whole authorization model rests on this: no direct write is granted,
  -- so a forged PostgREST call has nothing to aim at.
  set local role authenticated;
  perform expect_error(
    format('insert into public.friendships (user_a, user_b, status, requested_by)
            values (%L, %L, ''ACCEPTED'', %L)', pair[1], pair[2], ilan),
    'permission denied for table friendships',
    'a client cannot insert a friendship');
  perform expect_error(
    'update public.friendships set status = ''ACCEPTED''',
    'permission denied for table friendships',
    'a client cannot accept a request by writing the row');
  perform expect_error(
    'delete from public.friendships',
    'permission denied for table friendships',
    'a client cannot delete a friendship row');
  reset role;

  perform expect(
    (select status from public.friendships
      where user_a = pair[1] and user_b = pair[2])::text = 'PENDING',
    'the request is still exactly as the function left it');
  perform public.cancel_friend_request(shay);
end $$;
\echo ''
\echo '── a guest who becomes a real account ──'
do $$
declare
  -- Somebody who joined a table by code first and signed up afterwards, and
  -- somebody who signed up straight away. Both end up registered.
  upgraded uuid := 'ea000000-0000-4000-8000-0000000000e1';
  native   uuid := 'ea000000-0000-4000-8000-0000000000e2';
begin
  insert into auth.users (id, email, raw_user_meta_data, is_anonymous) values
    (upgraded, null, '{"display_name":"עלה מאורח"}', true),
    (native, 'native@example.com', '{"display_name":"נרשם ישר"}', false);

  perform expect(
    (select is_guest from public.profiles where id = upgraded),
    'a guest session starts out marked as a guest');

  -- What supabase.auth.updateUser({ email, password }) does to the row: the
  -- same auth user, no longer anonymous. This is the moment the copy in
  -- profiles used to stop being true.
  update auth.users set email = 'upgraded@example.com', is_anonymous = false
   where id = upgraded;

  perform expect(
    not (select is_guest from public.profiles where id = upgraded),
    'upgrading the account clears is_guest without anyone asking it to');

  -- The bug this exists to prevent: the sender, not the target, was the one
  -- being refused, and the account could search but never add anybody.
  perform test_as(upgraded);
  perform expect(
    public.send_friend_request(native) = 'PENDING',
    'an upgraded account can send a friend request to a registered account');
  perform public.cancel_friend_request(native);

  -- The other direction, and the symptom nobody would have thought to try:
  -- the upgraded account was invisible to everyone else's search.
  perform test_as(native);
  perform expect(
    jsonb_array_length(public.search_users('עלה מאורח')) = 1,
    'an upgraded account is findable in search again');
  perform expect(
    public.send_friend_request(upgraded) = 'PENDING',
    'and a registered account can send a request to an upgraded one');
  perform public.cancel_friend_request(upgraded);

  -- Going the other way is repaired too: auth.users is the account, profiles
  -- only describes it.
  update auth.users set is_anonymous = true where id = upgraded;
  perform expect(
    (select is_guest from public.profiles where id = upgraded),
    'and the flag follows an account back to anonymous');
  update auth.users set is_anonymous = false where id = upgraded;
end $$;

do $$
begin
  -- Nothing anywhere may disagree with auth.users, including every fixture
  -- this file has created along the way.
  perform expect(
    not exists (
      select 1 from public.profiles p
        join auth.users u on u.id = p.id
       where p.is_guest is distinct from coalesce(u.is_anonymous, false)
    ),
    'no profile in the database disagrees with its auth user');
end $$;

\echo ''
\echo '── blind levels and the timer that walks them ──'
do $$
declare
  ilan   uuid := 'a0000000-0000-4000-8000-000000000001';
  shay   uuid := 'a0000000-0000-4000-8000-000000000002';
  tbl    uuid;
  ladder jsonb := jsonb_build_array(
    jsonb_build_object('kind','BLINDS','small_blind',5, 'big_blind',10, 'minutes',20),
    jsonb_build_object('kind','BLINDS','small_blind',10,'big_blind',25, 'minutes',20),
    jsonb_build_object('kind','BREAK', 'minutes',10),
    jsonb_build_object('kind','BLINDS','small_blind',25,'big_blind',50, 'minutes',20));
  t      public.poker_tables;
  eff    record;
begin
  perform test_as(ilan);
  tbl := (public.create_poker_table('ערב בליינדים', current_date, now(), now() + interval '5h',
            5000, 500, 6, 'AUTO_JOIN', 'OPEN', 'ADMIN_COUNT', true, null)).id;

  -- A table is created with the timer off, and behaves exactly as before.
  select * into t from public.poker_tables where id = tbl;
  perform expect(t.blind_status = 'DISABLED' and t.blind_levels = '[]'::jsonb,
    'a new table has no blind timer');

  -- Only the manager may configure it.
  perform test_as(shay);
  perform expect_error(format('select public.set_blind_structure(%L, %L::jsonb)', tbl, ladder),
    'NOT_AUTHORIZED', 'a player cannot configure the blind structure');

  -- The structure is validated in the database, not only in the form.
  perform test_as(ilan);
  perform expect_error(format('select public.set_blind_structure(%L, %L::jsonb)', tbl,
      jsonb_build_array(jsonb_build_object('kind','BLINDS','small_blind',50,'big_blind',10,'minutes',20),
                        jsonb_build_object('kind','BLINDS','small_blind',10,'big_blind',25,'minutes',20))),
    'INVALID_BLIND_STRUCTURE', 'the big blind must be larger than the small one');
  perform expect_error(format('select public.set_blind_structure(%L, %L::jsonb)', tbl,
      jsonb_build_array(jsonb_build_object('kind','BLINDS','small_blind',5,'big_blind',10,'minutes',0),
                        jsonb_build_object('kind','BLINDS','small_blind',10,'big_blind',25,'minutes',20))),
    'INVALID_BLIND_STRUCTURE', 'a level must last longer than zero minutes');
  perform expect_error(format('select public.set_blind_structure(%L, %L::jsonb)', tbl,
      jsonb_build_array(jsonb_build_object('kind','BLINDS','small_blind',5,'big_blind',10,'minutes',20))),
    'INVALID_BLIND_STRUCTURE', 'one level is not a blind structure');

  perform public.set_blind_structure(tbl, ladder);
  select * into t from public.poker_tables where id = tbl;
  perform expect(t.blind_status = 'READY' and jsonb_array_length(t.blind_levels) = 4,
    'the manager configures the ladder before the game starts');

  -- Configured is not running: the countdown waits for the game to start.
  perform expect(t.blind_level_started_at is null,
    'configuring the ladder does not start the clock');

  -- Starting the game starts level one, in the same statement.
  perform public.set_table_status(tbl, 'ACTIVE');
  select * into t from public.poker_tables where id = tbl;
  perform expect(t.blind_status = 'RUNNING' and t.blind_level_index = 0
                 and t.blind_level_started_at is not null,
    'starting the game starts the blind timer at level one');

  -- ...and the clock starts then, not when the table was made.
  perform expect(t.blind_level_started_at >= t.started_at,
    'level one begins when the game begins');

  select * into eff from public.internal_blind_effective(t);
  perform expect(eff.level_index = 0, 'the level in play is level one');

  -- Automatic advancement is derived, not written: rewind the anchor and the
  -- level in play moves on its own, with nothing having touched the row.
  update public.poker_tables set blind_level_started_at = now() - interval '45 minutes'
   where id = tbl;
  select * into t from public.poker_tables where id = tbl;
  select * into eff from public.internal_blind_effective(t);
  perform expect(eff.level_index = 2,
    'a level that has run out advances with no write and no cron job');
  perform expect(t.blind_level_index = 0,
    'and the stored anchor is untouched by that advance');

  -- The last level is where it stops. It does not invent another.
  update public.poker_tables set blind_level_started_at = now() - interval '20 hours'
   where id = tbl;
  select * into t from public.poker_tables where id = tbl;
  select * into eff from public.internal_blind_effective(t);
  perform expect(eff.level_index = 3, 'the final level is the last word');

  -- Pause freezes the remaining time exactly.
  update public.poker_tables
     set blind_level_index = 0, blind_level_started_at = now() - interval '12 minutes 28 seconds'
   where id = tbl;
  perform test_as(shay);
  perform expect_error(format('select public.pause_blind_timer(%L)', tbl),
    'NOT_AUTHORIZED', 'a player cannot pause the blind timer');
  perform test_as(ilan);
  perform public.pause_blind_timer(tbl);
  select * into t from public.poker_tables where id = tbl;
  perform expect(t.blind_status = 'PAUSED' and t.blind_paused_at is not null,
    'the manager pauses the timer');

  select * into eff from public.internal_blind_effective(t);
  perform expect(eff.elapsed_in_level between interval '12 minutes 27 seconds'
                                          and interval '12 minutes 30 seconds',
    'pausing records how far into the level the game had got');

  -- A paused clock does not move, however long it is left.
  update public.poker_tables set blind_paused_at = blind_paused_at - interval '10 minutes',
                                 blind_level_started_at = blind_level_started_at - interval '10 minutes'
   where id = tbl;
  select * into t from public.poker_tables where id = tbl;
  select * into eff from public.internal_blind_effective(t);
  perform expect(eff.elapsed_in_level between interval '12 minutes 27 seconds'
                                          and interval '12 minutes 30 seconds',
    'ten minutes paused changes nothing');

  -- Resume picks up from where it stopped, not from where the level started.
  perform public.resume_blind_timer(tbl);
  select * into t from public.poker_tables where id = tbl;
  select * into eff from public.internal_blind_effective(t);
  perform expect(t.blind_status = 'RUNNING' and t.blind_paused_at is null,
    'the manager resumes the timer');
  perform expect(eff.elapsed_in_level between interval '12 minutes 27 seconds'
                                          and interval '12 minutes 31 seconds',
    'resuming continues from the time that was left, not from the beginning');

  -- Stepping.
  perform test_as(shay);
  perform expect_error(format('select public.step_blind_level(%L, 1)', tbl),
    'NOT_AUTHORIZED', 'a player cannot change the blind level');
  perform test_as(ilan);
  perform expect(public.step_blind_level(tbl, 1) = 1, 'the manager advances a level');
  perform expect(public.step_blind_level(tbl, -1) = 0, 'and can go back one');
  perform expect_error(format('select public.step_blind_level(%L, -1)', tbl),
    'NO_SUCH_BLIND_LEVEL', 'there is nothing before level one');

  select * into t from public.poker_tables where id = tbl;
  perform expect(t.blind_level_started_at > now() - interval '5 seconds',
    'a step restarts that level''s countdown');

  -- The structure cannot be rewritten under a running clock.
  perform expect_error(format('select public.set_blind_structure(%L, %L::jsonb)', tbl, ladder),
    'GAME_ALREADY_STARTED', 'the ladder cannot be rewritten mid-game');

  -- Counting stops the timer without anything having to stop it.
  perform public.set_table_status(tbl, 'COUNTING');
  select * into t from public.poker_tables where id = tbl;
  perform expect(t.status = 'COUNTING' and t.blind_status = 'RUNNING',
    'the stored status is left alone when the game leaves play');
  perform expect_error(format('select public.pause_blind_timer(%L)', tbl),
    'INVALID_STATUS', 'and the timer can no longer be controlled');

  -- Cancelling it. Destructive, and admin-only in the database — the
  -- confirmation in the UI is a courtesy, not the thing that refuses.
  perform public.set_table_status(tbl, 'ACTIVE');
  perform test_as(shay);
  perform expect_error(format('select public.stop_blind_timer(%L)', tbl),
    'NOT_AUTHORIZED', 'a player cannot cancel the blind timer');
  perform test_as(ilan);
  perform public.stop_blind_timer(tbl);
  select * into t from public.poker_tables where id = tbl;
  perform expect(t.blind_status = 'STOPPED' and t.blind_level_started_at is null,
    'the manager stops the timer for good');
  perform expect_error(format('select public.pause_blind_timer(%L)', tbl),
    'BLIND_TIMER_NOT_RUNNING', 'a stopped timer cannot be paused');

  perform public.set_table_status(tbl, 'CANCELLED');
end $$;

do $$
declare
  ilan uuid := 'a0000000-0000-4000-8000-000000000001';
  tbl  uuid;
  t    public.poker_tables;
begin
  perform test_as(ilan);
  tbl := (public.create_poker_table('ערב בלי בליינדים', current_date, now(), now() + interval '5h',
            5000, 500, 6, 'AUTO_JOIN', 'OPEN', 'ADMIN_COUNT', true, null)).id;

  -- A table that never configured a timer starts and runs exactly as before.
  perform public.set_table_status(tbl, 'ACTIVE');
  select * into t from public.poker_tables where id = tbl;
  perform expect(t.status = 'ACTIVE' and t.blind_status = 'DISABLED'
                 and t.blind_level_started_at is null,
    'a game with no blind timer is completely unaffected by it');
  perform expect_error(format('select public.pause_blind_timer(%L)', tbl),
    'BLIND_TIMER_NOT_RUNNING', 'and has no timer to control');
  perform public.set_table_status(tbl, 'CANCELLED');
end $$;

do $$
begin
  -- Clients read the timer with the table row and may not write it at all.
  set local role authenticated;
  perform expect_error(
    'update public.poker_tables set blind_status = ''RUNNING''',
    'permission denied for table poker_tables',
    'a client cannot write the blind timer directly');
  reset role;
end $$;

\echo ''
\echo '── hiding a finished game from your own list ──'
do $$
declare
  ilan  uuid := 'a0000000-0000-4000-8000-000000000001';
  shay  uuid := 'a0000000-0000-4000-8000-000000000002';
  tbl   uuid;
  seat  uuid;
  before_results   int;
  before_ledger    int;
  before_profit    bigint;
  before_settle    int;
  before_board     jsonb;
  before_status    public.table_status;
  plan             jsonb;
begin
  -- A finished game both of them played in.
  perform test_as(ilan);
  tbl := (public.create_poker_table('ערב להסתרה', current_date, now(), now() + interval '5h',
            5000, 500, 6, 'AUTO_JOIN', 'OPEN', 'ADMIN_COUNT', true, null)).id;
  insert into public.table_players (table_id, user_id, display_name, status, approved_at)
  values (tbl, shay, 'שי', 'ACTIVE', now()) returning id into seat;
  perform public.internal_add_buyin(seat, 'INITIAL_BUYIN', null, ilan);
  perform public.set_table_status(tbl, 'ACTIVE');

  -- While it is still being played, neither of them may hide it.
  perform expect_error(format('select public.hide_table(%L)', tbl),
    'INVALID_STATUS', 'an active game cannot be hidden');
  perform test_as(shay);
  perform expect_error(format('select public.hide_table(%L)', tbl),
    'INVALID_STATUS', 'not by a player either');

  perform test_as(ilan);
  perform public.set_table_status(tbl, 'COUNTING');
  perform expect_error(format('select public.hide_table(%L)', tbl),
    'INVALID_STATUS', 'nor while the chips are being counted');

  -- Finish it properly, so there is real history to protect.
  perform public.admin_set_chip_count(
    (select id from public.table_players where table_id = tbl and user_id = ilan), 700);
  perform public.admin_set_chip_count(seat, 300);
  perform public.approve_all_chip_counts(tbl);

  -- The transfer plan, built from the computed balances the same way the app
  -- builds it.
  with rows_ as (select * from public.compute_final_rows(tbl, true)),
       creditors as (select table_player_id, profit_loss_agorot amt from rows_ where profit_loss_agorot > 0),
       debtors   as (select table_player_id, -profit_loss_agorot amt from rows_ where profit_loss_agorot < 0)
  select coalesce(jsonb_agg(jsonb_build_object(
           'from', d.table_player_id, 'to', c.table_player_id,
           'amount', least(c.amt, d.amt))), '[]'::jsonb)
    into plan
    from creditors c, debtors d;
  perform public.finalize_game(tbl, plan);

  select count(*) into before_results  from public.game_results where table_id = tbl;
  select count(*) into before_ledger   from public.buyin_transactions where table_id = tbl;
  select count(*) into before_settle   from public.settlements where table_id = tbl;
  select sum(profit_loss_agorot) into before_profit from public.game_results where table_id = tbl;
  select status into before_status from public.poker_tables where id = tbl;
  before_board := public.get_global_leaderboard();
  perform expect(before_results = 2 and before_status = 'COMPLETED',
    'the game is finished, with results for both players');

  -- Now it may be hidden — and only for the person doing it.
  perform public.hide_table(tbl);
  perform expect(
    exists (select 1 from public.hidden_tables where user_id = ilan and table_id = tbl),
    'a finished game can be taken off your own list');
  perform expect(
    not exists (select 1 from public.hidden_tables where user_id = shay and table_id = tbl),
    'and nobody else is affected by that');

  -- Hiding twice is not an error, and does not make two rows.
  perform public.hide_table(tbl);
  perform expect((select count(*) from public.hidden_tables where table_id = tbl) = 1,
    'hiding a game twice leaves one row, not two');

  -- Nothing about the game changed.
  perform expect((select count(*) from public.poker_tables where id = tbl) = 1,
    'the table itself still exists');
  perform expect((select status from public.poker_tables where id = tbl) = before_status,
    'its status is untouched');
  perform expect((select count(*) from public.game_results where table_id = tbl) = before_results,
    'every game result is still there');
  perform expect(
    (select sum(profit_loss_agorot) from public.game_results where table_id = tbl) = before_profit,
    'and every finalised profit and loss is unchanged');
  perform expect((select count(*) from public.buyin_transactions where table_id = tbl) = before_ledger,
    'the buy-in history is unchanged');
  perform expect((select count(*) from public.settlements where table_id = tbl) = before_settle,
    'the settlement is unchanged');
  perform expect(
    (select count(*) from public.table_players where table_id = tbl) = 2,
    'both players are still recorded as having played');
  perform expect(public.get_global_leaderboard() = before_board,
    'the leaderboard says exactly what it said before');

  -- The share card reads game_results, which is untouched, so it still works.
  perform expect(
    (select count(*) from public.game_results where table_id = tbl and display_name is not null) = 2,
    'the share card still has its finalised rows to draw from');

  -- One person cannot decide what another person sees.
  perform test_as(shay);
  set local role authenticated;
  perform expect_error(
    format('insert into public.hidden_tables (user_id, table_id) values (%L, %L)', ilan, tbl),
    'permission denied for table hidden_tables',
    'a client cannot write a hidden row at all');
  perform expect_error(
    format('delete from public.hidden_tables where user_id = %L', ilan),
    'permission denied for table hidden_tables',
    'nor delete somebody else''s');
  -- ...and cannot even see it.
  perform expect((select count(*) from public.hidden_tables) = 0,
    'one person cannot see what another has hidden');
  reset role;

  -- Unhiding is the caller's own, and puts it back.
  perform public.unhide_table(tbl);
  perform expect(
    exists (select 1 from public.hidden_tables where user_id = ilan and table_id = tbl),
    'unhiding as somebody else changes nothing');

  perform test_as(ilan);
  set local role authenticated;
  perform expect((select count(*) from public.hidden_tables) = 1,
    'and the owner of the row can see their own');
  reset role;

  perform public.unhide_table(tbl);
  perform expect(
    not exists (select 1 from public.hidden_tables where user_id = ilan and table_id = tbl),
    'putting the game back on the list is just as reversible');
end $$;

do $$
declare
  ilan   uuid := 'a0000000-0000-4000-8000-000000000001';
  outsider uuid := 'a0000000-0000-4000-8000-000000000006';
  tbl    uuid;
begin
  perform test_as(ilan);
  tbl := (public.create_poker_table('ערב לביטול', current_date, now(), now() + interval '5h',
            5000, 500, 6, 'AUTO_JOIN', 'OPEN', 'ADMIN_COUNT', false, null)).id;

  -- A waiting table cannot be hidden either.
  perform expect_error(format('select public.hide_table(%L)', tbl),
    'INVALID_STATUS', 'a table that has not started cannot be hidden');

  perform public.set_table_status(tbl, 'CANCELLED');
  perform public.hide_table(tbl);
  perform expect(
    exists (select 1 from public.hidden_tables where user_id = ilan and table_id = tbl),
    'a cancelled game can be hidden');

  -- The organiser here never took a seat: `admin_plays` was false, so they have
  -- no table_players row. This is exactly the case a column on that table
  -- could not have served.
  perform expect(
    not exists (select 1 from public.table_players where table_id = tbl and user_id = ilan),
    'and it works for an organiser who never sat down');

  -- Somebody with no connection to the game cannot hide it.
  perform test_as(outsider);
  perform expect_error(format('select public.hide_table(%L)', tbl),
    'NOT_AUTHORIZED', 'a stranger cannot hide a table they cannot see');
end $$;

\echo ''
\echo '── inviting a friend to a table ──'
do $$
declare
  ilan   uuid := 'a0000000-0000-4000-8000-000000000001';
  shay   uuid := 'a0000000-0000-4000-8000-000000000002';
  michal uuid := 'a0000000-0000-4000-8000-000000000003';
  tbl    uuid;
  other  uuid;
  inv    uuid;
  again  uuid;
  seats  int;
  answer jsonb;
begin
  -- ילן runs a table and is friends with שי. מיכל is neither.
  perform test_as(ilan);
  tbl := (public.create_poker_table('ערב הזמנות', current_date, now(), now() + interval '5h',
            5000, 500, 6, 'AUTO_JOIN', 'OPEN', 'ADMIN_COUNT', true, null)).id;
  perform public.send_friend_request(shay);
  perform test_as(shay);
  perform public.respond_to_friend_request(ilan, true);

  -- Only the people running the table may invite to it. The refusal is the
  -- same one a table that does not exist gets, so this cannot be used to find
  -- out which table ids are real.
  perform expect_error(format('select public.invite_friend_to_table(%L, %L)', tbl, michal),
    'NOT_AUTHORIZED', 'a player cannot invite to somebody else''s table');
  perform expect_error(
    format('select public.invite_friend_to_table(%L, %L)',
           '00000000-0000-4000-8000-00000000dead', michal),
    'NOT_AUTHORIZED', 'and an unknown table id gives nothing away');

  perform test_as(ilan);
  perform expect_error(format('select public.invite_friend_to_table(%L, %L)', tbl, ilan),
    'CANNOT_INVITE_SELF', 'nobody invites themselves');

  -- Only a friend, decided by the friends system rather than a second one.
  perform expect_error(format('select public.invite_friend_to_table(%L, %L)', tbl, michal),
    'NOT_FRIENDS', 'a stranger cannot be invited');

  answer := public.invite_friend_to_table(tbl, shay);
  inv := (answer ->> 'id')::uuid;
  perform expect((answer ->> 'created')::boolean, 'the first invitation is a new one');
  perform expect(answer ->> 'table_name' = 'ערב הזמנות' and answer ->> 'inviter_name' = 'אילן',
    'and it reports what a notification needs, without a second query');
  perform expect(
    (select count(*) from public.table_invitations
      where table_id = tbl and invitee_id = shay and inviter_id = ilan
        and status = 'PENDING') = 1,
    'an admin can invite a friend, and it is recorded once');

  -- Asking twice is the same invitation, not a second one.
  answer := public.invite_friend_to_table(tbl, shay);
  again := (answer ->> 'id')::uuid;
  perform expect(again = inv, 'inviting the same friend again returns the same invitation');
  perform expect(not (answer ->> 'created')::boolean,
    'and says it created nothing, so no second notification is sent');
  perform expect((select count(*) from public.table_invitations where table_id = tbl) = 1,
    'and does not create a duplicate');
  perform expect_error(
    format('insert into public.table_invitations (table_id, inviter_id, invitee_id)
            values (%L, %L, %L)', tbl, ilan, shay),
    'duplicate key value violates unique constraint "table_invitations_table_id_invitee_id_key"',
    'the database itself refuses a second invitation for the pair');

  -- Who may read the row.
  set local role authenticated;
  perform expect((select count(*) from public.table_invitations where id = inv) = 1,
    'the admin who sent it can see it');
  reset role;
  perform test_as(shay);
  set local role authenticated;
  perform expect((select count(*) from public.table_invitations where id = inv) = 1,
    'the person invited can see it');
  reset role;
  perform test_as(michal);
  set local role authenticated;
  perform expect((select count(*) from public.table_invitations) = 0,
    'and nobody else can see it at all');

  -- No client write is granted, so a forged PostgREST call has nothing to aim at.
  perform expect_error(
    format('insert into public.table_invitations (table_id, inviter_id, invitee_id)
            values (%L, %L, %L)', tbl, michal, michal),
    'permission denied for table table_invitations',
    'a client cannot invite itself by writing the row');
  perform expect_error(
    'update public.table_invitations set status = ''ACCEPTED''',
    'permission denied for table table_invitations',
    'nor accept one by writing the row');
  perform expect_error(
    'delete from public.table_invitations',
    'permission denied for table table_invitations',
    'nor delete one');
  reset role;

  -- Only the person invited may answer. An id that is not yours is not found,
  -- rather than refused — a refusal would confirm it exists.
  perform expect_error(format('select public.respond_to_table_invitation(%L, true)', inv),
    'INVITATION_NOT_FOUND', 'somebody else cannot accept your invitation');
  perform expect_error(format('select public.respond_to_table_invitation(%L, false)', inv),
    'INVITATION_NOT_FOUND', 'nor decline it on your behalf');
  perform test_as(ilan);
  perform expect_error(format('select public.respond_to_table_invitation(%L, true)', inv),
    'INVITATION_NOT_FOUND', 'not even the person who sent it');
  perform expect(
    (select status from public.table_invitations where id = inv)::text = 'PENDING',
    'and the invitation is still exactly as it was');

  -- Accepting seats them once, through the one function that creates seats.
  perform test_as(shay);
  answer := public.respond_to_table_invitation(inv, true);
  perform expect(answer ->> 'status' = 'ACCEPTED', 'accepting reports the invitation accepted');
  perform expect((answer ->> 'table_id')::uuid = tbl, 'and says which table it was for');
  select count(*) into seats from public.table_players where table_id = tbl and user_id = shay;
  perform expect(seats = 1, 'accepting creates exactly one seat');
  perform expect(
    (select status from public.table_players where table_id = tbl and user_id = shay)::text = 'ACTIVE',
    'with the seat the join mode calls for');
  perform expect(
    (select count(*) from public.buyin_transactions bt
      join public.table_players tp on tp.id = bt.table_player_id
     where tp.table_id = tbl and tp.user_id = shay and bt.type = 'INITIAL_BUYIN') = 1,
    'and exactly one initial buy-in, the same as joining by link');

  -- A double tap cannot seat somebody twice.
  answer := public.respond_to_table_invitation(inv, true);
  perform expect(answer ->> 'status' = 'ACCEPTED', 'accepting twice is the same answer');
  perform expect(
    (select count(*) from public.table_players where table_id = tbl and user_id = shay) = 1,
    'and still exactly one seat');
  perform expect(
    (select count(*) from public.buyin_transactions bt
      join public.table_players tp on tp.id = bt.table_player_id
     where tp.table_id = tbl and tp.user_id = shay) = 1,
    'and still exactly one buy-in');

  -- Having said yes, saying no is not an option any more.
  perform expect_error(format('select public.respond_to_table_invitation(%L, false)', inv),
    'INVITATION_ALREADY_ANSWERED', 'an accepted invitation cannot then be declined');

  -- And there is nothing left to invite them to.
  perform test_as(ilan);
  perform expect_error(format('select public.invite_friend_to_table(%L, %L)', tbl, shay),
    'ALREADY_AT_TABLE', 'somebody already at the table cannot be invited to it');

  -- ── declining ──
  other := (public.create_poker_table('ערב שני', current_date, now(), now() + interval '5h',
              5000, 500, 6, 'AUTO_JOIN', 'OPEN', 'ADMIN_COUNT', true, null)).id;
  inv := (public.invite_friend_to_table(other, shay) ->> 'id')::uuid;
  perform test_as(shay);
  answer := public.respond_to_table_invitation(inv, false);
  perform expect(answer ->> 'status' = 'DECLINED', 'an invitation can be declined');
  perform expect(
    not exists (select 1 from public.table_players where table_id = other and user_id = shay),
    'declining takes no seat');
  perform expect(public.respond_to_table_invitation(inv, false) ->> 'status' = 'DECLINED',
    'declining twice is the same answer');
  perform expect_error(format('select public.respond_to_table_invitation(%L, true)', inv),
    'INVITATION_ALREADY_ANSWERED', 'a declined invitation cannot be accepted afterwards');

  -- Being asked again after saying no is the thing this most easily gets wrong.
  perform test_as(ilan);
  perform expect_error(format('select public.invite_friend_to_table(%L, %L)', other, shay),
    'INVITATION_ALREADY_ANSWERED', 'somebody who said no is not asked again');
end $$;

do $$
declare
  ilan   uuid := 'a0000000-0000-4000-8000-000000000001';
  shay   uuid := 'a0000000-0000-4000-8000-000000000002';
  tbl    uuid;
  inv    uuid;
begin
  -- ── a game that is over ──
  perform test_as(ilan);
  tbl := (public.create_poker_table('ערב שנסגר', current_date, now(), now() + interval '5h',
            5000, 500, 6, 'AUTO_JOIN', 'OPEN', 'ADMIN_COUNT', true, null)).id;
  inv := (public.invite_friend_to_table(tbl, shay) ->> 'id')::uuid;
  perform public.set_table_status(tbl, 'CANCELLED');

  -- No new invitations to it...
  perform expect_error(format('select public.invite_friend_to_table(%L, %L)', tbl, shay),
    'TABLE_CLOSED', 'a game that is over cannot be invited to');

  -- ...and the one already sent cannot be turned into a seat. This is why
  -- there is no fourth "cancelled" status: the table's own status answers it.
  perform test_as(shay);
  perform expect_error(format('select public.respond_to_table_invitation(%L, true)', inv),
    'TABLE_CLOSED', 'an invitation to a cancelled game cannot be accepted');
  perform expect(
    not exists (select 1 from public.table_players where table_id = tbl and user_id = shay),
    'and no seat was created by trying');
  -- Declining it is still allowed, so it can be cleared off the home screen.
  perform expect(public.respond_to_table_invitation(inv, false) ->> 'status' = 'DECLINED',
    'but it can still be dismissed');
end $$;

do $$
declare
  ilan   uuid := 'a0000000-0000-4000-8000-000000000001';
  shay   uuid := 'a0000000-0000-4000-8000-000000000002';
  michal uuid := 'a0000000-0000-4000-8000-000000000003';
  tbl    uuid;
  inv    uuid;
  seat   uuid;
begin
  -- ── the name somebody sits under ──
  -- An invitee never gets to type a name, so a clash has to resolve itself
  -- rather than becoming NAME_TAKEN in their face.
  perform test_as(ilan);
  tbl := (public.create_poker_table('ערב שמות', current_date, now(), now() + interval '5h',
            5000, 500, 6, 'AUTO_JOIN', 'OPEN', 'ADMIN_COUNT', true, null)).id;
  insert into public.table_players (table_id, user_id, display_name, status, approved_at)
  values (tbl, michal, 'שי', 'ACTIVE', now());
  inv := (public.invite_friend_to_table(tbl, shay) ->> 'id')::uuid;

  perform test_as(shay);
  perform public.respond_to_table_invitation(inv, true);
  perform expect(
    (select display_name from public.table_players where table_id = tbl and user_id = shay) = 'שי (2)',
    'a taken name is resolved for the invitee instead of refusing them');
  perform expect(
    (select count(*) from public.table_players where table_id = tbl) = 3,
    'and everybody else keeps the seat they had');

  -- ── somebody who was removed stays removed ──
  perform test_as(ilan);
  tbl := (public.create_poker_table('ערב שלישי', current_date, now(), now() + interval '5h',
            5000, 500, 6, 'AUTO_JOIN', 'OPEN', 'ADMIN_COUNT', true, null)).id;
  insert into public.table_players (table_id, user_id, display_name, status)
  values (tbl, shay, 'שי', 'REMOVED') returning id into seat;
  inv := (public.invite_friend_to_table(tbl, shay) ->> 'id')::uuid;
  perform test_as(shay);
  perform expect_error(format('select public.respond_to_table_invitation(%L, true)', inv),
    'NOT_AUTHORIZED', 'an invitation cannot undo being removed from a table');
  perform expect(
    (select status from public.table_players where id = seat)::text = 'REMOVED',
    'and the removal stands');
  perform expect(
    (select status from public.table_invitations where id = inv)::text = 'PENDING',
    'a failed accept leaves the invitation as it was');

  -- ── unfriending stops the next invitation, not one already given ──
  -- An invitation is a thing that was said, not a view over the friendship.
  perform test_as(ilan);
  tbl := (public.create_poker_table('ערב אחרון', current_date, now(), now() + interval '5h',
            5000, 500, 6, 'AUTO_JOIN', 'OPEN', 'ADMIN_COUNT', true, null)).id;
  inv := (public.invite_friend_to_table(tbl, shay) ->> 'id')::uuid;
  perform public.remove_friend(shay);
  perform expect_error(format('select public.invite_friend_to_table(%L, %L)', tbl, shay),
    'NOT_FRIENDS', 'somebody who is no longer a friend cannot be invited again');
  perform test_as(shay);
  perform expect(public.respond_to_table_invitation(inv, true) ->> 'status' = 'ACCEPTED',
    'but an invitation already sent can still be taken up');
  perform expect(
    (select count(*) from public.table_players where table_id = tbl and user_id = shay) = 1,
    'and seats them once');
end $$;

\echo ''
\echo '── registering an account ──'
do $$
declare
  -- The rows GoTrue writes when somebody signs up. "Database error saving new
  -- user" — the 500 a failing signup returns — is this trigger raising, so
  -- every shape of new user it can be handed is inserted here and the profile
  -- it must produce is checked.
  plain    uuid := 'c0000000-0000-4000-8000-000000000001';
  noname   uuid := 'c0000000-0000-4000-8000-000000000002';
  longname uuid := 'c0000000-0000-4000-8000-000000000003';
  spaces   uuid := 'c0000000-0000-4000-8000-000000000004';
  guest    uuid := 'c0000000-0000-4000-8000-000000000005';
  emoji    uuid := 'c0000000-0000-4000-8000-000000000006';
begin
  perform expect(
    exists (
      select 1 from pg_trigger
       where tgname = 'on_auth_user_created' and tgrelid = 'auth.users'::regclass
    ),
    'a new auth user still triggers profile creation');
  perform expect(
    (select prosecdef from pg_proc
      where oid = 'public.handle_new_auth_user()'::regprocedure),
    'and it runs as its owner, so RLS cannot block the insert');

  -- A normal registration.
  insert into auth.users (id, email, raw_user_meta_data, is_anonymous)
  values (plain, 'new@example.com', '{"display_name":"נועה"}', false);
  perform expect((select display_name from public.profiles where id = plain) = 'נועה',
    'a registered signup gets a profile with the name they typed');
  perform expect(not (select is_guest from public.profiles where id = plain),
    'and is not marked as a guest');
  perform expect(exists (select 1 from public.profile_privacy_settings where profile_id = plain),
    'and gets privacy settings, which every later screen assumes exist');

  -- No display name in the metadata: the address stands in for one.
  insert into auth.users (id, email, raw_user_meta_data, is_anonymous)
  values (noname, 'dana@example.com', '{}', false);
  perform expect((select display_name from public.profiles where id = noname) = 'dana',
    'a signup with no name falls back to the address, rather than failing');

  -- Longer than the column allows. The check constraint is 1..40 characters,
  -- so an untruncated insert here is exactly what a 500 looks like.
  insert into auth.users (id, email, raw_user_meta_data, is_anonymous)
  values (longname, 'long@example.com',
          jsonb_build_object('display_name', repeat('א', 120)), false);
  perform expect(
    char_length((select display_name from public.profiles where id = longname)) = 40,
    'a name longer than the column allows is cut, not refused');

  -- Whitespace only, which btrim would reduce to nothing.
  insert into auth.users (id, email, raw_user_meta_data, is_anonymous)
  values (spaces, 'spaces@example.com', '{"display_name":"    "}', false);
  perform expect(
    char_length(btrim((select display_name from public.profiles where id = spaces))) between 1 and 40,
    'a name of nothing but spaces still satisfies the column''s own rule');

  -- Emoji and combining marks: char_length counts characters, left() cuts
  -- characters, so a 40-emoji name is 40 characters and fits.
  insert into auth.users (id, email, raw_user_meta_data, is_anonymous)
  values (emoji, 'emoji@example.com',
          jsonb_build_object('display_name', repeat('🂡', 60)), false);
  perform expect(exists (select 1 from public.profiles where id = emoji),
    'a name of emoji is stored rather than raising');

  -- A guest, which is the same trigger and the path that already works in
  -- production — so a signup failing while guests keep working means the
  -- trigger is fine and the failure is upstream of it.
  insert into auth.users (id, email, raw_user_meta_data, is_anonymous)
  values (guest, null, '{}', true);
  perform expect((select is_guest from public.profiles where id = guest),
    'an anonymous sign-in gets a profile marked as a guest');

  -- Signing up twice with the same id (a retried insert) must not raise.
  insert into auth.users (id, email, raw_user_meta_data, is_anonymous)
  values (plain, 'new@example.com', '{"display_name":"נועה"}', false)
  on conflict (id) do nothing;
  perform expect((select count(*) from public.profiles where id = plain) = 1,
    'and a repeated insert leaves exactly one profile');

  delete from auth.users where id in (plain, noname, longname, spaces, guest, emoji);
  perform expect((select count(*) from public.profiles where id = plain) = 0,
    'deleting the auth user takes the profile with it');end $$;

\echo ''
\echo '── the foreign keys the app embeds through ──'
do $$
declare
  -- Several screens now ask for a row and the rows hanging off it in one
  -- request instead of two in series. PostgREST resolves those embeds by
  -- *constraint name*, so a renamed or missing key does not raise here — it
  -- makes a page come back quietly empty. Pinning the names turns that into a
  -- failing test instead of a blank friends list.
  fk text;
  wanted text[] := array[
    'table_players_table_id_fkey',
    'table_players_user_id_fkey',
    'game_results_table_id_fkey',
    'settlements_table_id_fkey',
    'poker_tables_group_id_fkey',
    'poker_tables_owner_id_fkey',
    'friendships_user_a_fkey',
    'friendships_user_b_fkey',
    'hidden_tables_table_id_fkey',
    'table_invitations_table_id_fkey',
    'table_invitations_inviter_id_fkey'
  ];
begin
  foreach fk in array wanted loop
    perform expect(
      exists (
        select 1 from pg_constraint
        where conname = fk and contype = 'f'
          and connamespace = 'public'::regnamespace
      ),
      format('%s exists (src/lib/data embeds through it)', fk));
  end loop;
end $$;

\echo ''
\echo 'All database checks passed.'
