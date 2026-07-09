-- ============================================================
-- Church Connect - Phase 11: notify admins on new signups
-- ============================================================

create or replace function push_admins_on_signup()
returns trigger language plpgsql security definer set search_path = public, extensions
as $$
declare msgs jsonb;
begin
  if not new.account_approved then
    select jsonb_agg(jsonb_build_object(
      'to', push_token,
      'title', '🔑 New account waiting',
      'body', new.full_name || ' signed up and needs approval.',
      'sound', 'default'))
    into msgs
    from profiles
    where push_token is not null
      and role in ('super_admin', 'admin')
      and id <> new.id;
    if msgs is not null then
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := msgs);
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_push_admin_signup on profiles;
create trigger trg_push_admin_signup after insert on profiles
  for each row execute function push_admins_on_signup();
