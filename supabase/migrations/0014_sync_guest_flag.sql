-- ===========================================================================
-- 0014 — keep profiles.is_guest true to auth.users.is_anonymous
--
-- `profiles.is_guest` is a copy of `auth.users.is_anonymous`, written once by
-- the on_auth_user_created trigger in 0001. That trigger fires on INSERT only,
-- and an anonymous account does not become permanent by being re-inserted — it
-- becomes permanent by being *updated*. `supabase.auth.updateUser({ email,
-- password })`, which is how a guest turns their session into a real account,
-- flips auth.users.is_anonymous to false in place. Nothing was watching, so
-- the copy in profiles stayed true for the rest of that account's life.
--
-- The consequences all read as separate bugs:
--   * send_friend_request raises GUEST_CANNOT_FRIEND for the *sender*, so the
--     account can search for people but cannot add anybody;
--   * search_users filters on `not p.is_guest`, so nobody else can find them;
--   * get_public_profile reports them as a guest and hides their stats,
--     history and join date;
--   * get_global_leaderboard filters on `pr.is_guest = false`, so they never
--     appear on the board however many games they finish.
--
-- Two parts below: a trigger so the copy cannot drift again, and a one-off
-- repair for the accounts that already drifted. Both are idempotent.
--
-- Note on timing: when email confirmation is switched on, is_anonymous does
-- not flip when updateUser returns — it flips when the user clicks the link,
-- which may be hours later and is not a request the app takes part in. That is
-- why this belongs in a database trigger and not in the server action.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Keep the copy in step from now on.
-- ---------------------------------------------------------------------------
create or replace function public.sync_profile_guest_flag()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set is_guest = coalesce(new.is_anonymous, false)
   where id = new.id
     and is_guest is distinct from coalesce(new.is_anonymous, false);
  return new;
end;
$$;

drop trigger if exists on_auth_user_anonymity_changed on auth.users;
create trigger on_auth_user_anonymity_changed
  after update of is_anonymous on auth.users
  for each row
  when (old.is_anonymous is distinct from new.is_anonymous)
  execute function public.sync_profile_guest_flag();

-- ---------------------------------------------------------------------------
-- 2. Repair the accounts that already drifted.
--
-- Symmetric on purpose. It corrects a registered account still marked as a
-- guest, and equally a guest marked as registered — in both directions
-- auth.users is the account, and profiles only describes it. It touches no row
-- that already agrees, so re-running it is a no-op.
-- ---------------------------------------------------------------------------
do $$
declare
  v_freed  integer;
  v_marked integer;
begin
  with corrected as (
    update public.profiles p
       set is_guest = coalesce(u.is_anonymous, false)
      from auth.users u
     where u.id = p.id
       and p.is_guest is distinct from coalesce(u.is_anonymous, false)
     returning p.is_guest
  )
  select count(*) filter (where not is_guest), count(*) filter (where is_guest)
    into v_freed, v_marked
    from corrected;

  raise notice '0014: % profile(s) corrected from guest to registered, % the other way',
    v_freed, v_marked;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Say which side of a friend request was refused.
--
-- Both checks raised the same code, which is why an account that could search
-- but not add anybody looked like a problem with the person being added. The
-- sender keeps GUEST_CANNOT_FRIEND — for a genuine guest that message is still
-- exactly right — and the target now has its own.
-- ---------------------------------------------------------------------------
create or replace function public.send_friend_request(p_target uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := public.require_uid();
  v_pair   uuid[];
  v_row    public.friendships;
  v_target public.profiles;
  v_me     public.profiles;
begin
  if p_target = v_uid then raise exception 'CANNOT_FRIEND_SELF'; end if;

  select * into v_me from public.profiles where id = v_uid;
  if v_me.is_guest then raise exception 'GUEST_CANNOT_FRIEND'; end if;

  select * into v_target from public.profiles where id = p_target;
  if not found then raise exception 'NOT_FOUND'; end if;
  -- A guest is a throwaway anonymous session, not an account someone can be
  -- friends with. Offering it would create a friendship that silently dies.
  if v_target.is_guest then raise exception 'TARGET_IS_GUEST'; end if;

  v_pair := public.friend_pair(v_uid, p_target);

  select * into v_row from public.friendships
   where user_a = v_pair[1] and user_b = v_pair[2] for update;

  if not found then
    insert into public.friendships (user_a, user_b, status, requested_by)
    values (v_pair[1], v_pair[2], 'PENDING', v_uid);
    return 'PENDING';
  end if;

  if v_row.status = 'ACCEPTED' then raise exception 'ALREADY_FRIENDS'; end if;

  if v_row.status = 'PENDING' then
    if v_row.requested_by = v_uid then raise exception 'REQUEST_ALREADY_SENT'; end if;
    update public.friendships set status = 'ACCEPTED'
     where user_a = v_pair[1] and user_b = v_pair[2];
    return 'ACCEPTED';
  end if;

  -- DECLINED: asking again is allowed, and the new asker owns the request.
  update public.friendships set status = 'PENDING', requested_by = v_uid
   where user_a = v_pair[1] and user_b = v_pair[2];
  return 'PENDING';
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Verify, so a partial apply fails loudly rather than looking successful.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'on_auth_user_anonymity_changed'
       and tgrelid = 'auth.users'::regclass
       and not tgisinternal
  ) then
    raise exception '0014 failed: the anonymity sync trigger is missing';
  end if;

  if exists (
    select 1 from public.profiles p
      join auth.users u on u.id = p.id
     where p.is_guest is distinct from coalesce(u.is_anonymous, false)
  ) then
    raise exception '0014 failed: profiles.is_guest still disagrees with auth.users';
  end if;

  raise notice 'guest flag verified: profiles.is_guest tracks auth.users.is_anonymous';
end;
$$;
