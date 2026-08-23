-- ===========================================================================
-- Poker With Friends — final calculations, validation, settlement, rankings
--
-- Chip → cash conversion uses the largest-remainder method so that the sum of
-- every player's final cash value is *exactly* the pot, and therefore the sum
-- of all profit/loss values is exactly zero. No floating point is involved.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- compute_final_rows — per-player outcome for a table.
-- p_require_approved: when true only admin-approved counts are used (used by
-- finalization); when false self-submitted counts are used for live preview.
-- ---------------------------------------------------------------------------
create or replace function public.compute_final_rows(p_table uuid, p_require_approved boolean)
returns table (
  table_player_id    uuid,
  display_name       text,
  user_id            uuid,
  buy_in_count       integer,
  total_paid_agorot  integer,
  chips_issued       integer,
  final_chips        integer,
  has_count          boolean,
  final_value_agorot integer,
  profit_loss_agorot integer
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_table public.poker_tables;
begin
  select * into v_table from public.poker_tables where id = p_table;
  if not found then raise exception 'TABLE_NOT_FOUND'; end if;
  if not public.is_table_member(p_table) then raise exception 'NOT_AUTHORIZED'; end if;

  return query
  with base as (
    select
      tp.id                as tpid,
      tp.display_name      as dname,
      tp.user_id           as uid,
      tot.buy_in_count     as bic,
      tot.total_paid_agorot as paid,
      tot.chips_issued     as issued,
      case when p_require_approved then cc.approved_chips
           else coalesce(cc.approved_chips, cc.submitted_chips) end as fc
    from public.table_players tp
    join public.table_player_totals tot on tot.table_player_id = tp.id
    left join public.chip_count_submissions cc on cc.table_player_id = tp.id
    where tp.table_id = p_table and tp.status = 'ACTIVE'
  ),
  calc as (
    select
      base.*,
      (coalesce(fc, 0)::bigint * v_table.buy_in_agorot) / v_table.chips_per_buy_in as floor_val,
      (coalesce(fc, 0)::bigint * v_table.buy_in_agorot) % v_table.chips_per_buy_in as rem
    from base
  ),
  agg as (
    select
      coalesce(sum(paid), 0)::bigint      as total_pot,
      coalesce(sum(floor_val), 0)::bigint as floor_sum,
      count(*)                            as n
    from calc
  ),
  ranked as (
    select
      calc.*,
      row_number() over (order by calc.rem desc, calc.tpid) as rn,
      least(greatest(agg.total_pot - agg.floor_sum, 0), agg.n) as distribute
    from calc cross join agg
  )
  select
    ranked.tpid,
    ranked.dname,
    ranked.uid,
    ranked.bic,
    ranked.paid,
    ranked.issued,
    coalesce(ranked.fc, 0)::int,
    (ranked.fc is not null),
    (ranked.floor_val + case when ranked.rn <= ranked.distribute then 1 else 0 end)::int,
    ((ranked.floor_val + case when ranked.rn <= ranked.distribute then 1 else 0 end) - ranked.paid)::int
  from ranked
  order by ranked.dname;
end;
$$;

-- ---------------------------------------------------------------------------
-- table_final_preview — everything the COUNTING screen needs in one call
-- ---------------------------------------------------------------------------
create or replace function public.table_final_preview(p_table uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_rows      jsonb;
  v_issued    bigint;
  v_counted   bigint;
  v_missing   int;
  v_pot       bigint;
begin
  if not public.is_table_member(p_table) then raise exception 'NOT_AUTHORIZED'; end if;

  select
    coalesce(jsonb_agg(to_jsonb(r) order by r.display_name), '[]'::jsonb),
    coalesce(sum(r.chips_issued), 0),
    coalesce(sum(case when r.has_count then r.final_chips else 0 end), 0),
    coalesce(sum(case when r.has_count then 0 else 1 end), 0),
    coalesce(sum(r.total_paid_agorot), 0)
  into v_rows, v_issued, v_counted, v_missing, v_pot
  from public.compute_final_rows(p_table, false) r;

  return jsonb_build_object(
    'rows', v_rows,
    'total_chips_issued', v_issued,
    'total_chips_counted', v_counted,
    'chip_difference', v_counted - v_issued,
    'missing_count_players', v_missing,
    'total_pot_agorot', v_pot
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Shared validation used by both finalization and post-hoc corrections
-- ---------------------------------------------------------------------------
create or replace function public.assert_counts_complete_and_balanced(p_table uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  v_missing int;
  v_issued  bigint;
  v_counted bigint;
begin
  select count(*) into v_missing
    from public.table_players tp
    left join public.chip_count_submissions cc on cc.table_player_id = tp.id
   where tp.table_id = p_table and tp.status = 'ACTIVE' and cc.approved_chips is null;
  if v_missing > 0 then raise exception 'MISSING_CHIP_COUNTS'; end if;

  select coalesce(sum(tot.chips_issued), 0) into v_issued
    from public.table_players tp
    join public.table_player_totals tot on tot.table_player_id = tp.id
   where tp.table_id = p_table and tp.status = 'ACTIVE';

  select coalesce(sum(cc.approved_chips), 0) into v_counted
    from public.table_players tp
    join public.chip_count_submissions cc on cc.table_player_id = tp.id
   where tp.table_id = p_table and tp.status = 'ACTIVE';

  if v_issued <> v_counted then raise exception 'CHIP_MISMATCH'; end if;
end;
$$;

-- Verifies that the supplied transfer plan exactly resolves every balance.
-- The plan is computed by the (unit-tested) TypeScript settlement algorithm,
-- but it is only ever *accepted* if the database can prove it is correct.
create or replace function public.assert_settlement_valid(p_table uuid, p_settlements jsonb)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  v_bad int;
begin
  if jsonb_typeof(p_settlements) <> 'array' then raise exception 'INVALID_SETTLEMENT'; end if;

  with s as (
    select (e ->> 'from')::uuid as f, (e ->> 'to')::uuid as t, (e ->> 'amount')::bigint as a
    from jsonb_array_elements(p_settlements) e
  )
  select count(*) into v_bad
  from s
  where s.a <= 0
     or s.f = s.t
     or not exists (select 1 from public.game_results g where g.table_id = p_table and g.table_player_id = s.f)
     or not exists (select 1 from public.game_results g where g.table_id = p_table and g.table_player_id = s.t);
  if v_bad > 0 then raise exception 'INVALID_SETTLEMENT'; end if;

  with s as (
    select (e ->> 'from')::uuid as f, (e ->> 'to')::uuid as t, (e ->> 'amount')::bigint as a
    from jsonb_array_elements(p_settlements) e
  )
  select count(*) into v_bad
  from public.game_results g
  where g.table_id = p_table
    and g.profit_loss_agorot <> (
      coalesce((select sum(a) from s where s.t = g.table_player_id), 0)
      - coalesce((select sum(a) from s where s.f = g.table_player_id), 0)
    );
  if v_bad > 0 then raise exception 'INVALID_SETTLEMENT'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- finalize_game — the only path from COUNTING to COMPLETED
-- ---------------------------------------------------------------------------
create or replace function public.finalize_game(p_table uuid, p_settlements jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := public.require_uid();
  v_table public.poker_tables;
begin
  select * into v_table from public.poker_tables where id = p_table for update;
  if not found then raise exception 'TABLE_NOT_FOUND'; end if;
  if not public.is_table_admin(p_table) then raise exception 'NOT_AUTHORIZED'; end if;
  if v_table.status = 'COMPLETED' then raise exception 'ALREADY_COMPLETED'; end if;
  if v_table.status <> 'COUNTING' then raise exception 'INVALID_STATUS'; end if;

  perform public.assert_counts_complete_and_balanced(p_table);

  delete from public.settlements  where table_id = p_table;
  delete from public.game_results where table_id = p_table;

  insert into public.game_results (
    table_id, table_player_id, user_id, display_name, buy_in_count,
    total_paid_agorot, chips_issued, final_chips, final_value_agorot, profit_loss_agorot
  )
  select p_table, r.table_player_id, r.user_id, r.display_name, r.buy_in_count,
         r.total_paid_agorot, r.chips_issued, r.final_chips, r.final_value_agorot, r.profit_loss_agorot
  from public.compute_final_rows(p_table, true) r;

  perform public.assert_settlement_valid(p_table, p_settlements);

  insert into public.settlements (table_id, from_table_player_id, to_table_player_id, amount_agorot)
  select p_table, (e ->> 'from')::uuid, (e ->> 'to')::uuid, (e ->> 'amount')::int
  from jsonb_array_elements(p_settlements) e;

  update public.poker_tables
     set status = 'COMPLETED', completed_at = now()
   where id = p_table;
end;
$$;

-- ---------------------------------------------------------------------------
-- correct_game_results — explicit, audited correction of a COMPLETED game.
-- History is never edited silently: the previous state is snapshotted and a
-- reason is mandatory.
-- ---------------------------------------------------------------------------
create or replace function public.correct_game_results(
  p_table       uuid,
  p_counts      jsonb,   -- [{ "table_player_id": uuid, "chips": int }]
  p_settlements jsonb,
  p_reason      text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := public.require_uid();
  v_prev jsonb;
  v_new  jsonb;
  v_rev  int;
begin
  if not public.is_table_admin(p_table) then raise exception 'NOT_AUTHORIZED'; end if;
  if (select status from public.poker_tables where id = p_table) <> 'COMPLETED' then
    raise exception 'INVALID_STATUS';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'REASON_REQUIRED'; end if;

  select jsonb_build_object(
    'results',     coalesce((select jsonb_agg(to_jsonb(g)) from public.game_results g where g.table_id = p_table), '[]'::jsonb),
    'settlements', coalesce((select jsonb_agg(to_jsonb(s)) from public.settlements s where s.table_id = p_table), '[]'::jsonb)
  ) into v_prev;

  update public.chip_count_submissions cc
     set approved_chips = (c ->> 'chips')::int, approved_by = v_uid, approved_at = now()
    from jsonb_array_elements(p_counts) c
   where cc.table_id = p_table
     and cc.table_player_id = (c ->> 'table_player_id')::uuid;

  perform public.assert_counts_complete_and_balanced(p_table);

  select coalesce(max(revision), 1) into v_rev from public.game_results where table_id = p_table;

  delete from public.settlements  where table_id = p_table;
  delete from public.game_results where table_id = p_table;

  insert into public.game_results (
    table_id, table_player_id, user_id, display_name, buy_in_count,
    total_paid_agorot, chips_issued, final_chips, final_value_agorot, profit_loss_agorot, revision
  )
  select p_table, r.table_player_id, r.user_id, r.display_name, r.buy_in_count,
         r.total_paid_agorot, r.chips_issued, r.final_chips, r.final_value_agorot,
         r.profit_loss_agorot, v_rev + 1
  from public.compute_final_rows(p_table, true) r;

  perform public.assert_settlement_valid(p_table, p_settlements);

  insert into public.settlements (table_id, from_table_player_id, to_table_player_id, amount_agorot)
  select p_table, (e ->> 'from')::uuid, (e ->> 'to')::uuid, (e ->> 'amount')::int
  from jsonb_array_elements(p_settlements) e;

  select jsonb_build_object(
    'results',     coalesce((select jsonb_agg(to_jsonb(g)) from public.game_results g where g.table_id = p_table), '[]'::jsonb),
    'settlements', coalesce((select jsonb_agg(to_jsonb(s)) from public.settlements s where s.table_id = p_table), '[]'::jsonb)
  ) into v_new;

  insert into public.game_corrections (table_id, performed_by, reason, previous_snapshot, new_snapshot)
  values (p_table, v_uid, btrim(p_reason), v_prev, v_new);
end;
$$;

create or replace function public.mark_settlement_paid(p_settlement uuid, p_paid boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_row public.settlements;
begin
  perform public.require_uid();
  select * into v_row from public.settlements where id = p_settlement;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.is_table_admin(v_row.table_id) then raise exception 'NOT_AUTHORIZED'; end if;
  update public.settlements set is_paid = p_paid where id = p_settlement;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rankings. Scope is the recurring group when the table belongs to one,
-- otherwise the single table.
-- ---------------------------------------------------------------------------
create or replace function public.get_table_leaderboard(p_table uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_group uuid;
  v_rows  jsonb;
begin
  if not public.is_table_member(p_table) then raise exception 'NOT_AUTHORIZED'; end if;
  select group_id into v_group from public.poker_tables where id = p_table;

  with scope as (
    select t.id from public.poker_tables t
    where t.status = 'COMPLETED'
      and (case when v_group is null then t.id = p_table else t.group_id = v_group end)
  ),
  agg as (
    select
      coalesce(g.user_id::text, 'anon:' || g.table_player_id::text) as key,
      max(g.display_name)                                            as display_name,
      g.user_id                                                      as user_id,
      count(*)::int                                                  as games_played,
      sum(g.profit_loss_agorot)::bigint                              as net_agorot,
      sum(g.buy_in_count)::int                                       as total_buy_ins,
      sum(case when g.profit_loss_agorot > 0 then 1 else 0 end)::int as winning_games,
      max(g.profit_loss_agorot)::int                                 as best_result_agorot
    from public.game_results g
    join scope on scope.id = g.table_id
    group by 1, 3
  )
  select coalesce(jsonb_agg(to_jsonb(a) order by a.net_agorot desc), '[]'::jsonb)
  into v_rows
  from agg a;

  return jsonb_build_object('scope', case when v_group is null then 'TABLE' else 'GROUP' end, 'rows', v_rows);
end;
$$;

-- Aggregate stats about another player, gated on their privacy settings.
create or replace function public.get_shared_profile_stats(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_share boolean;
  v_out   jsonb;
begin
  perform public.require_uid();
  if p_user <> auth.uid() then
    if not public.shares_table_with(p_user) then raise exception 'NOT_AUTHORIZED'; end if;
    select share_stats_with_table_members into v_share
      from public.profile_privacy_settings where profile_id = p_user;
    if coalesce(v_share, false) = false then
      return jsonb_build_object('visible', false);
    end if;
  end if;

  select jsonb_build_object(
    'visible', true,
    'games_played', count(*),
    'net_agorot', coalesce(sum(profit_loss_agorot), 0),
    'winning_games', coalesce(sum(case when profit_loss_agorot > 0 then 1 else 0 end), 0),
    'total_buy_ins', coalesce(sum(buy_in_count), 0)
  ) into v_out
  from public.game_results where user_id = p_user;

  return v_out;
end;
$$;
