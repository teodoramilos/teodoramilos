-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
-- Backs the in-app chat thread (replaces the abandoned email-notification function).
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  kind text not null default 'chat' check (kind in ('chat','workout_summary')),
  created_at timestamptz default now()
);
alter table public.messages enable row level security;
create policy "msg_read"  on public.messages for select to authenticated using (true);
create policy "msg_write" on public.messages for insert to authenticated with check (auth.uid() = sender_id);
