-- One-time agreement, taken right after sign-up, that cases may be shown publicly.
-- Replaces the per-case checkbox: every side saved from now on is checked against this table on the server.
-- Run once in the Supabase SQL editor. RLS on with no policies, like every other table here.

create table if not exists public.agreements (
  privy_user_id text primary key,
  version int not null,                     -- bump AGREEMENT_VERSION in the app to ask everyone again
  accepted_at timestamptz not null default now()
);

alter table public.agreements enable row level security;
