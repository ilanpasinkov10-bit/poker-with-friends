-- ===========================================================================
-- 0013 — friendships.
--
-- Additive only. Nothing here changes the meaning of an existing column, and
-- every statement is written to be re-runnable, so a partial apply can simply
-- be run again.
--
-- ## The shape, and why
--
-- One row per *pair* of users, not one row per request, with the two ids held
-- in a canonical order by `check (user_a < user_b)`. That one constraint does
-- most of the work this feature needs, in the database rather than in
-- application code that could be bypassed:
--
--   · A duplicate request is impossible in either direction — both directions
--     produce the same (user_a, user_b), which is the primary key.
--   · Friending yourself is impossible: `a < a` is false for every a.
--   · "Works regardless of who sent it" is free, because there is nothing
--     asymmetric left to get wrong.
--   · An existing ACCEPTED row blocks a new request for the same reason a
--     duplicate is blocked: there is only ever one row for the pair.
--
-- Direction still matters — somebody sent the request — so `requested_by`
-- records it, constrained to be one of the two members.
--
-- ## The lifecycle
--
--   (no row) --request-->  PENDING
--   PENDING  --accept-->   ACCEPTED
--   PENDING  --decline-->  DECLINED
--   PENDING  --cancel-->   (row deleted, by the sender only)
--   DECLINED --request-->  PENDING           (either side may ask again)
--   ACCEPTED --remove-->   (row deleted, by either side)
--
-- Cancelling and removing delete the row; declining keeps it. That asymmetry
-- is deliberate. A cancelled request never happened and should leave the pair
-- exactly as it was. A removed friendship is not a declined request, and
-- leaving a tombstone would make "remove, then add again later" behave
-- differently from adding someone for the first time. A decline is worth
-- remembering: it is the one outcome where somebody said no, and keeping the
-- row is what a future rate limit would hang off.
--
-- Nothing here touches game data. Removing a friend deletes a row in this
-- table and nothing else: seats, ledgers, results and settlements are all
-- keyed by table and user id and are entirely unaware of friendship.
--
-- ## Security
--
-- Exactly the pattern the rest of the schema uses: clients get SELECT only,
-- restricted to rows they are part of, and every write goes through a
-- SECURITY DEFINER function that authorises off auth.uid(). No INSERT, UPDATE
-- or DELETE is granted on this table to `authenticated` at all, so a forged
-- request through PostgREST has nothing to aim at.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The status vocabulary.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'friendship_status') then
    create type public.friendship_status as enum ('PENDING', 'ACCEPTED', 'DECLINED');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The table.
-- ---------------------------------------------------------------------------
create table if not exists public.friendships (
  user_a       uuid not null references public.profiles(id) on delete cascade,
  user_b       uuid not null references public.profiles(id) on delete cascade,
  status       public.friendship_status not null default 'PENDING',
  -- Which of the two asked. Always one of them; see the check below.
  requested_by uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_a, user_b),
  -- The canonical order. Also the reason a user cannot friend themselves.
  constraint friendships_ordered check (user_a < user_b),
  constraint friendships_requester_is_member check (requested_by in (user_a, user_b))
);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'friendships_updated_at'
  ) then
    create trigger friendships_updated_at before update on public.friendships
      for each row execute function public.set_updated_at();
  end if;
end;
$$;

-- The primary key already indexes (user_a, user_b) — and therefore user_a
-- alone. The reverse direction needs its own index, because every "who are my
-- friends" query has to look for the caller in both columns.
create index if not exists friendships_user_b_idx on public.friendships (user_b);

-- Incoming requests are the hottest read on the Friends screen and are a tiny
-- fraction of the rows, so they get a partial index of their own.
create index if not exists friendships_pending_idx
  on public.friendships (user_a, user_b) where status = 'PENDING';

-- ---------------------------------------------------------------------------
-- 3. Helpers.
-- ---------------------------------------------------------------------------

/** The pair key for two users, in canonical order. */
create or replace function public.friend_pair(p_one uuid, p_two uuid)
returns uuid[] language sql immutable as $$
  select case when p_one < p_two then array[p_one, p_two] else array[p_two, p_one] end;
$$;

/**
 * Whether the caller and p_user have an accepted friendship.
 *
 * SECURITY DEFINER so it can be used from inside a policy on `profiles`
 * without the caller needing to be able to read the friendships row itself.
 */
create or replace function public.is_friend_of(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships f
     where f.status = 'ACCEPTED'
       and ((f.user_a = auth.uid() and f.user_b = p_user)
         or (f.user_b = auth.uid() and f.user_a = p_user))
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Row level security.
--
-- A user may read only the rows they are part of. There is no policy that
-- would let anyone read anyone else's friend graph, and no write policy at
-- all — writes go through the functions below.
-- ---------------------------------------------------------------------------
alter table public.friendships enable row level security;

revoke all on public.friendships from anon, authenticated;
grant select on public.friendships to authenticated;

drop policy if exists friendships_select_own on public.friendships;
create policy friendships_select_own on public.friendships
  for select to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. Friends may see each other's profile card.
--
-- `profiles` was readable only for yourself and for people you share a table
-- with, which would leave a friend's name and avatar invisible on the very
-- screen that lists them. Friendship is mutual and explicit, and `profiles`
-- holds nothing but a display name, an avatar and a guest flag — so this
-- widens the existing policy by exactly the people the user has agreed to.
-- Nothing else about the row becomes visible: stats and history are still
-- gated by get_public_profile, and privacy settings remain private.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_self_or_shared on public.profiles;
create policy profiles_select_self_or_shared on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.shares_table_with(id)
    or public.is_friend_of(id)
  );

-- ---------------------------------------------------------------------------
-- 6. Writes.
--
-- Each of these locks the pair row before deciding, so two phones pressing at
-- the same moment cannot produce two rows or a lost update.
-- ---------------------------------------------------------------------------

/**
 * Asks p_target to be friends, and returns the status the pair ends up in.
 *
 * Asking somebody who has already asked you accepts their request instead of
 * creating a second one — the alternative is two people staring at "בקשה
 * נשלחה" forever, each waiting for the other.
 */
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
  if v_target.is_guest then raise exception 'GUEST_CANNOT_FRIEND'; end if;

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

/** Accepts or declines a request that p_from sent to the caller. */
create or replace function public.respond_to_friend_request(p_from uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := public.require_uid();
  v_pair uuid[] := public.friend_pair(public.require_uid(), p_from);
  v_row  public.friendships;
  v_next public.friendship_status;
begin
  if p_from = v_uid then raise exception 'FRIEND_REQUEST_NOT_FOUND'; end if;

  select * into v_row from public.friendships
   where user_a = v_pair[1] and user_b = v_pair[2] for update;

  if not found or v_row.status <> 'PENDING' then
    raise exception 'FRIEND_REQUEST_NOT_FOUND';
  end if;
  -- Only the person who was asked may answer. Accepting your own request
  -- would be a one-sided friendship.
  if v_row.requested_by = v_uid then raise exception 'NOT_AUTHORIZED'; end if;

  v_next := case when p_accept then 'ACCEPTED' else 'DECLINED' end;
  update public.friendships set status = v_next
   where user_a = v_pair[1] and user_b = v_pair[2];
  return v_next::text;
end;
$$;

/** Withdraws a request the caller sent. The row goes; nothing happened. */
create or replace function public.cancel_friend_request(p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := public.require_uid();
  v_pair uuid[] := public.friend_pair(public.require_uid(), p_target);
  v_row  public.friendships;
begin
  select * into v_row from public.friendships
   where user_a = v_pair[1] and user_b = v_pair[2] for update;

  if not found or v_row.status <> 'PENDING' or v_row.requested_by <> v_uid then
    raise exception 'FRIEND_REQUEST_NOT_FOUND';
  end if;

  delete from public.friendships where user_a = v_pair[1] and user_b = v_pair[2];
end;
$$;

/**
 * Ends a friendship, from either side.
 *
 * Deletes one row and touches nothing else. Every game the two ever played
 * together — seats, entries, counts, results, settlements — is keyed by table
 * and user and knows nothing about this table.
 */
create or replace function public.remove_friend(p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_pair uuid[] := public.friend_pair(public.require_uid(), p_target);
  v_row  public.friendships;
begin
  select * into v_row from public.friendships
   where user_a = v_pair[1] and user_b = v_pair[2] for update;

  if not found or v_row.status <> 'ACCEPTED' then raise exception 'NOT_FRIENDS'; end if;

  delete from public.friendships where user_a = v_pair[1] and user_b = v_pair[2];
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Search.
--
-- `profiles` is not readable for strangers and must not become so, but finding
-- somebody to befriend means looking one up before any relationship exists.
-- This is the whole of that exception, and it returns four fields: id, display
-- name, avatar, and where the two of you already stand. No email, no stats, no
-- history, no privacy settings, no push subscriptions — those columns are not
-- read at all, so no future policy change can accidentally widen this.
--
-- Guests are excluded: an anonymous session is not an account, and offering it
-- as a search result would produce a friendship that dies with the session.
-- ---------------------------------------------------------------------------
create or replace function public.search_users(p_query text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid  uuid := public.require_uid();
  v_q    text := btrim(coalesce(p_query, ''));
  v_id   uuid;
begin
  -- Two characters minimum: a one-character query returns most of the user
  -- base, which is an enumeration tool rather than a search.
  if char_length(v_q) < 2 then return '[]'::jsonb; end if;

  -- A pasted id is an exact lookup, not a substring match.
  begin
    v_id := v_q::uuid;
  exception when others then
    v_id := null;
  end;

  return coalesce((
    select jsonb_agg(row_to_json(r) order by r.display_name)
    from (
      select p.id,
             p.display_name,
             p.avatar_url,
             coalesce(f.status::text, 'NONE') as status,
             f.requested_by
        from public.profiles p
        left join public.friendships f
          on f.user_a = least(v_uid, p.id) and f.user_b = greatest(v_uid, p.id)
       where p.id <> v_uid
         and not p.is_guest
         and (p.id = v_id or p.display_name ilike '%' || v_q || '%')
       limit 20
    ) r
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Grants. Execute only; the table itself stays read-only to clients.
-- ---------------------------------------------------------------------------
grant execute on function public.friend_pair(uuid, uuid)                  to authenticated;
grant execute on function public.is_friend_of(uuid)                       to authenticated;
grant execute on function public.send_friend_request(uuid)                to authenticated;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;
grant execute on function public.cancel_friend_request(uuid)              to authenticated;
grant execute on function public.remove_friend(uuid)                      to authenticated;
grant execute on function public.search_users(text)                       to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Verify, so a partial apply fails loudly rather than looking successful.
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn text;
begin
  if to_regclass('public.friendships') is null then
    raise exception '0013 failed: friendships table is missing';
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'friendships_ordered'
  ) then
    raise exception '0013 failed: the canonical-order constraint is missing';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'friendships'
       and policyname = 'friendships_select_own'
  ) then
    raise exception '0013 failed: the friendships select policy is missing';
  end if;

  -- No write policy may exist: every write goes through a definer function.
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'friendships' and cmd <> 'SELECT'
  ) then
    raise exception '0013 failed: friendships must have no client write policy';
  end if;

  if has_table_privilege('authenticated', 'public.friendships', 'INSERT')
     or has_table_privilege('authenticated', 'public.friendships', 'UPDATE')
     or has_table_privilege('authenticated', 'public.friendships', 'DELETE') then
    raise exception '0013 failed: authenticated must not write friendships directly';
  end if;

  foreach v_fn in array array[
    'public.send_friend_request(uuid)',
    'public.respond_to_friend_request(uuid,boolean)',
    'public.cancel_friend_request(uuid)',
    'public.remove_friend(uuid)',
    'public.search_users(text)'
  ] loop
    if to_regprocedure(v_fn) is null then
      raise exception '0013 failed: % is missing', v_fn;
    end if;
    if not has_function_privilege('authenticated', to_regprocedure(v_fn), 'EXECUTE') then
      raise exception '0013 failed: authenticated cannot execute %', v_fn;
    end if;
  end loop;

  raise notice 'friendships verified: one row per pair, read-only to clients';
end;
$$;

notify pgrst, 'reload schema';
