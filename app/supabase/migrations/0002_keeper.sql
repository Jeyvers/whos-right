-- Keeper state: one row per network. A short lease stops two runs (cron + user-triggered) sending at once.
create table if not exists public.keeper_state (
  network text primary key,
  lease_until timestamptz,
  next_case_id bigint not null default 1,   -- every case below this is finished (Resolved/Refunded)
  next_pool_index bigint not null default 0, -- where the pool-pruning sweep resumes
  capped_until timestamptz,                  -- set when the daily spending cap is hit
  last_run_at timestamptz,
  last_error text
);

-- CELO the keeper spent per UTC day (gas + randomness fees), in wei as text to avoid overflow.
create table if not exists public.keeper_spend (
  network text not null,
  day date not null,
  spent_wei numeric not null default 0,
  primary key (network, day)
);

-- Every keeper transaction, for audit and metrics.
create table if not exists public.keeper_txs (
  id bigserial primary key,
  network text not null,
  action text not null,
  case_id bigint,
  tx_hash text not null,
  cost_wei numeric not null,
  created_at timestamptz not null default now()
);

alter table public.keeper_state enable row level security;
alter table public.keeper_spend enable row level security;
alter table public.keeper_txs enable row level security;

-- Atomic lease: returns true if this caller got the lease.
create or replace function public.keeper_take_lease(p_network text, p_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare got boolean;
begin
  insert into keeper_state (network) values (p_network) on conflict (network) do nothing;
  update keeper_state set lease_until = now() + make_interval(secs => p_seconds)
    where network = p_network and (lease_until is null or lease_until < now());
  get diagnostics got = row_count;
  return got;
end $$;

-- Atomic spend add; returns the new total for the day.
create or replace function public.keeper_add_spend(p_network text, p_wei numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare total numeric;
begin
  insert into keeper_spend (network, day, spent_wei) values (p_network, (now() at time zone 'utc')::date, p_wei)
  on conflict (network, day) do update set spent_wei = keeper_spend.spent_wei + excluded.spent_wei
  returning spent_wei into total;
  return total;
end $$;

revoke all on function public.keeper_take_lease(text, int) from public, anon, authenticated;
revoke all on function public.keeper_add_spend(text, numeric) from public, anon, authenticated;
