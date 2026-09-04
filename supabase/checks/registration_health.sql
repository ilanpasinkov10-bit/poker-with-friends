-- ===========================================================================
-- Is registration healthy in *this* database?
--
-- Read-only. Paste into the Supabase SQL editor (Dashboard → SQL Editor) and
-- run it; it writes nothing and changes nothing. Every row it returns is one
-- fact about the pieces a signup depends on, with 'ok' or 'PROBLEM' beside it.
--
-- Why it exists: when a signup fails inside the database, GoTrue answers with
-- HTTP 500 and the sentence "Database error saving new user" — and that is the
-- whole of what the application is told. This script is how you find out which
-- piece is missing, without guessing.
--
-- Run it against production. The checks below are the same ones the test suite
-- asserts against a database built from supabase/migrations, so a PROBLEM here
-- means production has drifted from the migrations, not that the migrations
-- are wrong.
-- ===========================================================================

with checks as (
  -- 1. The trigger that creates a profile for every new auth user (0001).
  select
    1 as n,
    'on_auth_user_created trigger exists' as what,
    case when exists (
      select 1 from pg_trigger
       where tgname = 'on_auth_user_created'
         and tgrelid = 'auth.users'::regclass
         and not tgisinternal
    ) then 'ok' else 'PROBLEM: every signup will fail with "Database error saving new user"' end as verdict

  -- 2. …and that it is enabled. A disabled trigger still exists.
  union all select
    2,
    'on_auth_user_created is enabled',
    case coalesce((
      select tgenabled from pg_trigger
       where tgname = 'on_auth_user_created' and tgrelid = 'auth.users'::regclass
    ), 'missing')
      when 'O' then 'ok'
      when 'missing' then 'PROBLEM: the trigger is not there at all'
      else 'PROBLEM: the trigger is disabled (ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created)'
    end

  -- 3. The function it calls, and the privilege it needs. Without SECURITY
  --    DEFINER the insert runs as the signing-up user, who has no rights on
  --    public.profiles, and every signup fails.
  union all select
    3,
    'handle_new_auth_user() is SECURITY DEFINER',
    case (select prosecdef from pg_proc where oid = to_regprocedure('public.handle_new_auth_user()'))
      when true then 'ok'
      when false then 'PROBLEM: recreate it with SECURITY DEFINER (see 0001_schema.sql)'
      else 'PROBLEM: the function is missing'
    end

  -- 4. The two tables it writes.
  union all select
    4,
    'public.profiles and public.profile_privacy_settings exist',
    case when to_regclass('public.profiles') is not null
          and to_regclass('public.profile_privacy_settings') is not null
      then 'ok' else 'PROBLEM: a table the trigger inserts into is missing' end

  -- 5. Any column the trigger does not fill and the table does not default.
  --    This is the classic drift: a column added by hand in the dashboard,
  --    NOT NULL, no default — after which every signup fails and nothing else
  --    in the app changes.
  union all select
    5,
    'no un-fillable column was added to profiles',
    coalesce((
      select 'PROBLEM: profiles.' || string_agg(attname, ', profiles.')
             || ' is NOT NULL with no default and is not set by the trigger'
        from pg_attribute a
       where a.attrelid = 'public.profiles'::regclass
         and a.attnum > 0 and not a.attisdropped
         and a.attnotnull
         and not exists (
           select 1 from pg_attrdef d where d.adrelid = a.attrelid and d.adnum = a.attnum
         )
         and a.attname not in ('id', 'display_name', 'is_guest')
    ), 'ok')

  union all select
    6,
    'no un-fillable column was added to profile_privacy_settings',
    coalesce((
      select 'PROBLEM: profile_privacy_settings.' || string_agg(attname, ', ')
             || ' is NOT NULL with no default'
        from pg_attribute a
       where a.attrelid = 'public.profile_privacy_settings'::regclass
         and a.attnum > 0 and not a.attisdropped
         and a.attnotnull
         and not exists (
           select 1 from pg_attrdef d where d.adrelid = a.attrelid and d.adnum = a.attnum
         )
         and a.attname <> 'profile_id'
    ), 'ok')

  -- 7. profiles must not FORCE row level security: the definer function is
  --    owned by a superuser, and FORCE would make RLS apply to it too.
  union all select
    7,
    'profiles does not force RLS on its owner',
    case when (select relforcerowsecurity from pg_class where oid = 'public.profiles'::regclass)
      then 'PROBLEM: ALTER TABLE public.profiles NO FORCE ROW LEVEL SECURITY'
      else 'ok' end

  -- 8. The guest-flag trigger from 0014, which runs on the upgrade path.
  union all select
    8,
    'on_auth_user_anonymity_changed trigger exists (guest → registered)',
    case when exists (
      select 1 from pg_trigger
       where tgname = 'on_auth_user_anonymity_changed'
         and tgrelid = 'auth.users'::regclass
    ) then 'ok' else 'PROBLEM: apply supabase/migrations/0014_sync_guest_flag.sql' end

  -- 9. Accounts that already exist without a profile. Each one is a person who
  --    signed up while something above was broken; they will hit "profile not
  --    found" behaviour rather than a signup error.
  union all select
    9,
    'every auth user has a profile',
    case (select count(*) from auth.users u
           where not exists (select 1 from public.profiles p where p.id = u.id))
      when 0 then 'ok'
      else 'PROBLEM: ' || (select count(*)::text from auth.users u
              where not exists (select 1 from public.profiles p where p.id = u.id))
           || ' account(s) have no profile — see the repair at the bottom'
    end

  -- 10. And the same for privacy settings.
  union all select
    10,
    'every profile has privacy settings',
    case (select count(*) from public.profiles p
           where not exists (
             select 1 from public.profile_privacy_settings s where s.profile_id = p.id))
      when 0 then 'ok'
      else 'PROBLEM: some profiles have no privacy row — see the repair at the bottom'
    end
)
select n, what, verdict from checks order by n;

-- ===========================================================================
-- REPAIRS — run only the ones the report above asked for.
--
-- Nothing below runs as written; each is commented out deliberately, because
-- none of it should be run on a database that does not need it.
-- ===========================================================================

-- (a) The trigger is missing or disabled. This re-creates it exactly as
--     0001_schema.sql defines it, and is a no-op on a healthy database.
--
-- create or replace function public.handle_new_auth_user()
-- returns trigger language plpgsql security definer set search_path = public as $fn$
-- declare
--   v_name text;
-- begin
--   v_name := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
--   if v_name = '' then
--     v_name := coalesce(nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'שחקן');
--   end if;
--   insert into public.profiles (id, display_name, is_guest)
--   values (new.id, left(v_name, 40), coalesce(new.is_anonymous, false))
--   on conflict (id) do nothing;
--   insert into public.profile_privacy_settings (profile_id)
--   values (new.id)
--   on conflict (profile_id) do nothing;
--   return new;
-- end;
-- $fn$;
--
-- drop trigger if exists on_auth_user_created on auth.users;
-- create trigger on_auth_user_created
--   after insert on auth.users
--   for each row execute function public.handle_new_auth_user();
--
-- revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

-- (b) Accounts created while the trigger was broken. This gives each one the
--     profile it should have had, using the same rules the trigger uses.
--
-- insert into public.profiles (id, display_name, is_guest)
-- select u.id,
--        left(coalesce(
--          nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
--          nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
--          'שחקן'), 40),
--        coalesce(u.is_anonymous, false)
--   from auth.users u
--  where not exists (select 1 from public.profiles p where p.id = u.id)
-- on conflict (id) do nothing;
--
-- insert into public.profile_privacy_settings (profile_id)
-- select p.id from public.profiles p
--  where not exists (
--    select 1 from public.profile_privacy_settings s where s.profile_id = p.id)
-- on conflict (profile_id) do nothing;
