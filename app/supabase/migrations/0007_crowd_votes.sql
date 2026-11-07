-- Crowd votes: anyone verified can say who they think is right. Not binding and not paid; the random jury's
-- on-chain verdict is the official one. One vote per verified person (identity root) per case, final once cast.
-- Run once in the Supabase SQL editor. RLS on with no policies, like every other table here.

create table if not exists public.crowd_votes (
  network text not null,
  case_id bigint not null,
  person text not null,            -- verified identity root, lowercased (connected wallets share one vote)
  privy_user_id text not null,
  wallet text not null,
  vote smallint not null check (vote in (1, 2)),  -- 1 = side A, 2 = side B
  created_at timestamptz not null default now(),
  primary key (network, case_id, person)
);
create index if not exists crowd_votes_user_idx on public.crowd_votes (network, privy_user_id, created_at desc);
create index if not exists crowd_votes_person_idx on public.crowd_votes (network, person, created_at desc);

alter table public.crowd_votes enable row level security;
