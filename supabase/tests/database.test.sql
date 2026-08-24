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

\echo ''
\echo 'All database checks passed.'
