-- Personal settings: one row per user (spec §6.8, §7.1).

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  carb_ratio_g_per_unit numeric not null default 15
    check (carb_ratio_g_per_unit > 0),
  max_dose_warning_units numeric
    check (max_dose_warning_units > 0),
  max_item_grams_warning numeric not null default 500
    check (max_item_grams_warning > 0),
  updated_at timestamptz not null default now()
);

create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

-- RLS: each user reads and edits only their own row. No insert policy (the
-- trigger below creates the row) and no delete policy (the row goes away
-- with the user).
alter table public.user_settings enable row level security;

create policy "user_settings: select own"
  on public.user_settings for select to authenticated
  using (user_id = (select auth.uid()));

create policy "user_settings: update own"
  on public.user_settings for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Explicit privileges (tables are not exposed automatically). Only the
-- setting columns can be updated, never user_id.
revoke all on table public.user_settings from anon, authenticated;
grant select on table public.user_settings to authenticated;
grant update (carb_ratio_g_per_unit, max_dose_warning_units, max_item_grams_warning)
  on table public.user_settings to authenticated;

-- Creates the settings row when a user signs up.
-- security definer, documented reason: the trigger runs as the Auth service
-- role, which has no privileges on public tables, and there is no insert
-- policy for users. search_path is pinned so the function cannot be hijacked.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_settings (user_id) values (new.id);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
