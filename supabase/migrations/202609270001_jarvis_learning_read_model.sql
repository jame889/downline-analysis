-- Jarvis Business Data Gateway V2 + learning read model.
-- All tables remain server-only: service-role access through authenticated API routes.
-- No anon/authenticated policies are added.

create table if not exists public.learning_modules (
  id text primary key,
  title text not null,
  track text not null,
  skill text not null,
  youtube_video_id text not null,
  duration_seconds integer,
  sequence integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.member_video_progress (
  member_id text not null,
  module_id text not null references public.learning_modules(id) on delete cascade,
  watched_seconds integer not null default 0,
  max_progress_pct numeric(5,2) not null default 0,
  completed_at timestamptz,
  last_watched_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (member_id, module_id)
);

create table if not exists public.member_assessments (
  id uuid primary key default gen_random_uuid(),
  member_id text not null,
  module_id text references public.learning_modules(id) on delete set null,
  skill text not null,
  score numeric(8,2) not null,
  max_score numeric(8,2) not null default 100,
  passed boolean not null default false,
  answers jsonb,
  assessed_at timestamptz not null default now()
);

create table if not exists public.member_skill_scores (
  member_id text not null,
  skill text not null,
  score numeric(5,2) not null check (score >= 0 and score <= 100),
  source_count integer not null default 0,
  evidence jsonb,
  updated_at timestamptz not null default now(),
  primary key (member_id, skill)
);

create table if not exists public.jarvis_data_access_audit (
  id uuid primary key default gen_random_uuid(),
  requested_at timestamptz not null default now(),
  endpoint text not null,
  scopes text[] not null,
  result_counts jsonb not null default '{}'::jsonb,
  success boolean not null default true
);

create index if not exists member_video_progress_member_idx
  on public.member_video_progress (member_id, updated_at desc);

create index if not exists member_assessments_member_idx
  on public.member_assessments (member_id, assessed_at desc);

create index if not exists member_skill_scores_member_idx
  on public.member_skill_scores (member_id, updated_at desc);

create index if not exists jarvis_data_access_audit_requested_idx
  on public.jarvis_data_access_audit (requested_at desc);

do $$
declare
  table_name text;
  protected_tables text[] := array[
    'learning_modules',
    'member_video_progress',
    'member_assessments',
    'member_skill_scores',
    'jarvis_data_access_audit'
  ];
begin
  foreach table_name in array protected_tables loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all privileges on table public.%I from anon, authenticated', table_name);
  end loop;
end $$;
