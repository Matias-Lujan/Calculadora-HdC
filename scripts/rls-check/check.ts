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
import {
  CALC_VERSION,
  calculateMeal,
  type MealItemInput,
} from '../../src/domain/dose/index.ts'

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
  // The usage notice (plan M7): B can neither read nor accept it for A, and
  // A can accept their own.
  const readOther = await b.supabase
    .from('user_settings')
    .select('usage_notice_accepted_at')
    .eq('user_id', a.id)
  check(
    'user_settings: B no ve si A aceptó el aviso de uso',
    readOther.error === null && readOther.data?.length === 0,
    readOther.error?.message ?? `${readOther.data?.length} filas`,
  )
  const readOwn = async () =>
    a.supabase.from('user_settings').select('usage_notice_accepted_at').single()
  const before = await readOwn()
  const { data } = await b.supabase
    .from('user_settings')
    .update({ usage_notice_accepted_at: '2000-01-01T00:00:00Z' })
    .eq('user_id', a.id)
    .select()
  const after = await readOwn()
  check(
    'user_settings: B no puede aceptar el aviso de uso por A',
    (data?.length ?? 0) === 0 &&
      before.error === null &&
      after.error === null &&
      after.data?.usage_notice_accepted_at ===
        before.data?.usage_notice_accepted_at,
  )
  const acceptedAt = new Date().toISOString()
  const own = await a.supabase
    .from('user_settings')
    .update({ usage_notice_accepted_at: acceptedAt })
    .eq('user_id', a.id)
    .select('usage_notice_accepted_at')
  check(
    'user_settings: A sí puede aceptar su aviso de uso',
    own.error === null &&
      own.data?.length === 1 &&
      Date.parse(String(own.data[0]?.usage_notice_accepted_at)) ===
        Date.parse(acceptedAt),
    own.error?.message,
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

  // USDA seed (spec §14 #50). Without a grant PostgREST answers with an
  // error; with a grant but no policy, with 0 rows. Either way nothing may
  // change, so the checks look at the data afterwards too.
  const countSeed = async () =>
    b.supabase
      .from('reference_foods')
      .select('id', { count: 'exact', head: true })
      .eq('reference_db', 'usda_fdc')
  const seeded = await countSeed()
  check(
    'reference_foods: tiene el seed de USDA',
    seeded.error === null && (seeded.count ?? 0) > 0,
    seeded.error?.message ?? `${seeded.count} filas`,
  )
  const update = await b.supabase
    .from('reference_foods')
    .update({ name_es: 'rls-check' })
    .eq('reference_db', 'usda_fdc')
    .select('id')
  const renamed = await b.supabase
    .from('reference_foods')
    .select('id', { count: 'exact', head: true })
    .eq('name_es', 'rls-check')
  check(
    'Nadie puede modificar reference_foods',
    (update.error !== null || (update.data?.length ?? 0) === 0) &&
      renamed.error === null &&
      renamed.count === 0,
    update.error ? undefined : `${update.data?.length} filas cambiadas`,
  )
  const remove = await b.supabase
    .from('reference_foods')
    .delete()
    .eq('reference_db', 'usda_fdc')
    .select('id')
  const afterDelete = await countSeed()
  check(
    'Nadie puede borrar reference_foods',
    (remove.error !== null || (remove.data?.length ?? 0) === 0) &&
      afterDelete.error === null &&
      afterDelete.count === seeded.count,
    `${seeded.count} filas antes, ${afterDelete.count} después`,
  )
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

// --- libre_sessions: only the Edge Function, with the secret key ---------------
// authenticated has no privileges at all, so every call must fail (an empty
// result would also pass on an empty table and hide a wrong grant).

console.log('\nlibre_sessions: ningún usuario la lee ni la escribe')
{
  const read = await a.supabase.from('libre_sessions').select('*')
  check(
    'libre_sessions: A no lee nada (ni su propia fila)',
    read.error !== null,
    `${read.data?.length} filas`,
  )
  const insert = await a.supabase.from('libre_sessions').insert({
    user_id: a.id,
    login_error: 'rls-check',
  })
  check('libre_sessions: A no puede insertar su fila', insert.error !== null)
  const update = await a.supabase
    .from('libre_sessions')
    .update({ login_error: 'rls-check' })
    .eq('user_id', a.id)
    .select()
  check('libre_sessions: A no puede actualizar', update.error !== null)
  const remove = await a.supabase
    .from('libre_sessions')
    .delete()
    .eq('user_id', a.id)
    .select()
  check('libre_sessions: A no puede borrar', remove.error !== null)
}

// --- glucose_readings: the user reads their own; only the function writes ----
// Only glucose-latest inserts rows, so the table may be empty for A: B
// reading A's rows must give none without error, and every write of A must
// fail (authenticated only has select).

console.log('\nglucose_readings: cada uno lee las suyas y nadie escribe')
{
  const readA = await a.supabase
    .from('glucose_readings')
    .select('*')
    .eq('user_id', a.id)
  check(
    'glucose_readings: A lee las suyas sin error',
    readA.error === null,
    readA.error?.message,
  )
  const readB = await b.supabase
    .from('glucose_readings')
    .select('*')
    .eq('user_id', a.id)
  check(
    'glucose_readings: B no ve las de A',
    readB.error === null && readB.data.length === 0,
    readB.error?.message ?? `${readB.data?.length} filas`,
  )
  const insert = await a.supabase.from('glucose_readings').insert({
    user_id: a.id,
    measured_at: new Date().toISOString(),
    mgdl: 100,
  })
  check('glucose_readings: A no puede insertar', insert.error !== null)
  const update = await a.supabase
    .from('glucose_readings')
    .update({ mgdl: 101 })
    .eq('user_id', a.id)
    .select()
  check('glucose_readings: A no puede actualizar', update.error !== null)
  const remove = await a.supabase
    .from('glucose_readings')
    .delete()
    .eq('user_id', a.id)
    .select()
  check('glucose_readings: A no puede borrar', remove.error !== null)
}

// --- glucose-latest without a user --------------------------------------------
// It is deployed without the platform's JWT check (spec §9.8): only the
// secret key is the scheduled sync, so the publishable key alone gets a 401.

console.log('\nglucose-latest: sin usuario')
{
  const response = await fetch(`${url}/functions/v1/glucose-latest`, {
    method: 'POST',
    headers: { apikey: key, 'content-type': 'application/json' },
    body: '{}',
  })
  check(
    'glucose-latest: con la key publicable y sin sesión da 401',
    response.status === 401,
    `HTTP ${response.status}`,
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
  'libre_sessions',
  'glucose_readings',
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

// --- create_meal (spec §7.2) ---------------------------------------------------

console.log('\ncreate_meal')
{
  // A valid meal of one item: 250 g of A's rice, 75 g HC, ratio 15, dose 5.
  const mealOf = (foodId: string) => ({
    meal: {
      eaten_at: new Date().toISOString(),
      carb_ratio_g_per_unit: 15,
      total_carbs_g: 75,
      calculated_dose_units: 5,
      applied_dose_units: 5,
      calc_version: '1',
    },
    items: [
      {
        food_id: foodId,
        position: 0,
        food_name: 'rls-check arroz',
        food_brand: null,
        food_source: 'manual',
        food_state: 'raw_cooked',
        quantity_mode: 'grams',
        units: null,
        unit_weight_g: null,
        grams: 250,
        carbs_per_100g: 78,
        cooking_factor: 2.6,
        effective_carbs_per_100g: 30,
        carbs_g: 75,
      },
    ],
  })
  const countMeals = async (who: typeof a) => {
    const { count } = await who.supabase
      .from('meals')
      .select('id', { count: 'exact', head: true })
    return count
  }

  const created = await a.supabase.rpc('create_meal', {
    payload: mealOf(foodA.id),
  })
  const createdId = typeof created.data === 'string' ? created.data : ''
  const saved = await a.supabase
    .from('meals')
    .select('user_id, meal_items(id)')
    .eq('id', createdId)
    .maybeSingle()
  check(
    'create_meal: A guarda una comida con su ítem',
    created.error === null &&
      saved.data?.user_id === a.id &&
      saved.data.meal_items.length === 1,
    created.error?.message ?? saved.error?.message,
  )

  const foodB = must(
    await b.supabase
      .from('foods')
      .insert({
        name: 'rls-check arroz de B',
        source: 'manual',
        state: 'raw_cooked',
        carbs_per_100g: 78,
        cooking_factor: 2.6,
      })
      .select()
      .single(),
    'food de B',
  )
  const withOwner = mealOf(foodB.id)
  const spoofed = await b.supabase.rpc('create_meal', {
    payload: { ...withOwner, meal: { ...withOwner.meal, user_id: a.id } },
  })
  const spoofedId = typeof spoofed.data === 'string' ? spoofed.data : ''
  const seenByA = await a.supabase
    .from('meals')
    .select('id')
    .eq('id', spoofedId)
  const seenByB = await b.supabase
    .from('meals')
    .select('user_id')
    .eq('id', spoofedId)
    .maybeSingle()
  check(
    'create_meal: ignora un user_id en el payload (la comida es de quien la guarda)',
    spoofed.error === null &&
      seenByA.data?.length === 0 &&
      seenByB.data?.user_id === b.id,
    spoofed.error?.message,
  )

  const bBefore = await countMeals(b)
  const foreignFood = await b.supabase.rpc('create_meal', {
    payload: mealOf(foodA.id),
  })
  check(
    'create_meal: B no puede usar un alimento de A, y no queda la comida',
    foreignFood.error !== null && (await countMeals(b)) === bBefore,
  )

  const aBefore = await countMeals(a)
  const valid = mealOf(foodA.id)
  const [item] = valid.items
  if (item === undefined) throw new Error('no item')
  const rejected: [string, unknown][] = [
    [
      'rechaza un total que no es la suma de los ítems',
      {
        ...valid,
        meal: { ...valid.meal, total_carbs_g: 90, calculated_dose_units: 6 },
      },
    ],
    [
      'rechaza una dosis que no coincide con HC ÷ ratio',
      { ...valid, meal: { ...valid.meal, calculated_dose_units: 6 } },
    ],
    ['rechaza una comida sin ítems', { ...valid, items: [] }],
    ['rechaza un payload sin ítems', { meal: valid.meal }],
    [
      'rechaza un ratio de 0 (no divide por cero)',
      { ...valid, meal: { ...valid.meal, carb_ratio_g_per_unit: 0 } },
    ],
    [
      // The total and the dose match the items, but the second item breaks
      // a CHECK of meal_items: the meal and the first item are not kept.
      'si falla un ítem no queda nada (atómica)',
      {
        meal: {
          ...valid.meal,
          total_carbs_g: 155,
          calculated_dose_units: 155 / 15,
        },
        items: [item, { ...item, position: 1, carbs_g: 80 }],
      },
    ],
  ]
  for (const [description, payload] of rejected) {
    const { error } = await a.supabase.rpc('create_meal', { payload })
    check(`create_meal: ${description}`, error !== null)
  }
  check(
    'create_meal: las llamadas rechazadas no dejaron comidas',
    (await countMeals(a)) === aBefore,
  )

  const anonymous = await anon.rpc('create_meal', { payload: valid })
  check('create_meal: sin sesión no se puede llamar', anonymous.error !== null)

  // A meal as the app builds it: the numbers come from calculateMeal, as
  // unrounded doubles (grams, units and cooked), and the ratio does not
  // divide evenly. They have to be saved and read back exactly.
  const ratio = 13
  const inputs: MealItemInput[] = [
    {
      foodState: 'as_eaten',
      carbsPer100g: 20.2,
      cookingFactor: null,
      unitWeightG: null,
      quantityMode: 'grams',
      quantity: 120,
    },
    {
      foodState: 'as_eaten',
      carbsPer100g: 58,
      cookingFactor: null,
      unitWeightG: 45,
      quantityMode: 'units',
      quantity: 0.5,
    },
    {
      foodState: 'raw_cooked',
      carbsPer100g: 78,
      cookingFactor: 2.6,
      unitWeightG: null,
      quantityMode: 'grams',
      quantity: 250,
    },
  ]
  const result = calculateMeal(inputs, {
    carbRatioGPerUnit: ratio,
    maxDoseWarningUnits: null,
    maxItemGramsWarning: 500,
  })
  if (!result.ok) throw new Error('the meal of the check does not calculate')
  const appItems = inputs.map((input, position) => {
    const calculated = result.items[position]
    if (calculated === undefined) throw new Error('no calculated item')
    return {
      food_id: foodA.id,
      position,
      food_name: `rls-check ítem ${position}`,
      food_brand: null,
      food_source: 'manual',
      food_state: input.foodState,
      quantity_mode: input.quantityMode,
      units: input.quantityMode === 'units' ? input.quantity : null,
      unit_weight_g: input.quantityMode === 'units' ? input.unitWeightG : null,
      grams: calculated.grams,
      carbs_per_100g: input.carbsPer100g,
      cooking_factor: input.cookingFactor,
      effective_carbs_per_100g: calculated.effectiveCarbsPer100g,
      carbs_g: calculated.carbsG,
    }
  })
  const appMeal = await a.supabase.rpc('create_meal', {
    payload: {
      meal: {
        eaten_at: new Date().toISOString(),
        carb_ratio_g_per_unit: ratio,
        total_carbs_g: result.totalCarbsG,
        calculated_dose_units: result.doseUnits,
        applied_dose_units: result.doseUnits,
        calc_version: CALC_VERSION,
      },
      items: appItems,
    },
  })
  const appMealId = typeof appMeal.data === 'string' ? appMeal.data : ''
  const savedMeal = await a.supabase
    .from('meals')
    .select('total_carbs_g, calculated_dose_units, applied_dose_units')
    .eq('id', appMealId)
    .maybeSingle()
  const savedItems = await a.supabase
    .from('meal_items')
    .select(
      'position, quantity_mode, units, grams, effective_carbs_per_100g, carbs_g',
    )
    .eq('meal_id', appMealId)
    .order('position')
  check(
    'create_meal: guarda una comida de 3 ítems como la arma la app, sin redondear y en orden',
    appMeal.error === null &&
      savedMeal.data?.total_carbs_g === result.totalCarbsG &&
      savedMeal.data.calculated_dose_units === result.doseUnits &&
      savedMeal.data.applied_dose_units === result.doseUnits &&
      JSON.stringify(savedItems.data) ===
        JSON.stringify(
          appItems.map((row) => ({
            position: row.position,
            quantity_mode: row.quantity_mode,
            units: row.units,
            grams: row.grams,
            effective_carbs_per_100g: row.effective_carbs_per_100g,
            carbs_g: row.carbs_g,
          })),
        ),
    appMeal.error?.message ??
      JSON.stringify({ sent: result, saved: savedMeal.data, savedItems }),
  )

  const withoutApplied = mealOf(foodA.id)
  const noApplied = await a.supabase.rpc('create_meal', {
    payload: {
      ...withoutApplied,
      meal: { ...withoutApplied.meal, applied_dose_units: null },
    },
  })
  const noAppliedSaved = await a.supabase
    .from('meals')
    .select('applied_dose_units')
    .eq('id', typeof noApplied.data === 'string' ? noApplied.data : '')
    .maybeSingle()
  check(
    'create_meal: acepta una comida sin dosis aplicada (queda null)',
    noApplied.error === null &&
      noAppliedSaved.data !== null &&
      noAppliedSaved.data.applied_dose_units === null,
    noApplied.error?.message,
  )

  // The item is a copy of the food (spec §6.6): archiving the food after
  // choosing it does not stop the meal from being saved.
  const archived = must(
    await a.supabase
      .from('foods')
      .insert({
        name: 'rls-check archivado',
        source: 'manual',
        state: 'raw_cooked',
        carbs_per_100g: 78,
        cooking_factor: 2.6,
      })
      .select()
      .single(),
    'food archivado de A',
  )
  const archive = await a.supabase
    .from('foods')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', archived.id)
  const withArchived = await a.supabase.rpc('create_meal', {
    payload: mealOf(archived.id),
  })
  check(
    'create_meal: acepta un ítem de un alimento ya archivado',
    archive.error === null && withArchived.error === null,
    archive.error?.message ?? withArchived.error?.message,
  )

  // The key of the meal (M3 and M4): the same meal saved twice with the same
  // key is a single meal; another user with the same key gets their own.
  const clientKey = crypto.randomUUID()
  const keyed = mealOf(foodA.id)
  const withKey = { ...keyed, meal: { ...keyed.meal, client_key: clientKey } }
  const beforeKeyed = await countMeals(a)
  const [first, second] = await Promise.all([
    a.supabase.rpc('create_meal', { payload: withKey }),
    a.supabase.rpc('create_meal', { payload: withKey }),
  ])
  const third = await a.supabase.rpc('create_meal', { payload: withKey })
  const keyedRows = await a.supabase
    .from('meals')
    .select('id, meal_items(id)')
    .eq('client_key', clientKey)
  check(
    'create_meal: con la misma clave (también dos a la vez) devuelve el mismo id y deja una sola comida',
    first.error === null &&
      second.error === null &&
      third.error === null &&
      typeof first.data === 'string' &&
      first.data === second.data &&
      first.data === third.data &&
      keyedRows.data?.length === 1 &&
      keyedRows.data[0]?.id === first.data &&
      keyedRows.data[0].meal_items.length === 1 &&
      (await countMeals(a)) === (beforeKeyed ?? 0) + 1,
    first.error?.message ??
      second.error?.message ??
      third.error?.message ??
      JSON.stringify(keyedRows.data),
  )

  const fromB = mealOf(foodB.id)
  const sameKeyB = await b.supabase.rpc('create_meal', {
    payload: { ...fromB, meal: { ...fromB.meal, client_key: clientKey } },
  })
  const keyedByB = await b.supabase
    .from('meals')
    .select('id, user_id')
    .eq('client_key', clientKey)
  check(
    'create_meal: B con la misma clave que A crea su propia comida y no recibe ni ve la de A',
    sameKeyB.error === null &&
      typeof sameKeyB.data === 'string' &&
      sameKeyB.data !== first.data &&
      keyedByB.data?.length === 1 &&
      keyedByB.data[0]?.id === sameKeyB.data &&
      keyedByB.data[0].user_id === b.id,
    sameKeyB.error?.message ?? JSON.stringify(keyedByB.data),
  )

  // A meal saved and then deleted with that key: saving it again returns
  // its id and does not create another one (spec §14 #85).
  const deletedKey = crypto.randomUUID()
  const toDelete = {
    ...keyed,
    meal: { ...keyed.meal, client_key: deletedKey },
  }
  const savedToDelete = await a.supabase.rpc('create_meal', {
    payload: toDelete,
  })
  const deleted = await a.supabase
    .from('meals')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', typeof savedToDelete.data === 'string' ? savedToDelete.data : '')
  const beforeAgain = await countMeals(a)
  const again = await a.supabase.rpc('create_meal', { payload: toDelete })
  check(
    'create_meal: con la clave de una comida borrada devuelve su id, sin crear otra',
    savedToDelete.error === null &&
      deleted.error === null &&
      again.error === null &&
      again.data === savedToDelete.data &&
      (await countMeals(a)) === beforeAgain,
    savedToDelete.error?.message ??
      deleted.error?.message ??
      again.error?.message,
  )

  // The key cannot be changed after saving (update is only deleted_at).
  const changeKey = await a.supabase
    .from('meals')
    .update({ client_key: crypto.randomUUID() })
    .eq('id', typeof first.data === 'string' ? first.data : '')
  check('meals: la clave no se puede cambiar', changeKey.error !== null)
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
