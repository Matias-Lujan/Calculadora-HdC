-- The sensor readings of the last 24 hours of a user (spec §7.1, §9.8, M10),
-- for the 24-hour chart. Only reference: never used by the dose calculation
-- (CLAUDE.md, rule 7) nor saved with a meal. The glucose-latest function
-- writes them, with the secret key, from the ~12 hours LibreLinkUp gives,
-- and deletes what is older than 24 hours every time it saves. The user only
-- reads their own.

create table public.glucose_readings (
  user_id uuid not null references auth.users (id) on delete cascade,
  measured_at timestamptz not null,
  -- mg/dL, a whole number as the sensor gives it.
  mgdl integer not null check (mgdl > 0),
  primary key (user_id, measured_at)
);

alter table public.glucose_readings enable row level security;

create policy "glucose_readings: select own"
  on public.glucose_readings
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Explicit privileges (tables are not exposed automatically). The user only
-- reads; the function (service_role, which bypasses RLS) reads, inserts and
-- deletes. Nobody updates a reading.
revoke all on table public.glucose_readings from anon, authenticated, service_role;
grant select on table public.glucose_readings to authenticated;
grant select, insert, delete on table public.glucose_readings to service_role;

-- When the function last saved the readings of that user, so it does it at
-- most every 15 minutes. Covered by the table grants of libre_sessions
-- (select, insert, update for service_role only). Nullable: the published
-- version of the function does not know it.
alter table public.libre_sessions add column graph_synced_at timestamptz;
