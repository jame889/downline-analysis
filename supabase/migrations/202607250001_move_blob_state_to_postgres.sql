create table if not exists public.telegram_configs (
  member_id text primary key,
  chat_id text not null,
  bot_token text,
  enabled boolean not null default true,
  notifications jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.telegram_bot_states (
  member_id text primary key,
  conversation jsonb not null default '[]'::jsonb,
  last_activity_id text,
  updated_at timestamptz not null default now()
);

create table if not exists public.telegram_processed_updates (
  update_id text primary key,
  processed_at timestamptz not null default now()
);
create index if not exists telegram_processed_updates_processed_at_idx
  on public.telegram_processed_updates (processed_at);

create table if not exists public.daily_activities (
  id text primary key,
  member_id text not null,
  activity_date date not null,
  start_time text not null,
  end_time text not null default '',
  activity_type text not null,
  details text not null default '',
  left_count integer not null default 0,
  right_count integer not null default 0,
  status text,
  outcome text,
  contact_name text,
  outcome_notes text,
  follow_up_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists daily_activities_member_date_idx
  on public.daily_activities (member_id, activity_date);

create table if not exists public.member_mbti (
  member_id text primary key,
  mbti text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.business_report_snapshots (
  month text primary key,
  checksum text not null,
  members jsonb not null,
  reports jsonb not null,
  synced_at timestamptz not null
);

create table if not exists public.business_report_sync_status (
  singleton boolean primary key default true check (singleton),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.telegram_configs enable row level security;
alter table public.telegram_bot_states enable row level security;
alter table public.telegram_processed_updates enable row level security;
alter table public.daily_activities enable row level security;
alter table public.member_mbti enable row level security;
alter table public.business_report_snapshots enable row level security;
alter table public.business_report_sync_status enable row level security;

revoke all on public.telegram_configs from anon, authenticated;
revoke all on public.telegram_bot_states from anon, authenticated;
revoke all on public.telegram_processed_updates from anon, authenticated;
revoke all on public.daily_activities from anon, authenticated;
revoke all on public.member_mbti from anon, authenticated;
revoke all on public.business_report_snapshots from anon, authenticated;
revoke all on public.business_report_sync_status from anon, authenticated;
