-- Public reference values (spec §5.2, §7.1). Shared and read-only: written
-- only by migrations. The USDA seed comes in stage 7.

create table public.reference_foods (
  id uuid primary key default gen_random_uuid(),
  reference_db text not null check (reference_db in ('usda_fdc', 'argenfoods')),
  reference_code text not null,
  description_original text not null,
  name_es text not null,
  state text not null check (state in ('as_eaten', 'raw_cooked')),
  -- Available carbs: total carbs minus fiber.
  carbs_per_100g numeric not null check (carbs_per_100g between 0 and 100),
  total_carbs_per_100g numeric not null check (total_carbs_per_100g >= 0),
  fiber_per_100g numeric not null check (fiber_per_100g >= 0),
  unique (reference_db, reference_code),
  constraint reference_foods_carbs_without_fiber
    check (abs(carbs_per_100g - (total_carbs_per_100g - fiber_per_100g)) <= 0.001)
);

-- RLS: public data, but enabled like every other table. Signed-in users can
-- read; nobody can write through the API.
alter table public.reference_foods enable row level security;

create policy "reference_foods: select for signed-in users"
  on public.reference_foods for select to authenticated
  using (true);

revoke all on table public.reference_foods from anon, authenticated;
grant select on table public.reference_foods to authenticated;
