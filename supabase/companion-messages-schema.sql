-- Dedicated correspondence only. Existing application records are never changed.
create table public.jane_companion_messages (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  dedupe_key text not null check (length(dedupe_key) <= 160),
  kind text not null check (kind in ('message', 'letter')),
  user_text text not null default '' check (length(user_text) <= 2000),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  reply text not null default '' check (length(reply) <= 1600),
  state_label text not null default '',
  record_keys jsonb not null default '[]'::jsonb check (jsonb_typeof(record_keys) = 'array'),
  run_id uuid references public.claude_routine_runs(id) on delete set null,
  error_code text,
  created_at timestamptz not null default now(),
  replied_at timestamptz,
  unique (user_id, dedupe_key)
);
create index jane_companion_messages_user_created on public.jane_companion_messages(user_id, created_at desc);
alter table public.jane_companion_messages enable row level security;
revoke all on public.jane_companion_messages from public, anon, authenticated;
grant select, insert, update, delete on public.jane_companion_messages to service_role;
-- No client policies. Authenticated Edge Functions scope all operations by user_id.
