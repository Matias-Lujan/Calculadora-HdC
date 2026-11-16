-- Atomic creation of a meal and its items (spec §7.2, stage 7).
-- Replaces the provisional save of stage 5 (insert the meal, then its items).
--
-- payload: { "meal": { eaten_at, carb_ratio_g_per_unit, total_carbs_g,
--   calculated_dose_units, applied_dose_units, calc_version },
--   "items": [ { food_id, position, food_name, food_brand, food_source,
--   food_state, quantity_mode, units, unit_weight_g, grams, carbs_per_100g,
--   cooking_factor, effective_carbs_per_100g, carbs_g }, ... ] }
--
-- Only those keys are read: user_id, id, meal_id, deleted_at and the like
-- are ignored, and the column defaults set them (user_id = auth.uid()).
-- security invoker, so RLS, the column privileges and the CHECKs of meals
-- and meal_items apply as in a direct insert. A function runs in a single
-- transaction: if anything fails, nothing is saved.
--
-- The calculation lives in src/domain/dose. This function does not compute
-- anything of its own: like the CHECKs, it only compares what the client
-- sent (the total with the sum of the items, the dose with total / ratio),
-- with the same tolerance of 0.001.

create function public.create_meal(payload jsonb)
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
    calc_version
  )
  values (
    new_meal.eaten_at,
    new_meal.carb_ratio_g_per_unit,
    new_meal.total_carbs_g,
    new_meal.calculated_dose_units,
    new_meal.applied_dose_units,
    new_meal.calc_version
  )
  returning id into new_meal_id;

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

-- Only signed-in users can call it (functions are executable by public by
-- default, and Supabase also grants anon on new functions).
revoke execute on function public.create_meal(jsonb) from public, anon;
grant execute on function public.create_meal(jsonb) to authenticated;
