-- Meal records and their items (spec §6.6, §6.7, §7.1, §7.2).
-- The calculation itself lives in src/domain/dose; these CHECKs are a safety
-- net that verifies the arithmetic of each stored row (tolerance 0.001).

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  eaten_at timestamptz not null,
  -- Ratio used at that moment, so later changes do not alter history.
  carb_ratio_g_per_unit numeric not null check (carb_ratio_g_per_unit > 0),
  total_carbs_g numeric not null check (total_carbs_g >= 0),
  -- Exact value, never rounded.
  calculated_dose_units numeric not null check (calculated_dose_units >= 0),
  applied_dose_units numeric check (applied_dose_units >= 0),
  calc_version text not null check (length(calc_version) > 0),
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),

  -- Target of the composite foreign key from meal_items.
  unique (id, user_id),
  constraint meals_dose_matches_ratio
    check (abs(calculated_dose_units - total_carbs_g / carb_ratio_g_per_unit) <= 0.001)
);

create index meals_user_eaten_at_idx
  on public.meals (user_id, eaten_at desc)
  where deleted_at is null;

create table public.meal_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  meal_id uuid not null,
  food_id uuid not null,
  position integer not null check (position >= 0),

  -- Copy of the food values used at that moment (spec §6.7).
  food_name text not null,
  food_brand text,
  food_source text not null check (food_source in ('label', 'reference', 'manual')),
  food_state text not null check (food_state in ('as_eaten', 'raw_cooked')),
  quantity_mode text not null check (quantity_mode in ('grams', 'units')),
  units numeric check (units > 0),
  unit_weight_g numeric check (unit_weight_g > 0),
  grams numeric not null check (grams > 0),
  carbs_per_100g numeric not null check (carbs_per_100g between 0 and 100),
  cooking_factor numeric check (cooking_factor > 0),
  effective_carbs_per_100g numeric not null
    check (effective_carbs_per_100g between 0 and 100),
  carbs_g numeric not null check (carbs_g >= 0),

  -- An item can only belong to a meal and a food of the same user.
  foreign key (meal_id, user_id)
    references public.meals (id, user_id) on delete cascade,
  foreign key (food_id, user_id)
    references public.foods (id, user_id),
  unique (meal_id, position),

  -- Units: only for foods eaten as they are (spec §6.6, decision 23).
  constraint meal_items_units_fields
    check (
      (quantity_mode = 'grams' and units is null)
      or (quantity_mode = 'units' and units is not null and unit_weight_g is not null
          and food_state = 'as_eaten')
    ),
  -- The factor is stored only when it was used.
  constraint meal_items_factor_matches_state
    check ((food_state = 'raw_cooked') = (cooking_factor is not null)),
  -- Arithmetic of the row (spec §8.2).
  constraint meal_items_grams_from_units
    check (quantity_mode = 'grams' or abs(grams - units * unit_weight_g) <= 0.001),
  constraint meal_items_effective_carbs
    check (
      abs(effective_carbs_per_100g - case
        when food_state = 'raw_cooked' then carbs_per_100g / cooking_factor
        else carbs_per_100g
      end) <= 0.001
    ),
  constraint meal_items_carbs
    check (abs(carbs_g - grams * effective_carbs_per_100g / 100) <= 0.001)
);

create index meal_items_meal_id_idx on public.meal_items (meal_id);
create index meal_items_food_id_idx on public.meal_items (food_id, user_id);

-- RLS: each user sees and creates only their own records. Records are not
-- edited (spec §6.7): the only change allowed is the soft delete of a meal.
alter table public.meals enable row level security;
alter table public.meal_items enable row level security;

create policy "meals: select own"
  on public.meals for select to authenticated
  using (user_id = (select auth.uid()));

create policy "meals: insert own"
  on public.meals for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "meals: update own"
  on public.meals for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "meal_items: select own"
  on public.meal_items for select to authenticated
  using (user_id = (select auth.uid()));

create policy "meal_items: insert own"
  on public.meal_items for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Column privileges: in meals only deleted_at can be updated; meal_items
-- cannot be updated or deleted at all.
revoke all on table public.meals from anon, authenticated;
grant select, insert on table public.meals to authenticated;
grant update (deleted_at) on table public.meals to authenticated;

revoke all on table public.meal_items from anon, authenticated;
grant select, insert on table public.meal_items to authenticated;
