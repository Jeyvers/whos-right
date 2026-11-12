-- Likes on comments. Run once in the Supabase SQL editor, after 0010_comments.sql.
-- One like per verified person per comment. Same reading rules as comments (enforced by the app's server routes).

create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments (id) on delete cascade,
  person text not null,                    -- verified identity root, lowercased
  privy_user_id text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, person)
);

alter table public.comment_likes enable row level security;
