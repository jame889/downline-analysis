-- Security remediation: the app uses a custom server session and talks to
-- Supabase only with SUPABASE_SERVICE_ROLE_KEY from server-side route handlers.
-- Do not add anon/authenticated table policies unless the app is redesigned to
-- use Supabase Auth and the policy has been reviewed for row ownership.

do $$
declare
  table_name text;
  protected_tables text[] := array[
    'activity_log',
    'blocked_members',
    'business_report_snapshots',
    'business_report_sync_status',
    'daily_activities',
    'goals',
    'login_activity',
    'member_mbti',
    'members',
    'monthly_reports',
    'password_meta',
    'passwords',
    'telegram_bot_states',
    'telegram_config',
    'telegram_configs',
    'telegram_processed_updates'
  ];
begin
  foreach table_name in array protected_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('revoke all privileges on table public.%I from anon, authenticated', table_name);
    end if;
  end loop;
end $$;

-- Identity-backed sequences can otherwise remain insertable after table access
-- has been revoked. Existing rows and writes continue to work through the
-- server-only service role, which bypasses RLS.
revoke all privileges on all sequences in schema public from anon, authenticated;

-- Coach knowledge can contain internal training documents. Keep its storage
-- bucket private; the application accesses it only from authenticated server
-- routes with the service-role key.
do $$
begin
  if exists (select 1 from storage.buckets where id = 'knowledge') then
    update storage.buckets set public = false where id = 'knowledge';
  end if;
end $$;
