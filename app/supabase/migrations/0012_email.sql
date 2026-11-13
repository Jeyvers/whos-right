-- Email alerts (Resend). Run once in the Supabase SQL editor, after 0009.
-- Addresses are NOT stored here: they're read from the person's Privy account (verified email or Google) at send time.

-- Email switch. Missing row or column default = on. Turned off from Account or the unsubscribe link in any email.
alter table public.notification_prefs add column if not exists email_enabled boolean not null default true;

-- New alert kinds, still sent at most once per wallet per case per kind:
--   joined     to A: the other person added their side (two-sided)
--   nudge      to A: the other person hasn't joined and the invite is close to expiring
--   verdict    to both parties: the jury decided
--   refund     to the parties: no verdict, their fee is ready to withdraw
--   juror_paid to jurors who revealed: their share is ready to withdraw
alter table public.notifications_sent drop constraint if exists notifications_sent_kind_check;
alter table public.notifications_sent add constraint notifications_sent_kind_check
  check (kind in ('drawn', 'reveal', 'joined', 'nudge', 'verdict', 'refund', 'juror_paid'));
