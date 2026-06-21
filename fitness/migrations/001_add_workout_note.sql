-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
-- Adds the column the app now writes to when you submit a workout comment.
alter table public.workout_sessions add column if not exists note text;
