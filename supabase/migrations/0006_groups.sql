-- ===========================================================================
-- Poker With Friends — recurring poker circles
--
-- A "group" is the regular crew that plays together week after week. Tables
-- optionally belong to one, which is what makes cross-night history and the
-- table leaderboard meaningful.
-- ===========================================================================

create unique index if not exists poker_groups_owner_name_uniq
  on public.poker_groups (owner_id, lower(btrim(name)));

create or replace function public.get_or_create_poker_group(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := public.require_uid();
  v_name text := btrim(p_name);
  v_id   uuid;
begin
  if char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'INVALID_INPUT';
  end if;

  select id into v_id
    from public.poker_groups
   where owner_id = v_uid and lower(btrim(name)) = lower(v_name);
  if v_id is not null then
    return v_id;
  end if;

  insert into public.poker_groups (name, owner_id)
  values (v_name, v_uid)
  returning id into v_id;

  return v_id;
end;
$$;
