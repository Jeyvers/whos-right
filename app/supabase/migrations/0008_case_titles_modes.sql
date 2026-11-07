-- One-sided cases + case titles. Run once in the Supabase SQL editor.
-- title: A's case title (null for B's side). Part of the on-chain hash, so it can't be changed after paying.
-- strict: the side passed the stricter privacy rules required for one-sided cases (the other person can't reply).
alter table public.sides add column if not exists title text check (title is null or char_length(title) between 1 and 80);
alter table public.sides add column if not exists strict boolean not null default false;
