-- ============================================================
-- Church Connect - Phase 10: account approval gate
-- ============================================================

-- New signups need admin approval; existing users are grandfathered in.
alter table profiles add column if not exists account_approved boolean not null default false;
update profiles set account_approved = true;

-- Push notification when an account gets approved
create or replace function push_on_account_approval()
returns trigger language plpgsql security definer set search_path = public, extensions
as $$
begin
  if new.account_approved and not old.account_approved and new.push_token is not null then
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'to', new.push_token,
        'title', '🎉 Account approved!',
        'body', 'Welcome to Church Connect — you now have full access.',
        'sound', 'default'));
  end if;
  return new;
end; $$;

drop trigger if exists trg_push_approval on profiles;
create trigger trg_push_approval after update on profiles
  for each row execute function push_on_account_approval();
