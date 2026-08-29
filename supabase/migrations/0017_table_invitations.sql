-- ===========================================================================
-- 0017 — inviting a friend to a table from inside the app.
--
-- Until now "הזמן חברים" opened the phone's share sheet with the join link.
-- That still exists, for people who are not on the app; this adds the other
-- half, for people who are.
--
-- WHAT IS AND IS NOT NEW HERE
--
-- New: one table recording that one person asked another to a game, and the
-- state that invitation is in.
--
-- Not new, and deliberately not rebuilt:
--
--   · Who may be invited — `is_friend_of` from 0013. There is no second idea
--     of friendship here.
--   · How somebody joins — `join_table` from 0002. Accepting an invitation
--     calls it. Every rule about join modes, approval, closed tables, name
--     clashes, the initial buy-in and re-joining an existing seat lives there
--     and stays there, so a seat taken through an invitation is the same seat
--     taken through a link.
--   · Notifications — the existing web-push path, called from the action.
--
-- WHY THERE IS NO cancelled/expired STATE
--
-- An invitation to a game that has been cancelled, finished or moved to
-- counting simply stops being actionable, because `join_table` refuses it and
-- the home screen only asks for invitations to tables still open. Storing a
-- fourth status would mean something has to notice the game closed and write
-- it, and would then be wrong for every invitation written before that job
-- ran. Deriving it cannot be wrong.
-- ===========================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'invitation_status') then
    create type public.invitation_status as enum ('PENDING', 'ACCEPTED', 'DECLINED');
  end if;
end $$;

create table if not exists public.table_invitations (
  id          uuid primary key default gen_random_uuid(),
  table_id    uuid not null references public.poker_tables(id) on delete cascade,
  inviter_id  uuid not null references public.profiles(id) on delete cascade,
  invitee_id  uuid not null references public.profiles(id) on delete cascade,
  status      public.invitation_status not null default 'PENDING',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  responded_at timestamptz,
  -- One invitation per person per table, enforced by the database rather than
  -- by checking first: two taps racing cannot produce two rows.
  unique (table_id, invitee_id),
  constraint table_invitations_not_self check (inviter_id <> invitee_id)
);

-- "What am I invited to" is the home screen's question, asked on every visit.
create index if not exists table_invitations_invitee_idx
  on public.table_invitations (invitee_id, status);
-- "Who have I invited to this table" is the admin sheet's question.
create index if not exists table_invitations_table_idx
  on public.table_invitations (table_id);

drop trigger if exists table_invitations_updated_at on public.table_invitations;
create trigger table_invitations_updated_at
  before update on public.table_invitations
  for each row execute function public.set_updated_at();

alter table public.table_invitations enable row level security;

-- ---------------------------------------------------------------------------
-- Who may read a row.
--
-- The person invited, and the people running the table. Nobody else, so an
-- invitation id cannot be used to learn that a table or a person exists: a
-- row you are not part of does not come back at all, and every function below
-- checks membership before it looks anything up.
-- ---------------------------------------------------------------------------
drop policy if exists table_invitations_select_own on public.table_invitations;
create policy table_invitations_select_own on public.table_invitations
  for select to authenticated
  using (invitee_id = auth.uid() or public.is_table_admin(table_id));

revoke all on public.table_invitations from anon, authenticated;
grant select on public.table_invitations to authenticated;

-- ---------------------------------------------------------------------------
-- Inviting.
--
-- Everything is derived from auth.uid() and the table id; the caller cannot
-- name themselves as somebody else, and cannot invite on behalf of a table
-- they do not run.
-- ---------------------------------------------------------------------------
-- Dropped rather than replaced: an earlier draft of this function returned a
-- bare uuid, and PostgreSQL will not change a return type in place.
drop function if exists public.invite_friend_to_table(uuid, uuid);
create function public.invite_friend_to_table(p_table uuid, p_friend uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := public.require_uid();
  v_table  public.poker_tables;
  v_id     uuid;
  v_status public.invitation_status;
  v_new    boolean := true;
begin
  if p_friend = v_uid then raise exception 'CANNOT_INVITE_SELF'; end if;

  -- Membership first, so this cannot be used to probe which table ids exist.
  if not public.is_table_admin(p_table) then raise exception 'NOT_AUTHORIZED'; end if;

  select * into v_table from public.poker_tables where id = p_table for update;
  if not found then raise exception 'TABLE_NOT_FOUND'; end if;
  if v_table.status not in ('WAITING', 'ACTIVE') then raise exception 'TABLE_CLOSED'; end if;

  -- Only a friend, decided by the same function the friends screen uses.
  -- Anything else and the invitee's existence is not something this caller is
  -- entitled to confirm.
  if not public.is_friend_of(p_friend) then raise exception 'NOT_FRIENDS'; end if;

  -- Already at the table? There is nothing to invite them to.
  if exists (
    select 1 from public.table_players tp
     where tp.table_id = p_table and tp.user_id = p_friend
       and tp.status in ('PENDING', 'ACTIVE')
  ) then
    raise exception 'ALREADY_AT_TABLE';
  end if;

  select id, status into v_id, v_status from public.table_invitations
   where table_id = p_table and invitee_id = p_friend;

  if found then
    -- Asking twice is not an error; it is the same invitation. Saying so —
    -- rather than returning the id alone — is what lets the caller send one
    -- notification for one invitation instead of one per tap.
    if v_status = 'PENDING' then
      v_new := false;
    else
      -- A declined invitation stays declined. Being asked again after saying
      -- no is the thing an invitation system most easily gets wrong.
      raise exception 'INVITATION_ALREADY_ANSWERED';
    end if;
  else
    insert into public.table_invitations (table_id, inviter_id, invitee_id)
    values (p_table, v_uid, p_friend)
    returning id into v_id;
  end if;

  -- The name of the table and of whoever is inviting, so the notification can
  -- be written without two more round trips for facts already in hand here.
  return jsonb_build_object(
    'id', v_id,
    'created', v_new,
    'table_name', v_table.name,
    'inviter_name', (select display_name from public.profiles where id = v_uid));
end;
$$;

-- ---------------------------------------------------------------------------
-- Answering.
--
-- Accepting joins through `join_table`, which is the only thing in this schema
-- that creates a seat. It is idempotent — a second call returns the existing
-- seat rather than making another — so a double tap cannot seat somebody
-- twice, and neither can a retry.
-- ---------------------------------------------------------------------------
create or replace function public.respond_to_table_invitation(p_invitation uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := public.require_uid();
  v_row    public.table_invitations;
  v_table  public.poker_tables;
  v_name   text;
  v_try    text;
  v_n      int := 1;
  v_result jsonb;
begin
  select * into v_row from public.table_invitations where id = p_invitation for update;
  -- An invitation that is not yours is not found, rather than refused: a
  -- refusal would confirm the id belongs to something.
  if not found or v_row.invitee_id <> v_uid then raise exception 'INVITATION_NOT_FOUND'; end if;

  if v_row.status <> 'PENDING' then
    -- Answering twice with the same answer is the same answer.
    if (v_row.status = 'ACCEPTED') = p_accept then
      return jsonb_build_object('table_id', v_row.table_id, 'status', v_row.status);
    end if;
    raise exception 'INVITATION_ALREADY_ANSWERED';
  end if;

  if not p_accept then
    update public.table_invitations
       set status = 'DECLINED', responded_at = now()
     where id = p_invitation;
    return jsonb_build_object('table_id', v_row.table_id, 'status', 'DECLINED');
  end if;

  select * into v_table from public.poker_tables where id = v_row.table_id;
  if not found then raise exception 'TABLE_NOT_FOUND'; end if;
  if v_table.status not in ('WAITING', 'ACTIVE') then raise exception 'TABLE_CLOSED'; end if;

  -- The name they will sit under. `join_table` refuses a name already in use
  -- at that table, and somebody accepting an invitation has no opportunity to
  -- pick another, so a free one is found for them.
  select coalesce(nullif(btrim(display_name), ''), 'שחקן') into v_name
    from public.profiles where id = v_uid;
  v_try := left(v_name, 40);
  while exists (
    select 1 from public.table_players tp
     where tp.table_id = v_row.table_id
       and lower(btrim(tp.display_name)) = lower(v_try)
       and tp.status in ('PENDING', 'ACTIVE')
  ) loop
    v_n := v_n + 1;
    v_try := left(v_name, 36) || ' (' || v_n || ')';
    if v_n > 20 then raise exception 'NAME_TAKEN'; end if;
  end loop;

  -- The one path that creates a seat, with all of its rules.
  v_result := public.join_table(v_table.join_code, v_try);

  update public.table_invitations
     set status = 'ACCEPTED', responded_at = now()
   where id = p_invitation;

  return v_result || jsonb_build_object('status', 'ACCEPTED');
end;
$$;

grant execute on function public.invite_friend_to_table(uuid, uuid)        to authenticated;
grant execute on function public.respond_to_table_invitation(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Verify, so a partial apply fails loudly rather than looking successful.
-- ---------------------------------------------------------------------------
do $$
declare v_fn text;
begin
  if to_regclass('public.table_invitations') is null then
    raise exception '0017 failed: table_invitations is missing';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.table_invitations'::regclass and contype = 'u'
  ) then
    raise exception '0017 failed: the one-invitation-per-pair constraint is missing';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'table_invitations'
       and policyname = 'table_invitations_select_own'
  ) then
    raise exception '0017 failed: the select policy is missing';
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'table_invitations' and cmd <> 'SELECT'
  ) then
    raise exception '0017 failed: table_invitations must have no client write policy';
  end if;

  if has_table_privilege('authenticated', 'public.table_invitations', 'INSERT')
     or has_table_privilege('authenticated', 'public.table_invitations', 'UPDATE')
     or has_table_privilege('authenticated', 'public.table_invitations', 'DELETE') then
    raise exception '0017 failed: authenticated must not write table_invitations directly';
  end if;

  foreach v_fn in array array[
    'public.invite_friend_to_table(uuid,uuid)',
    'public.respond_to_table_invitation(uuid,boolean)'
  ] loop
    if to_regprocedure(v_fn) is null then
      raise exception '0017 failed: % is missing', v_fn;
    end if;
    if not has_function_privilege('authenticated', to_regprocedure(v_fn), 'EXECUTE') then
      raise exception '0017 failed: authenticated cannot execute %', v_fn;
    end if;
  end loop;

  raise notice 'table invitations verified: one per pair, admin-only to send, invitee-only to answer';
end;
$$;
