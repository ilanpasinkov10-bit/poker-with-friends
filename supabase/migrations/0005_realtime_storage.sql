-- ===========================================================================
-- Poker With Friends — Realtime publication and avatar storage
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Realtime. Postgres changes are delivered through RLS, so a player only ever
-- receives events for rows they are already allowed to read.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'poker_tables', 'table_players', 'buyin_transactions', 'rebuy_requests',
    'chip_count_submissions', 'game_results', 'settlements'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- REPLICA IDENTITY FULL lets subscribers see the old row on UPDATE/DELETE,
-- which the client needs in order to filter deletes by table_id.
alter table public.table_players          replica identity full;
alter table public.rebuy_requests         replica identity full;
alter table public.buyin_transactions     replica identity full;
alter table public.chip_count_submissions replica identity full;

-- ---------------------------------------------------------------------------
-- Avatar storage. Files live at avatars/<user-id>/<random>.<ext>, so the
-- owning user is encoded in the path and enforced by policy.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true, 2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars are publicly readable" on storage.objects;
create policy "avatars are publicly readable" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "users upload their own avatar" on storage.objects;
create policy "users upload their own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users update their own avatar" on storage.objects;
create policy "users update their own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users delete their own avatar" on storage.objects;
create policy "users delete their own avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
