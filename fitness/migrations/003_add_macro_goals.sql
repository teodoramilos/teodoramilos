-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
-- Adds editable macro targets to the challenge row (kcal_goal already exists).
alter table public.challenge add column if not exists protein_goal int;
alter table public.challenge add column if not exists carbs_goal int;
alter table public.challenge add column if not exists fat_goal int;
