// Isolation check for the Supabase project in .env.local (plan, stage 2).
// Signs in as two test users, A and B, through the same API the app uses,
// and checks that neither can see or change the other's data, plus the
// column privileges and the main safety-net CHECKs.
//
// Needs in .env.local: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY,
// RLS_CHECK_A_EMAIL, RLS_CHECK_A_PASSWORD, RLS_CHECK_B_EMAIL,
// RLS_CHECK_B_PASSWORD. Both users are throwaway: create them in the
// dashboard (Auto Confirm User) before running, delete them afterwards and
// their rows go with them (on delete cascade). Keep the variables: to run it
// again, create the users again with the same emails and passwords.
// Never use a real account here.
//
// Run: node --env-file=.env.local scripts/rls-check/check.ts
// Update it whenever a table or a policy is added (CLAUDE.md, rule 1).

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function env(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`Falta ${name} en .env.local`)
    process.exit(1)
  }
  return value
}

const url = env('VITE_SUPABASE_URL')
const key = env('VITE_SUPABASE_PUBLISHABLE_KEY')
const BUCKET = 'food-photos'
// Smallest valid JPEG: the bucket only accepts image/jpeg.
const JPEG = Uint8Array.from(
  Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=',
    'base64',
  ),
)

function client(): SupabaseClient {
  return createClient(url, key, { auth: { persistSession: false } })
}

async function signIn(prefix: 'A' | 'B') {
  const supabase = client()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: env(`RLS_CHECK_${prefix}_EMAIL`),
    password: env(`RLS_CHECK_${prefix}_PASSWORD`),
  })
  if (error || !data.user) {
    console.error(`No se pudo iniciar sesión como ${prefix}: ${error?.message}`)
    process.exit(1)
  }
  return { supabase, id: data.user.id }
}

let failures = 0
function check(description: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(
    `${ok ? '✓' : '✗'} ${description}${ok || !detail ? '' : `  → ${detail}`}`,
  )
}

/** Fails with the setup error, since nothing after it would be meaningful. */
function must<T>(
  result: { data: T; error: { message: string } | null },
  what: string,
): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    console.error(
      `Falla al preparar los datos (${what}): ${result.error?.message}`,
    )
    process.exit(1)
  }
  return result.data
}

const a = await signIn('A')
const b = await signIn('B')
const anon = client()

// --- Setup: data owned by A ------------------------------------------------

const foodA = must(
  await a.supabase
    .from('foods')
    .insert({
      name: 'rls-check arroz',
      source: 'manual',
      notes: 'rls-check',
      state: 'raw_cooked',
      carbs_per_100g: 78,
      cooking_factor: 2.6,
    })
    .select()
    .single(),
  'food de A',
)
const mealA = must(
  await a.supabase
    .from('meals')
    .insert({
      eaten_at: new Date().toISOString(),
      carb_ratio_g_per_unit: 15,
      total_carbs_g: 75,
      calculated_dose_units: 5,
      calc_version: '1',
    })
    .select()
    .single(),
  'meal de A',
)
const itemA = must(
  await a.supabase
    .from('meal_items')
    .insert({
      meal_id: mealA.id,
      food_id: foodA.id,
      position: 0,
      food_name: 'rls-check arroz',
      food_source: 'manual',
      food_state: 'raw_cooked',
      quantity_mode: 'grams',
      grams: 250,
      carbs_per_100g: 78,
      cooking_factor: 2.6,
      effective_carbs_per_100g: 30,
      carbs_g: 75,
    })
    .select()
    .single(),
  'meal_item de A',
)
must(
  await a.supabase
    .from('vision_requests')
    .insert({ status: 'rls-check' })
    .select()
    .single(),
  'vision_request de A',
)
const photoA = `${a.id}/rls-check.jpg`
must(
  await a.supabase.storage
    .from(BUCKET)
    .upload(photoA, JPEG, { contentType: 'image/jpeg' }),
  'foto de A',
)

// --- B cannot see A's data ---------------------------------------------------

console.log('\nB no ve los datos de A')
for (const [table, column, value] of [
  ['user_settings', 'user_id', a.id],
  ['foods', 'id', foodA.id],
  ['meals', 'id', mealA.id],
  ['meal_items', 'id', itemA.id],
  ['vision_requests', 'user_id', a.id],
] as const) {
  const { data, error } = await b.supabase
    .from(table)
    .select('*')
    .eq(column, value)
  check(
    `${table}: B no ve filas de A`,
    !error && data?.length === 0,
    error?.message ?? `${data?.length} filas`,
  )
}
{
  const { data } = await b.supabase.from('user_settings').select('user_id')
  check(
    'user_settings: B ve solo su propia fila',
    data?.length === 1 && data[0]?.user_id === b.id,
  )
}

// --- B cannot write A's data -------------------------------------------------

console.log('\nB no puede escribir datos de A')
{
  const { error } = await b.supabase.from('foods').insert({
    user_id: a.id,
    name: 'intruso',
    source: 'manual',
    notes: 'x',
    state: 'as_eaten',
    carbs_per_100g: 10,
  })
  check('foods: B no puede insertar con el user_id de A', error !== null)
}
{
  const { error } = await b.supabase.from('meals').insert({
    user_id: a.id,
    eaten_at: new Date().toISOString(),
    carb_ratio_g_per_unit: 15,
    total_carbs_g: 0,
    calculated_dose_units: 0,
    calc_version: '1',
  })
  check('meals: B no puede insertar con el user_id de A', error !== null)
}
{
  const { data } = await b.supabase
    .from('foods')
    .update({ name: 'cambiado por B' })
    .eq('id', foodA.id)
    .select()
  const { data: still } = await a.supabase
    .from('foods')
    .select('name')
    .eq('id', foodA.id)
    .single()
  check(
    'foods: B no puede modificar un alimento de A',
    (data?.length ?? 0) === 0 && still?.name === 'rls-check arroz',
  )
}
{
  const { data } = await b.supabase
    .from('user_settings')
    .update({ carb_ratio_g_per_unit: 1 })
    .eq('user_id', a.id)
    .select()
  const { data: still } = await a.supabase
    .from('user_settings')
    .select('carb_ratio_g_per_unit')
    .single()
  check(
    'user_settings: B no puede modificar la configuración de A',
    (data?.length ?? 0) === 0 && Number(still?.carb_ratio_g_per_unit) === 15,
  )
}
{
  const { data } = await b.supabase
    .from('meals')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', mealA.id)
    .select()
  check(
    'meals: B no puede borrar (lógicamente) una comida de A',
    (data?.length ?? 0) === 0,
  )
}
{
  const { error } = await b.supabase.from('foods').delete().eq('id', foodA.id)
  check('foods: B no puede borrar un alimento de A', error !== null)
}

console.log('\nB no puede colgar datos de los de A')
{
  const ownMeal = must(
    await b.supabase
      .from('meals')
      .insert({
        eaten_at: new Date().toISOString(),
        carb_ratio_g_per_unit: 15,
        total_carbs_g: 75,
        calculated_dose_units: 5,
        calc_version: '1',
      })
      .select()
      .single(),
    'meal de B',
  )
  const item = {
    position: 0,
    food_name: 'x',
    food_source: 'manual',
    food_state: 'raw_cooked',
    quantity_mode: 'grams',
    grams: 250,
    carbs_per_100g: 78,
    cooking_factor: 2.6,
    effective_carbs_per_100g: 30,
    carbs_g: 75,
  }
  const toForeignMeal = await b.supabase
    .from('meal_items')
    .insert({ ...item, meal_id: mealA.id, food_id: foodA.id })
  check(
    'meal_items: B no puede agregar un ítem a una comida de A',
    toForeignMeal.error !== null,
  )
  const toForeignFood = await b.supabase
    .from('meal_items')
    .insert({ ...item, meal_id: ownMeal.id, food_id: foodA.id })
  check(
    'meal_items: B no puede usar un alimento de A en su comida',
    toForeignFood.error !== null,
  )
}

// --- Storage -----------------------------------------------------------------

console.log('\nFotos')
{
  const list = await b.supabase.storage.from(BUCKET).list(a.id)
  check('B no puede listar la carpeta de A', (list.data?.length ?? 0) === 0)
  const download = await b.supabase.storage.from(BUCKET).download(photoA)
  check('B no puede descargar una foto de A', download.error !== null)
  const upload = await b.supabase.storage
    .from(BUCKET)
    .upload(`${a.id}/intruso.jpg`, JPEG, { contentType: 'image/jpeg' })
  check('B no puede subir a la carpeta de A', upload.error !== null)
  const remove = await b.supabase.storage.from(BUCKET).remove([photoA])
  const stillThere = await a.supabase.storage.from(BUCKET).download(photoA)
  check(
    'B no puede borrar una foto de A',
    (remove.data?.length ?? 0) === 0 && stillThere.error === null,
  )
  const own = await b.supabase.storage
    .from(BUCKET)
    .upload(`${b.id}/rls-check.jpg`, JPEG, { contentType: 'image/jpeg' })
  check(
    'B sí puede subir a su propia carpeta',
    own.error === null,
    own.error?.message,
  )
  const notJpeg = await b.supabase.storage
    .from(BUCKET)
    .upload(`${b.id}/x.png`, JPEG, { contentType: 'image/png' })
  check('El bucket rechaza lo que no es JPEG', notJpeg.error !== null)
}

// --- reference_foods -----------------------------------------------------------

console.log('\nreference_foods')
{
  const read = await b.supabase.from('reference_foods').select('*').limit(1)
  check(
    'Un usuario puede leer reference_foods',
    read.error === null,
    read.error?.message,
  )
  const write = await b.supabase.from('reference_foods').insert({
    reference_db: 'usda_fdc',
    reference_code: 'x',
    description_original: 'x',
    name_es: 'x',
    state: 'as_eaten',
    carbs_per_100g: 1,
    total_carbs_per_100g: 1,
    fiber_per_100g: 0,
  })
  check('Nadie puede escribir en reference_foods', write.error !== null)
}

// --- Column privileges: records are not edited ---------------------------------

console.log('\nRegistros inmutables (privilegios por columna)')
{
  const editMeal = await a.supabase
    .from('meals')
    .update({ total_carbs_g: 1 })
    .eq('id', mealA.id)
  check(
    'meals: A no puede editar otra columna que deleted_at',
    editMeal.error !== null,
  )
  const softDelete = await a.supabase
    .from('meals')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', mealA.id)
    .select()
  check(
    'meals: A sí puede borrar lógicamente su comida',
    softDelete.error === null && softDelete.data?.length === 1,
    softDelete.error?.message,
  )
  const deleteMeal = await a.supabase.from('meals').delete().eq('id', mealA.id)
  check('meals: nadie puede borrar físicamente', deleteMeal.error !== null)
  const editItem = await a.supabase
    .from('meal_items')
    .update({ grams: 1 })
    .eq('id', itemA.id)
  check('meal_items: no se pueden editar', editItem.error !== null)
  const deleteItem = await a.supabase
    .from('meal_items')
    .delete()
    .eq('id', itemA.id)
  check('meal_items: no se pueden borrar', deleteItem.error !== null)
  const deleteFood = await a.supabase.from('foods').delete().eq('id', foodA.id)
  check('foods: no se pueden borrar (se archivan)', deleteFood.error !== null)
  const resetCap = await a.supabase
    .from('vision_requests')
    .delete()
    .eq('user_id', a.id)
  check(
    'vision_requests: no se pueden borrar (el tope no se resetea)',
    resetCap.error !== null,
  )
  const changeOwner = await a.supabase
    .from('user_settings')
    .update({ user_id: b.id })
    .eq('user_id', a.id)
  check(
    'user_settings: no se puede cambiar el user_id',
    changeOwner.error !== null,
  )
}

// --- Anonymous access -----------------------------------------------------------

console.log('\nSin sesión')
for (const table of [
  'user_settings',
  'foods',
  'reference_foods',
  'meals',
  'meal_items',
  'vision_requests',
]) {
  const { data, error } = await anon.from(table).select('*').limit(1)
  check(
    `${table}: sin sesión no se lee nada`,
    error !== null || data?.length === 0,
  )
}

// --- Safety-net CHECKs ----------------------------------------------------------

console.log('\nControles de la base (red de seguridad)')
{
  const base = {
    meal_id: mealA.id,
    food_id: foodA.id,
    food_name: 'x',
    food_source: 'manual',
    food_state: 'raw_cooked',
    carbs_per_100g: 78,
    cooking_factor: 2.6,
    effective_carbs_per_100g: 30,
  }
  const units = await a.supabase.from('meal_items').insert({
    ...base,
    position: 1,
    quantity_mode: 'units',
    units: 2,
    unit_weight_g: 50,
    grams: 100,
    carbs_g: 30,
  })
  check(
    'meal_items: rechaza unidades en un alimento raw_cooked',
    units.error !== null,
  )
  const wrongCarbs = await a.supabase.from('meal_items').insert({
    ...base,
    position: 2,
    quantity_mode: 'grams',
    grams: 250,
    carbs_g: 80,
  })
  check(
    'meal_items: rechaza HC que no coinciden con gramos × HC/100 g',
    wrongCarbs.error !== null,
  )
  const wrongEffective = await a.supabase.from('meal_items').insert({
    ...base,
    position: 3,
    quantity_mode: 'grams',
    grams: 100,
    effective_carbs_per_100g: 78,
    carbs_g: 78,
  })
  check(
    'meal_items: rechaza un HC efectivo que ignora el factor',
    wrongEffective.error !== null,
  )
  const wrongDose = await a.supabase.from('meals').insert({
    eaten_at: new Date().toISOString(),
    carb_ratio_g_per_unit: 15,
    total_carbs_g: 75,
    calculated_dose_units: 6,
    calc_version: '1',
  })
  check(
    'meals: rechaza una dosis que no coincide con HC ÷ ratio',
    wrongDose.error !== null,
  )
  const factorAsEaten = await a.supabase.from('foods').insert({
    name: 'x',
    source: 'manual',
    notes: 'x',
    state: 'as_eaten',
    carbs_per_100g: 10,
    cooking_factor: 2,
  })
  check(
    'foods: rechaza factor de cocción en un alimento as_eaten',
    factorAsEaten.error !== null,
  )
  const carbsOver100 = await a.supabase.from('foods').insert({
    name: 'x',
    source: 'manual',
    notes: 'x',
    state: 'as_eaten',
    carbs_per_100g: 101,
  })
  check(
    'foods: rechaza más de 100 g de HC por 100 g',
    carbsOver100.error !== null,
  )
  // Positive case (spec §14 #49): the note of a manual food is optional.
  // The row is removed with the test user, like the rest of A's data.
  const manualWithoutNote = await a.supabase.from('foods').insert({
    name: 'x',
    source: 'manual',
    state: 'as_eaten',
    carbs_per_100g: 10,
  })
  check(
    'foods: acepta un alimento manual sin nota',
    manualWithoutNote.error === null,
    manualWithoutNote.error?.message,
  )
}

// --- Cleanup: files are not deleted with the users -------------------------------

await a.supabase.storage.from(BUCKET).remove([photoA])
await b.supabase.storage.from(BUCKET).remove([`${b.id}/rls-check.jpg`])

console.log(
  failures === 0
    ? '\nTodo OK. Borrá los dos usuarios de prueba desde el panel: sus filas se borran con ellos.'
    : `\n${failures} chequeo(s) fallaron.`,
)
process.exit(failures === 0 ? 0 : 1)
