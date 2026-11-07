-- Runs the keeper every minute. Run this AFTER the app is deployed.
-- Before running, replace the three placeholders:
--   <APP_URL>            e.g. https://whos-right-git-main-yourteam.vercel.app  (a stable URL, not a one-off deploy URL)
--   <KEEPER_CRON_SECRET> the KEEPER_CRON_SECRET value from the app's environment
--   <VERCEL_BYPASS>      Vercel → Project → Settings → Deployment Protection → "Protection Bypass for Automation"
--                        (needed because preview protection blocks automated requests; leave it if protection is off)
-- Secrets go into Supabase Vault, not into the job text.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('<KEEPER_CRON_SECRET>', 'keeper_cron_secret');
select vault.create_secret('<VERCEL_BYPASS>', 'vercel_bypass');

select cron.schedule(
  'whos-right-keeper',
  '* * * * *',
  $$
  select net.http_post(
    url := '<APP_URL>/api/keeper/run',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'keeper_cron_secret'),
      'x-vercel-protection-bypass', (select decrypted_secret from vault.decrypted_secrets where name = 'vercel_bypass')
    ),
    timeout_milliseconds := 55000
  );
  $$
);

-- To stop it:  select cron.unschedule('whos-right-keeper');
-- To see runs: select * from cron.job_run_details order by start_time desc limit 20;
