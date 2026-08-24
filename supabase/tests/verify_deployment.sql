-- ===========================================================================
-- Paste into the Supabase SQL Editor to see, in one row, whether the database
-- matches the deployed application. Read-only.
--
-- Every column must be `t`. Any `f` means that feature is dead in production
-- regardless of what the application code says.
-- ===========================================================================
select
  -- 0001-0006: the core game
  to_regclass('public.poker_tables')                          is not null as core_schema,
  to_regprocedure('public.finalize_game(uuid,jsonb)')         is not null as finalisation,
  (select count(*) from pg_policies where schemaname = 'public') > 0      as rls_policies,
  exists (select 1 from storage.buckets where id = 'avatars')             as avatar_storage,
  to_regprocedure('public.get_or_create_poker_group(text)')   is not null as groups,

  -- 0007: the grant that unblocks finalising a game
  coalesce((select has_function_privilege('authenticated', p.oid, 'EXECUTE')
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'compute_final_rows'), false)
                                                                          as finalise_grant,

  -- 0008: deletion, public profiles, leaderboard
  to_regprocedure('public.delete_poker_table(uuid)')          is not null as table_deletion,
  to_regprocedure('public.get_public_profile(uuid)')          is not null as public_profiles,
  to_regprocedure('public.get_global_leaderboard(text,integer)') is not null as leaderboard,
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'profile_privacy_settings'
             and column_name = 'show_on_leaderboard')                     as leaderboard_optin,

  -- 0009/0010: leaving a game in progress
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'table_players'
             and column_name = 'left_at')                                 as leave_column,
  to_regprocedure('public.leave_table(uuid,integer)')         is not null as leave_function,
  coalesce((select has_function_privilege('authenticated', p.oid, 'EXECUTE')
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'leave_table'), false)
                                                                          as leave_grant;
