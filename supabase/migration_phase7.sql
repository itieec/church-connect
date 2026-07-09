-- ============================================================
-- Church Connect - Phase 7: profile photos + push tokens
-- ============================================================

-- Push notification token per user
alter table profiles add column if not exists push_token text;

-- Public avatars bucket
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Anyone can view avatars; users manage their own file (named <uid>.jpg)
create policy "avatar_read" on storage.objects
  for select to public using (bucket_id = 'avatars');
create policy "avatar_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and name like auth.uid() || '%');
create policy "avatar_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and name like auth.uid() || '%');
create policy "avatar_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and name like auth.uid() || '%');
