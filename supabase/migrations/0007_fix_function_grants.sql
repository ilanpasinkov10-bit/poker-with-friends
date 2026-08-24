-- ===========================================================================
-- Fix: finalising a game failed with "permission denied for function
-- compute_final_rows".
--
-- 0004_rls.sql revoked EXECUTE on compute_final_rows from `public`, which in
-- PostgreSQL means PUBLIC — every role — and nothing granted it back. The
-- function is called directly by the application (finalize and correct both
-- read the authoritative per-player rows before submitting a settlement plan),
-- so `authenticated` needs EXECUTE.
--
-- This is safe: compute_final_rows performs its own authorization check,
-- allowing the table's admin always, and other members only on an OPEN table
-- or once the game is COMPLETED. It writes nothing.
--
-- The two assert_* helpers stay revoked: they are only ever called from inside
-- SECURITY DEFINER functions, which run as the owner and do not need the grant.
-- ===========================================================================

grant execute on function public.compute_final_rows(uuid, boolean) to authenticated;

do $$
declare
  fn text;
  missing text[] := '{}';
begin
  -- Every function the application calls over PostgREST must be executable by
  -- `authenticated`, or the feature that uses it is dead in production.
  foreach fn in array array[
    'admin_add_buyin', 'admin_set_chip_count', 'approve_all_chip_counts',
    'cancel_rebuy_request', 'compute_final_rows', 'correct_game_results',
    'create_poker_table', 'extend_game', 'finalize_game',
    'get_or_create_poker_group', 'get_table_leaderboard', 'get_table_preview',
    'join_table', 'mark_settlement_paid', 'remove_player', 'request_rebuy',
    'resolve_join_request', 'resolve_rebuy_request', 'reverse_buyin',
    'set_table_status', 'submit_chip_count', 'update_table_settings'
  ] loop
    if not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = fn
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ) then
      missing := missing || fn;
    end if;
  end loop;

  if array_length(missing, 1) > 0 then
    raise exception 'authenticated cannot execute: %', array_to_string(missing, ', ');
  end if;
end;
$$;
