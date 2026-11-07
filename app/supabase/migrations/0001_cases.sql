-- Who's Right? app tables. Run once in the Supabase SQL editor.
-- Row Level Security is ON with NO policies: browsers (publishable key) can read/write nothing.
-- Every read and write goes through the app's server routes, which use the secret key server-side only.

create table if not exists public.sides (
  id uuid primary key default gen_random_uuid(),
  network text not null,
  privy_user_id text not null,
  body text not null check (char_length(body) between 1 and 1000),
  salt text not null,                       -- 0x-prefixed bytes32
  content_hash text not null,               -- keccak256(abi.encode(salt, body)), stored on-chain
  public_consent boolean not null,          -- agreed the case may be shown publicly
  case_id bigint,                           -- set once linked to an on-chain case
  role text check (role in ('A', 'B')),
  created_at timestamptz not null default now(),
  unique (network, content_hash)
);
create index if not exists sides_case_idx on public.sides (network, case_id);

create table if not exists public.case_flags (
  network text not null,
  case_id bigint not null,
  hidden boolean not null default false,    -- set by admins for harmful cases
  removal_requested_at timestamptz,         -- either party asked to take it off public view
  removal_requested_by text,
  primary key (network, case_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  network text not null,
  case_id bigint not null,
  reporter_user_id text not null,
  reason text not null check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now()
);

-- Fallback vote keys, only for wallets whose signatures aren't repeatable (disclosed to the juror).
create table if not exists public.vote_salts (
  network text not null,
  case_id bigint not null,
  juror text not null,
  salt text not null,
  created_at timestamptz not null default now(),
  primary key (network, case_id, juror)
);

alter table public.sides enable row level security;
alter table public.case_flags enable row level security;
alter table public.reports enable row level security;
alter table public.vote_salts enable row level security;
