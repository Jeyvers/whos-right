-- Gas top-ups: small CELO amounts sent to users who don't have enough for their next action.
create table if not exists public.gas_topups (
  id bigserial primary key,
  network text not null,
  wallet text not null,                 -- lowercased recipient
  person text not null,                 -- verified identity root (lowercased), or 'privy:<id>' if unverified (testnet only)
  privy_user_id text not null,
  amount_wei numeric not null,
  status text not null default 'reserved' check (status in ('reserved', 'sent', 'failed')),
  tx_hash text,
  created_at timestamptz not null default now()
);
create index if not exists gas_topups_wallet_idx on public.gas_topups (network, wallet, created_at);
create index if not exists gas_topups_person_idx on public.gas_topups (network, person, created_at);
create index if not exists gas_topups_user_idx on public.gas_topups (network, privy_user_id, created_at);
alter table public.gas_topups enable row level security;

-- Atomically checks every limit for the last 24h and reserves the amount. Returns the new row id, or null with
-- the reason in `reason` if any limit would be exceeded. Failed top-ups don't count.
create or replace function public.gas_topup_reserve(
  p_network text, p_wallet text, p_person text, p_user text, p_amount numeric,
  p_max_wallet numeric, p_max_person numeric, p_max_user numeric, p_max_global numeric,
  out id bigint, out reason text
) language plpgsql security definer set search_path = public as $$
declare since timestamptz := now() - interval '24 hours';
begin
  perform pg_advisory_xact_lock(hashtext('gas_topup:' || p_network));
  if (select coalesce(sum(amount_wei), 0) from gas_topups where network = p_network and wallet = p_wallet and status <> 'failed' and created_at > since) + p_amount > p_max_wallet then
    reason := 'wallet'; return; end if;
  if (select coalesce(sum(amount_wei), 0) from gas_topups where network = p_network and person = p_person and status <> 'failed' and created_at > since) + p_amount > p_max_person then
    reason := 'person'; return; end if;
  if (select coalesce(sum(amount_wei), 0) from gas_topups where network = p_network and privy_user_id = p_user and status <> 'failed' and created_at > since) + p_amount > p_max_user then
    reason := 'person'; return; end if;
  if (select coalesce(sum(amount_wei), 0) from gas_topups where network = p_network and status <> 'failed' and created_at > since) + p_amount > p_max_global then
    reason := 'global'; return; end if;
  insert into gas_topups (network, wallet, person, privy_user_id, amount_wei)
    values (p_network, p_wallet, p_person, p_user, p_amount) returning gas_topups.id into id;
end $$;
revoke all on function public.gas_topup_reserve(text, text, text, text, numeric, numeric, numeric, numeric, numeric) from public, anon, authenticated;
