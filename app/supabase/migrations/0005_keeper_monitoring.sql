-- Keeper run log, failure log, and a watchdog that alerts you. Run once in the SQL editor.
-- The watchdog runs INSIDE Supabase (pg_cron), so it still alerts if the app or Vercel is down.
--
-- Alerts go to Telegram. Before running, replace <TELEGRAM_BOT_TOKEN> and <TELEGRAM_CHAT_ID>.
-- Both are stored in Supabase Vault, not in the job's text.

create table if not exists public.keeper_runs (
  id bigserial primary key,
  network text not null,
  trigger text not null,                 -- cron | user | joined
  started_at timestamptz not null,
  finished_at timestamptz not null,
  outcome text not null,                 -- ok | capped | budget_low | error
  txs_sent int not null default 0,
  failures int not null default 0,
  error text,
  keeper_balance_wei numeric,
  topup_balance_wei numeric,
  keeper_balance_low boolean,
  topup_balance_low boolean
);
create index if not exists keeper_runs_recent_idx on public.keeper_runs (network, finished_at desc);

create table if not exists public.keeper_failures (
  id bigserial primary key,
  network text not null,
  action text not null,
  case_id bigint,
  pool_index bigint,
  error text not null,
  created_at timestamptz not null default now()
);
create index if not exists keeper_failures_recent_idx on public.keeper_failures (network, created_at desc);

-- One row per alert kind, so each alert is sent at most once an hour while the problem lasts.
create table if not exists public.keeper_alerts (
  network text not null,
  kind text not null,
  last_sent_at timestamptz,
  last_message text,
  primary key (network, kind)
);

alter table public.keeper_runs enable row level security;
alter table public.keeper_failures enable row level security;
alter table public.keeper_alerts enable row level security;

create or replace function public.keeper_watchdog(p_network text)
returns text language plpgsql security definer set search_path = public as $$
declare
  last_ok timestamptz;
  latest record;
  repeat record;
  msgs text[] := '{}';
  kinds text[] := '{}';
  i int;
  bot text;
  chat text;
begin
  -- 1. No run for 10 minutes (any finished run counts; the schedule is every minute)
  select max(finished_at) into last_ok from keeper_runs where network = p_network;
  if last_ok is null or last_ok < now() - interval '10 minutes' then
    kinds := kinds || 'stale';
    msgs := msgs || format('No keeper run for %s. Last run: %s.',
      coalesce(to_char(now() - last_ok, 'HH24"h "MI"m"'), 'ever'), coalesce(last_ok::text, 'never'));
  end if;

  -- 2. The same action on the same case failing 3+ times in 30 minutes, or 3 runs in a row erroring
  for repeat in
    select action, case_id, pool_index, count(*) as n, max(error) as err from keeper_failures
    where network = p_network and created_at > now() - interval '30 minutes'
    group by action, case_id, pool_index having count(*) >= 3
  loop
    kinds := kinds || ('failing:' || repeat.action || ':' || coalesce(repeat.case_id::text, 'pool' || repeat.pool_index::text));
    msgs := msgs || format('%s on %s failed %s times in 30 min: %s', repeat.action,
      coalesce('case ' || repeat.case_id, 'pool entry ' || repeat.pool_index), repeat.n, left(repeat.err, 200));
  end loop;
  if (select count(*) from (select outcome from keeper_runs where network = p_network order by finished_at desc limit 3) r
      where outcome = 'error') = 3 then
    kinds := kinds || 'run_errors';
    msgs := msgs || format('The last 3 keeper runs errored: %s',
      left((select error from keeper_runs where network = p_network order by finished_at desc limit 1), 200));
  end if;

  -- 3. Low wallet balances (thresholds are set in the app: KEEPER_LOW_BALANCE_CELO / TOPUP_LOW_BALANCE_CELO)
  select * into latest from keeper_runs where network = p_network order by finished_at desc limit 1;
  if latest.keeper_balance_low then
    kinds := kinds || 'keeper_low';
    msgs := msgs || format('Keeper wallet is low: %s CELO.', round(latest.keeper_balance_wei / 1e18, 3));
  end if;
  if latest.topup_balance_low then
    kinds := kinds || 'topup_low';
    msgs := msgs || format('Gas top-up wallet is low: %s CELO.', round(latest.topup_balance_wei / 1e18, 3));
  end if;

  -- Send each problem at most once an hour.
  select decrypted_secret into bot from vault.decrypted_secrets where name = 'telegram_bot_token';
  select decrypted_secret into chat from vault.decrypted_secrets where name = 'telegram_chat_id';
  for i in 1 .. coalesce(array_length(kinds, 1), 0) loop
    if not exists (select 1 from keeper_alerts where network = p_network and kind = kinds[i]
                   and last_sent_at > now() - interval '1 hour') then
      if bot is not null and chat is not null then
        perform net.http_post(
          url := 'https://api.telegram.org/bot' || bot || '/sendMessage',
          body := jsonb_build_object('chat_id', chat,
                                     'text', '⚖️ Who''s Right? (' || p_network || '): ' || msgs[i]),
          headers := '{"content-type": "application/json"}'::jsonb
        );
      end if;
      insert into keeper_alerts (network, kind, last_sent_at, last_message) values (p_network, kinds[i], now(), msgs[i])
      on conflict (network, kind) do update set last_sent_at = now(), last_message = excluded.last_message;
    end if;
  end loop;

  -- Housekeeping: keep two weeks of logs.
  delete from keeper_runs where finished_at < now() - interval '14 days';
  delete from keeper_failures where created_at < now() - interval '14 days';

  return coalesce(array_to_string(msgs, ' | '), 'all good');
end $$;
revoke all on function public.keeper_watchdog(text) from public, anon, authenticated;

select vault.create_secret('<TELEGRAM_BOT_TOKEN>', 'telegram_bot_token');
select vault.create_secret('<TELEGRAM_CHAT_ID>', 'telegram_chat_id');
select cron.schedule('whos-right-keeper-watchdog', '*/5 * * * *', $$ select public.keeper_watchdog('celo-sepolia'); $$);

-- Try it now (returns the current problems, or 'all good'):
-- select public.keeper_watchdog('celo-sepolia');
