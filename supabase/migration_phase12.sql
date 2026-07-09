-- ============================================================
-- Church Connect - Phase 12: self-service account deletion
-- ============================================================

-- Deletes the calling user's auth account; profiles row cascades,
-- group memberships / messages cascade from profiles.
create or replace function delete_my_account()
returns void
language plpgsql security definer set search_path = public, auth
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

grant execute on function delete_my_account() to authenticated;
