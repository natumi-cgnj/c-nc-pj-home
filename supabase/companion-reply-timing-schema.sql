-- Additive; existing mail, grants and RLS stay intact. Old queued mail is timed
-- once, on its next available poll. No completed mail is rescheduled.
alter table public.jane_companion_messages
  add column if not exists reply_not_before timestamptz;
