-- A key per meal, so the same meal is never saved twice (spec §7.2, M3 and
-- M4): the client creates a uuid with the meal in progress and sends it in
-- meal.client_key. If that user already has a meal with that key,
-- create_meal inserts nothing and returns the id of the existing one.
--
-- Compatible with the published version: the column accepts null, and a
-- payload without the key (the old client) is saved as before. Nulls never
-- collide in a unique constraint.

alter table public.meals
  add column client_key uuid;

alter table public.meals
  add constraint meals_user_client_key_key unique (user_id, client_key);

-- Privileges: authenticated already has insert and select on the whole table
-- (grant insert, select on table public.meals, migration 20261112041133),
-- which covers the new column; update stays limited to deleted_at, so the
-- key cannot be changed after saving. Nothing to grant here.

-- create_meal, as in migration 20261116050634, plus the key. The checks of
-- the payload run first, as before; then the insert, which does nothing if
-- the key already exists for this user. "on conflict do nothing" also
-- resolves two simultaneous calls with the same key: the second waits for
-- the first and inserts nothing. Then the existing meal is read (also if it
-- was soft-deleted: its id is returned anyway) and returned, without
-- touching its items.

create or replace function public.create_meal(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_meal public.meals;
  items_carbs numeric;
  new_meal_id uuid;
begin
  if jsonb_typeof(payload -> 'meal') is distinct from 'object' then
    raise exception 'create_meal: the payload has no meal';
  end if;
  if jsonb_typeof(payload -> 'items') is distinct from 'array'
    or jsonb_array_length(payload -> 'items') = 0 then
    raise exception 'create_meal: a meal needs at least one item';
  end if;

  new_meal := jsonb_populate_record(null::public.meals, payload -> 'meal');

  select sum(item.carbs_g)
    into items_carbs
    from jsonb_populate_recordset(null::public.meal_items, payload -> 'items') as item;

  -- "is not true" also rejects a missing (null) value.
  if (abs(new_meal.total_carbs_g - items_carbs) <= 0.001) is not true then
    raise exception 'create_meal: total_carbs_g is not the sum of the items';
  end if;
  if (abs(new_meal.calculated_dose_units
      - new_meal.total_carbs_g / new_meal.carb_ratio_g_per_unit) <= 0.001) is not true then
    raise exception 'create_meal: calculated_dose_units is not total_carbs_g / ratio';
  end if;

  insert into public.meals (
    eaten_at,
    carb_ratio_g_per_unit,
    total_carbs_g,
    calculated_dose_units,
    applied_dose_units,
    calc_version,
    client_key
  )
  values (
    new_meal.eaten_at,
    new_meal.carb_ratio_g_per_unit,
    new_meal.total_carbs_g,
    new_meal.calculated_dose_units,
    new_meal.applied_dose_units,
    new_meal.calc_version,
    new_meal.client_key
  )
  on conflict (user_id, client_key) do nothing
  returning id into new_meal_id;

  -- Only with a key that already exists (a null key never conflicts).
  if new_meal_id is null then
    select meal.id
      into new_meal_id
      from public.meals as meal
      where meal.user_id = (select auth.uid())
        and meal.client_key = new_meal.client_key;
    if new_meal_id is null then
      raise exception 'create_meal: the meal with that key was not found';
    end if;
    return new_meal_id;
  end if;

  insert into public.meal_items (
    meal_id,
    food_id,
    position,
    food_name,
    food_brand,
    food_source,
    food_state,
    quantity_mode,
    units,
    unit_weight_g,
    grams,
    carbs_per_100g,
    cooking_factor,
    effective_carbs_per_100g,
    carbs_g
  )
  select
    new_meal_id,
    item.food_id,
    item.position,
    item.food_name,
    item.food_brand,
    item.food_source,
    item.food_state,
    item.quantity_mode,
    item.units,
    item.unit_weight_g,
    item.grams,
    item.carbs_per_100g,
    item.cooking_factor,
    item.effective_carbs_per_100g,
    item.carbs_g
  from jsonb_populate_recordset(null::public.meal_items, payload -> 'items') as item;

  return new_meal_id;
end;
$$;

-- create or replace keeps the privileges, but they are stated again: only
-- signed-in users can call it.
revoke execute on function public.create_meal(jsonb) from public, anon;
grant execute on function public.create_meal(jsonb) to authenticated;
