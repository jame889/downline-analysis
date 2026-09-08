-- Outbound notifications need their own durable receipts; inbound update ids stay unchanged.
create table if not exists public.telegram_deliveries (
  delivery_key text primary key,
  member_id text not null,
  notification_type text not null,
  source_version text not null,
  state text not null check (state in ('pending', 'sent', 'failed', 'unknown')),
  attempt_id uuid not null,
  telegram_message_id bigint,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.telegram_deliveries enable row level security;
revoke all on public.telegram_deliveries from public, anon, authenticated;
grant select, insert, update on public.telegram_deliveries to service_role;
create index if not exists telegram_deliveries_monitor_idx on public.telegram_deliveries (state, updated_at);
