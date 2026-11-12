-- Case comments. Run once in the Supabase SQL editor. RLS on with no policies, like every other table here:
-- all reads and writes go through the app's server routes, which enforce who may read (never the case's jurors
-- before the verdict).

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  network text not null,
  case_id bigint not null,
  person text not null,                    -- verified identity root, lowercased
  privy_user_id text not null,
  body text not null check (char_length(body) between 1 and 500),
  hidden boolean not null default false,   -- set by admins after a report
  deleted_at timestamptz,                  -- the author deleted it
  created_at timestamptz not null default now()
);
create index if not exists comments_case_idx on public.comments (network, case_id, created_at);
create index if not exists comments_person_idx on public.comments (network, person, created_at desc);

alter table public.comments enable row level security;

-- Reports can point at one comment (null = the whole case).
alter table public.reports add column if not exists comment_id uuid references public.comments (id) on delete set null;
