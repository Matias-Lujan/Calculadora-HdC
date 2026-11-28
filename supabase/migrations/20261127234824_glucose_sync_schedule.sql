-- Scheduled sync of the glucose readings (spec §9.8, M10): every 3 hours,
-- pg_cron calls glucose-latest with the secret key, so the 24-hour chart has
-- no gaps even if the app stays closed for more than the ~12 hours
-- LibreLinkUp gives. Each run also deletes the run log older than 7 days.
--
-- No secret in this file. The URL and the key are read from Vault, and the
-- user creates them by hand in each project (SQL editor), once, after this
-- migration:
--
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/glucose-latest',
--     'glucose_sync_url'
--   );
--   select vault.create_secret('<the "default" secret key>', 'glucose_sync_key');
--
-- Until they exist, the runs fail without calling the function, and nothing
-- else changes.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'glucose-sync',
  '17 */3 * * *',
  $$
  delete from cron.job_run_details where end_time < now() - interval '7 days';
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'glucose_sync_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'glucose_sync_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
