-- Juror notifications (web push + Telegram). Run once in the Supabase SQL editor.
-- RLS on with no policies: only the app's server routes (secret key) can read or write.

-- Per-person on/off switches. Missing row = both on.
create table if not exists public.notification_prefs (
  privy_user_id text primary key,
  push_enabled boolean not null default true,
  telegram_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- One row per browser/device that allowed notifications.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  privy_user_id text not null,
  wallets text[] not null,          -- lowercased wallets of that person, to find them when they're drawn
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_wallets_idx on public.push_subscriptions using gin (wallets);

-- Telegram: one linked chat per person, and short-lived link codes for the one-tap /start flow.
create table if not exists public.telegram_links (
  privy_user_id text primary key,
  chat_id text not null,
  wallets text[] not null,
  linked_at timestamptz not null default now()
);
create index if not exists telegram_links_wallets_idx on public.telegram_links using gin (wallets);
create table if not exists public.telegram_link_codes (
  code text primary key,
  privy_user_id text not null,
  wallets text[] not null,
  expires_at timestamptz not null
);

-- Each alert is sent once per juror per case.
create table if not exists public.notifications_sent (
  network text not null,
  case_id bigint not null,
  wallet text not null,
  kind text not null check (kind in ('drawn', 'reveal')),
  sent_at timestamptz not null default now(),
  primary key (network, case_id, wallet, kind)
);

alter table public.notification_prefs enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.telegram_links enable row level security;
alter table public.telegram_link_codes enable row level security;
alter table public.notifications_sent enable row level security;
