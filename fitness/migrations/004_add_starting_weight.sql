-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
-- Adds a starting weight field to the challenge row for progress tracking.
alter table public.challenge add column if not exists starting_weight numeric;
