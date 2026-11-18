-- When the user accepted the usage notice (spec §6.8, §7.1; plan M7): null
-- until they tap "Entendido" the first time they sign in. Nullable and
-- without a default, so the published version keeps working against it.

alter table public.user_settings
  add column usage_notice_accepted_at timestamptz;

-- Privileges: select on user_settings is granted on the whole table, so it
-- already covers the new column. Update is granted per column (the first
-- migration of the table), so the new one is added here. The existing
-- policies ("update own", "select own") already limit both to the user's
-- own row.
grant update (usage_notice_accepted_at)
  on table public.user_settings to authenticated;
