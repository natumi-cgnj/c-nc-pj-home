-- Server-only connection credentials and short-lived routine results.
-- Apply with the Supabase migration add_claude_routine_bridge.
create table public.claude_routine_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  fire_url text not null check (fire_url ~ '^https://api[.]anthropic[.]com/v1/claude_code/routines/trig_[A-Za-z0-9_-]+/fire$'),
  fire_token text not null,
  updated_at timestamptz not null default now()
);

create table public.claude_routine_runs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  status text not null check (status in ('starting', 'running', 'uncertain', 'completed', 'failed', 'expired')),
  callback_hash text not null,
  result text,
  error_code text,
  session_url text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  finished_at timestamptz,
  unique (user_id, request_id)
);

create unique index claude_routine_one_active_per_user
  on public.claude_routine_runs (user_id)
  where status in ('starting', 'running', 'uncertain');
create index claude_routine_runs_user_created
  on public.claude_routine_runs (user_id, created_at desc);

alter table public.claude_routine_connections enable row level security;
alter table public.claude_routine_runs enable row level security;
revoke all on public.claude_routine_connections from public, anon, authenticated;
revoke all on public.claude_routine_runs from public, anon, authenticated;
grant select, insert, update, delete on public.claude_routine_connections to service_role;
grant select, insert, update, delete on public.claude_routine_runs to service_role;
-- No client policies: Edge Functions authenticate and scope every request.
