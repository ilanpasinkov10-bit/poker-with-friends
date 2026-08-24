-- ===========================================================================
-- Poker With Friends — table deletion, public profiles, global leaderboard
--
-- Additive only. No existing table, policy or function is altered in a way
-- that changes current behaviour, and no RLS policy is loosened: the new
-- cross-user reads go through SECURITY DEFINER functions that apply the
-- privacy rules themselves, rather than widening the `profiles` policy.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Privacy: appearing on the global leaderboard.
--
-- Default is FALSE — the leaderboard is strictly opt-in. Ranking a person's
-- lifetime winnings in front of people they have never played with is a real
-- disclosure, so nobody is entered into it without asking. A user turns it on
-- under הגדרות פרופיל → "הצג אותי בלוח ההישגים".
--
-- The absence of a settings row is treated the same way: the coalesce
-- fallbacks below resolve to false, so a missing row can never become a way
-- around the default.
-- ---------------------------------------------------------------------------
alter table public.profile_privacy_settings
  add column if not exists show_on_leaderboard boolean not null default false;

-- ---------------------------------------------------------------------------
-- Deleting a table that never started.
--
-- Permanent, so it is fenced tightly: the owner only, only from WAITING, only
-- when the game genuinely never began, and never once results exist. The
-- cascade removes the seats and the initial buy-ins along with it, which is
-- the point — nobody has played yet.
-- ---------------------------------------------------------------------------
create or replace function public.delete_poker_table(p_table uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := public.require_uid();
  v_table public.poker_tables;
begin
  select * into v_table from public.poker_tables where id = p_table for update;
  if not found then raise exception 'TABLE_NOT_FOUND'; end if;

  -- Admin rights come from ownership, never from holding the join code.
  if v_table.owner_id <> v_uid then raise exception 'NOT_AUTHORIZED'; end if;

  if v_table.status <> 'WAITING' or v_table.started_at is not null then
    raise exception 'GAME_ALREADY_STARTED';
  end if;

  -- Belt and braces: a finalised game is unreachable from WAITING, but a
  -- deletion that could erase results must never depend on one check alone.
  if exists (select 1 from public.game_results where table_id = p_table) then
    raise exception 'GAME_ALREADY_STARTED';
  end if;

  delete from public.poker_tables where id = p_table;
end;
$$;

-- Subscribers need the old row to match a DELETE against their table filter.
alter table public.poker_tables replica identity full;

-- ---------------------------------------------------------------------------
-- Indexes supporting the leaderboard aggregation.
-- ---------------------------------------------------------------------------
create index if not exists poker_tables_completed_idx
  on public.poker_tables (status, completed_at desc)
  where status = 'COMPLETED';

create index if not exists game_results_user_profit_idx
  on public.game_results (user_id, table_id)
  where user_id is not null;

-- ---------------------------------------------------------------------------
-- get_global_leaderboard — registered users ranked by realised profit.
--
-- Reads only game_results belonging to COMPLETED tables, so open games,
-- provisional chip counts and unfinalised money can never influence a rank.
-- Guests are excluded, and so is anyone who opted out.
-- ---------------------------------------------------------------------------
create or replace function public.get_global_leaderboard(
  p_period text default 'ALL',
  p_limit  integer default 100
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_since timestamptz;
  v_rows  jsonb;
begin
  perform public.require_uid();

  -- Period boundaries are Israel-local, matching how the UI presents dates.
  v_since := case upper(coalesce(p_period, 'ALL'))
    when 'MONTH' then date_trunc('month', (now() at time zone 'Asia/Jerusalem')) at time zone 'Asia/Jerusalem'
    when 'YEAR'  then date_trunc('year',  (now() at time zone 'Asia/Jerusalem')) at time zone 'Asia/Jerusalem'
    else null
  end;

  with eligible as (
    select
      gr.user_id,
      gr.profit_loss_agorot,
      gr.buy_in_count,
      gr.total_paid_agorot
    from public.game_results gr
    join public.poker_tables t on t.id = gr.table_id
    join public.profiles pr    on pr.id = gr.user_id
    left join public.profile_privacy_settings pv on pv.profile_id = gr.user_id
    where gr.user_id is not null
      and t.status = 'COMPLETED'
      and (v_since is null or t.completed_at >= v_since)
      and pr.is_guest = false
      and coalesce(pv.show_on_leaderboard, false)
  ),
  agg as (
    select
      e.user_id,
      count(*)::int                                                as games_played,
      sum(e.profit_loss_agorot)::bigint                            as net_agorot,
      sum(e.buy_in_count)::int                                     as total_buy_ins,
      sum(e.total_paid_agorot)::bigint                             as total_invested_agorot,
      max(e.profit_loss_agorot)::int                               as best_result_agorot,
      sum(case when e.profit_loss_agorot > 0 then 1 else 0 end)::int as winning_games
    from eligible e
    group by e.user_id
  )
  select coalesce(jsonb_agg(row order by row.net_agorot desc, row.games_played desc), '[]'::jsonb)
  into v_rows
  from (
    select
      a.user_id,
      pr.display_name,
      pr.avatar_url,
      a.games_played,
      a.net_agorot,
      a.total_buy_ins,
      a.total_invested_agorot,
      a.best_result_agorot,
      a.winning_games,
      (a.net_agorot / a.games_played)::int as average_agorot
    from agg a
    join public.profiles pr on pr.id = a.user_id
    order by a.net_agorot desc, a.games_played desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) row;

  return jsonb_build_object('period', upper(coalesce(p_period, 'ALL')), 'rows', v_rows);
end;
$$;

-- ---------------------------------------------------------------------------
-- get_public_profile — what one player may see about another.
--
-- Never returns an email or any auth identifier: the source columns are not
-- read at all. Aggregate stats require either the leaderboard opt-in or a
-- shared table plus that user's shared-stats setting; per-game history
-- additionally requires share_detailed_history. Viewing yourself always shows
-- everything.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_profile(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid          uuid := public.require_uid();
  v_profile      public.profiles;
  v_privacy      public.profile_privacy_settings;
  v_is_self      boolean;
  v_shares       boolean;
  v_stats_ok     boolean;
  v_history_ok   boolean;
  v_stats        jsonb := null;
  v_recent       jsonb := null;
begin
  select * into v_profile from public.profiles where id = p_user;
  if not found then raise exception 'NOT_FOUND'; end if;

  select * into v_privacy from public.profile_privacy_settings where profile_id = p_user;

  v_is_self := (p_user = v_uid);
  v_shares  := v_is_self or public.shares_table_with(p_user);

  -- Someone with no connection to this player and no public opt-in sees nothing.
  if not v_shares and not coalesce(v_privacy.show_on_leaderboard, false) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  -- Opting into the leaderboard makes the same aggregates public. Otherwise a
  -- table-mate still sees them, exactly as before this feature existed.
  v_stats_ok :=
    v_is_self
    or coalesce(v_privacy.show_on_leaderboard, false)
    or (v_shares and coalesce(v_privacy.share_stats_with_table_members, true));

  v_history_ok := v_is_self or coalesce(v_privacy.share_detailed_history, false);

  -- A guest has no lifetime record to show, and none is invented for them.
  if v_stats_ok and not v_profile.is_guest then
    select jsonb_build_object(
      'games_played',           count(*),
      'net_agorot',             coalesce(sum(gr.profit_loss_agorot), 0),
      'total_buy_ins',          coalesce(sum(gr.buy_in_count), 0),
      'total_invested_agorot',  coalesce(sum(gr.total_paid_agorot), 0),
      'winning_games',          coalesce(sum(case when gr.profit_loss_agorot > 0 then 1 else 0 end), 0),
      'best_result_agorot',     coalesce(max(gr.profit_loss_agorot), 0),
      'average_agorot',         case when count(*) = 0 then 0
                                     else (sum(gr.profit_loss_agorot) / count(*))::int end
    )
    into v_stats
    from public.game_results gr
    join public.poker_tables t on t.id = gr.table_id and t.status = 'COMPLETED'
    where gr.user_id = p_user;
  end if;

  if v_history_ok and not v_profile.is_guest then
    select coalesce(jsonb_agg(r order by r.completed_at desc), '[]'::jsonb)
    into v_recent
    from (
      select t.name as table_name, t.completed_at, gr.profit_loss_agorot,
             gr.buy_in_count, gr.total_paid_agorot
      from public.game_results gr
      join public.poker_tables t on t.id = gr.table_id and t.status = 'COMPLETED'
      where gr.user_id = p_user
      order by t.completed_at desc
      limit 5
    ) r;
  end if;

  return jsonb_build_object(
    'user_id',        v_profile.id,
    'display_name',   v_profile.display_name,
    'avatar_url',     v_profile.avatar_url,
    'is_guest',       v_profile.is_guest,
    'is_self',        v_is_self,
    'member_since',   case when v_profile.is_guest then null else v_profile.created_at end,
    'stats_visible',  v_stats is not null,
    'stats',          v_stats,
    'history_visible', v_recent is not null,
    'recent_games',   coalesce(v_recent, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.delete_poker_table(uuid)              to authenticated;
grant execute on function public.get_global_leaderboard(text, integer) to authenticated;
grant execute on function public.get_public_profile(uuid)              to authenticated;
