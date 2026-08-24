-- ===========================================================================
-- Poker With Friends — Row Level Security
--
-- Clients get SELECT only. Every INSERT/UPDATE/DELETE goes through a
-- SECURITY DEFINER RPC that authorizes off auth.uid(). Guests authenticate as
-- Supabase anonymous users, so they hold the `authenticated` role and are
-- covered by exactly the same policies as registered users.
-- ===========================================================================

alter table public.profiles                 enable row level security;
alter table public.profile_privacy_settings enable row level security;
alter table public.poker_groups             enable row level security;
alter table public.poker_tables             enable row level security;
alter table public.table_players            enable row level security;
alter table public.rebuy_requests           enable row level security;
alter table public.buyin_transactions       enable row level security;
alter table public.chip_count_submissions   enable row level security;
alter table public.game_results             enable row level security;
alter table public.settlements              enable row level security;
alter table public.game_corrections         enable row level security;
alter table public.saved_players            enable row level security;

-- Lock the default surface down, then hand back read access only.
revoke all on all tables in schema public from anon, authenticated;
grant select on
  public.profiles, public.profile_privacy_settings, public.poker_groups,
  public.poker_tables, public.table_players, public.rebuy_requests,
  public.buyin_transactions, public.chip_count_submissions, public.game_results,
  public.settlements, public.game_corrections, public.saved_players,
  public.table_player_totals
to authenticated;

-- Profile updates (display name / avatar) are the one direct write clients may
-- perform, and only ever on their own row.
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant insert, update, delete on public.profile_privacy_settings to authenticated;
grant insert, update, delete on public.saved_players to authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_select_self_or_shared on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_table_with(id));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- profile_privacy_settings — strictly private to their owner
-- ---------------------------------------------------------------------------
create policy privacy_select_self on public.profile_privacy_settings
  for select to authenticated using (profile_id = auth.uid());
create policy privacy_insert_self on public.profile_privacy_settings
  for insert to authenticated with check (profile_id = auth.uid());
create policy privacy_update_self on public.profile_privacy_settings
  for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy privacy_delete_self on public.profile_privacy_settings
  for delete to authenticated using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- poker_groups
-- ---------------------------------------------------------------------------
create policy groups_select_related on public.poker_groups
  for select to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.poker_tables t
      join public.table_players tp on tp.table_id = t.id
      where t.group_id = poker_groups.id and tp.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- poker_tables — visible to the owner and to anyone holding a seat.
-- Non-members resolve a join code through get_table_preview() instead, which
-- exposes only the handful of fields the join screen needs.
-- ---------------------------------------------------------------------------
create policy tables_select_members on public.poker_tables
  for select to authenticated using (public.is_table_member(id));

-- ---------------------------------------------------------------------------
-- table_players — the roster is visible to the table. Financial data is NOT
-- stored here, so an OPEN/PRIVATE distinction is not needed at this level.
-- ---------------------------------------------------------------------------
create policy table_players_select_members on public.table_players
  for select to authenticated using (public.is_table_member(table_id));

-- ---------------------------------------------------------------------------
-- Financial rows: admin sees everything, a player always sees their own, and
-- other members see them only when the table is configured OPEN.
-- ---------------------------------------------------------------------------
create policy buyins_select on public.buyin_transactions
  for select to authenticated
  using (
    public.is_table_admin(table_id)
    or public.owns_table_player(table_player_id)
    or (
      public.is_table_member(table_id)
      and exists (
        select 1 from public.poker_tables t
        where t.id = buyin_transactions.table_id and t.player_visibility = 'OPEN'
      )
    )
  );

create policy rebuys_select on public.rebuy_requests
  for select to authenticated
  using (
    public.is_table_admin(table_id)
    or public.owns_table_player(table_player_id)
    or (
      public.is_table_member(table_id)
      and exists (
        select 1 from public.poker_tables t
        where t.id = rebuy_requests.table_id and t.player_visibility = 'OPEN'
      )
    )
  );

create policy chip_counts_select on public.chip_count_submissions
  for select to authenticated
  using (
    public.is_table_admin(table_id)
    or public.owns_table_player(table_player_id)
    or (
      public.is_table_member(table_id)
      and exists (
        select 1 from public.poker_tables t
        where t.id = chip_count_submissions.table_id and t.player_visibility = 'OPEN'
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Finalized data. Results and settlements are shared information among the
-- people who sat at that table — everyone needs to know who pays whom.
-- Cross-table lifetime history stays scoped to the owner via user_id.
-- ---------------------------------------------------------------------------
create policy results_select on public.game_results
  for select to authenticated
  using (user_id = auth.uid() or public.is_table_member(table_id));

create policy settlements_select on public.settlements
  for select to authenticated using (public.is_table_member(table_id));

create policy corrections_select_admin on public.game_corrections
  for select to authenticated using (public.is_table_admin(table_id));

-- ---------------------------------------------------------------------------
-- saved_players — private roster belonging to a single admin
-- ---------------------------------------------------------------------------
create policy saved_players_all_self on public.saved_players
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Function execution grants. Internal helpers are not callable over the API.
-- ---------------------------------------------------------------------------
revoke execute on function public.internal_add_buyin(uuid, public.buyin_type, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.generate_join_code() from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.compute_final_rows(uuid, boolean) from public, anon;
revoke execute on function public.assert_counts_complete_and_balanced(uuid) from public, anon;
revoke execute on function public.assert_settlement_valid(uuid, jsonb) from public, anon;

-- The join screen must work before a visitor has any seat at the table.
grant execute on function public.get_table_preview(text) to anon, authenticated;
