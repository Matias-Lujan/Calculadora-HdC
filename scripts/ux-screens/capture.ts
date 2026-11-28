// Screenshots of the app for a design review (improvement M1). Not part of
// the app. It signs in as a throwaway demo user of dev, makes sure that user
// has invented demo data (foods, meals on several days, the dose alert),
// starts the app with Vite (or uses --url) and takes a screenshot of each
// screen and state with Playwright WebKit, emulating an iPhone.
//
// Needs in the environment (.env.local): VITE_SUPABASE_URL,
// VITE_SUPABASE_PUBLISHABLE_KEY, UX_DEMO_EMAIL and UX_DEMO_PASSWORD. Never
// runs against prod, and never with a real account. The data goes through
// the same API the app uses, signed in as the demo user (RLS applies; no
// service_role).
//
// Run: node --env-file=.env.local scripts/ux-screens/capture.ts
//        [--device "iPhone 15"] [--url <url>] [--out <folder>] [--sin-alerta] [--oscuro]
// See README.md in this folder.

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs, stripVTControlCharacters } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import {
  devices,
  webkit,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import {
  CALC_VERSION,
  calculateMeal,
  needsCookingFactor,
  parseNonNegativeUserNumber,
  parseUserNumber,
  type FoodState,
  type MealItemInput,
  type QuantityMode,
} from '../../src/domain/dose/index.ts'
import { eatenAtFromInput, eatenDay } from '../../src/features/meals/eatenAt.ts'
import type {
  Database,
  Tables,
  TablesInsert,
} from '../../src/lib/database.types.ts'

const PROD_REF = 'zoxlvutjqolwfjcsbtog'
const PROD_APP_HOST = 'calculadora-hdc.vercel.app'
const PORT = 5180
const DEFAULT_DEVICE = 'iPhone 15'
const TIME_ZONE = 'America/Argentina/Buenos_Aires'
const ROOT = path.resolve(import.meta.dirname, '..', '..')
// The key of the meal in progress (src/lib/mealDraftStorage.ts).
const MEAL_DRAFT_KEY = 'meal-draft'
// The dose alert set when the demo user has none, so warnings show up.
const DOSE_ALERT_UNITS = 15

const USAGE =
  'Uso: node --env-file=.env.local scripts/ux-screens/capture.ts [--device "<nombre>"] [--url <url>] [--out <carpeta>] [--sin-alerta] [--oscuro] [--solo <estado,estado>]'

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

// --- Arguments and environment ------------------------------------------------

function readArgs() {
  try {
    return parseArgs({
      options: {
        device: { type: 'string', default: DEFAULT_DEVICE },
        url: { type: 'string' },
        out: { type: 'string' },
        'sin-alerta': { type: 'boolean', default: false },
        oscuro: { type: 'boolean', default: false },
        solo: { type: 'string' },
        help: { type: 'boolean', short: 'h', default: false },
      },
    }).values
  } catch (error) {
    return fail(
      `${error instanceof Error ? error.message : String(error)}\n${USAGE}`,
    )
  }
}

const args = readArgs()
if (args.help) {
  console.log(USAGE)
  process.exit(0)
}

// The prod guard goes first: nothing else runs with a prod URL.
const supabaseUrl = process.env.VITE_SUPABASE_URL ?? ''
if (supabaseUrl.toLowerCase().includes(PROD_REF)) {
  fail(
    'VITE_SUPABASE_URL apunta al proyecto de prod. Este script corre solo contra dev (.env.local).',
  )
}
const missing = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'UX_DEMO_EMAIL',
  'UX_DEMO_PASSWORD',
].filter((name) => !process.env[name])
if (missing.length > 0) {
  fail(
    `Falta ${missing.join(', ')} en el entorno (.env.local, ver .env.example).\n${USAGE}`,
  )
}
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
const demoEmail = process.env.UX_DEMO_EMAIL ?? ''
const demoPassword = process.env.UX_DEMO_PASSWORD ?? ''

const deviceName = args.device
const device = devices[deviceName]
if (device === undefined) {
  const iphones = Object.keys(devices).filter((name) =>
    name.startsWith('iPhone'),
  )
  fail(
    `Playwright no tiene el dispositivo "${deviceName}". Algunos: ${iphones.slice(-8).join(', ')}.`,
  )
}

let remoteUrl: string | null = null
if (args.url !== undefined) {
  let parsed: URL
  try {
    parsed = new URL(args.url)
  } catch {
    fail(`--url no es una URL válida: ${args.url}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    fail('--url tiene que empezar con http:// o https://.')
  }
  if (parsed.hostname === PROD_APP_HOST || parsed.hostname.includes(PROD_REF)) {
    fail('--url apunta a la app de prod. Este script corre solo contra dev.')
  }
  remoteUrl = parsed.origin
}

const now = new Date()
const outDir =
  args.out !== undefined
    ? path.resolve(args.out)
    : path.join(ROOT, 'scripts', 'ux-screens', 'out', folderStamp(now))

/** "2026-11-16_14-05-09", in Buenos Aires time. */
function folderStamp(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
    .format(date)
    .replace(' ', '_')
    .replaceAll(':', '-')
}

// What must never reach the console or index.json.
const secrets = [demoPassword]

/** The message of an error, without colors, secrets or long call logs. */
function clean(error: unknown): string {
  let text = stripVTControlCharacters(
    error instanceof Error ? error.message : String(error),
  )
  for (const secret of secrets) {
    if (secret !== '') text = text.split(secret).join('***')
  }
  return text.split('\n').slice(0, 6).join('\n').trim()
}

// --- Demo data (supabase-js, signed in as the demo user) ----------------------

function demoClient() {
  return createClient<Database>(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
type Supabase = ReturnType<typeof demoClient>

const FOOD_COLUMNS =
  'id, name, brand, source, state, carbs_per_100g, cooking_factor, unit_weight_g, unit_label, reference_db, reference_code'
type Food = Pick<
  Tables<'foods'>,
  | 'id'
  | 'name'
  | 'brand'
  | 'source'
  | 'state'
  | 'carbs_per_100g'
  | 'cooking_factor'
  | 'unit_weight_g'
  | 'unit_label'
  | 'reference_db'
  | 'reference_code'
>

const SETTINGS_COLUMNS =
  'carb_ratio_g_per_unit, max_dose_warning_units, max_item_grams_warning'
type Settings = Pick<
  Tables<'user_settings'>,
  'carb_ratio_g_per_unit' | 'max_dose_warning_units' | 'max_item_grams_warning'
>

// Invented foods. The note of a manual food is optional (spec §14 #49).
const MANUAL_FOODS: TablesInsert<'foods'>[] = [
  {
    name: 'Alfajor de chocolate',
    brand: 'Dulcería Ejemplo',
    source: 'manual',
    state: 'as_eaten',
    carbs_per_100g: 58,
    unit_weight_g: 50,
    unit_label: 'alfajor',
  },
  {
    name: 'Yogur bebible de frutilla',
    brand: 'Lácteos Ejemplo',
    source: 'manual',
    state: 'as_eaten',
    carbs_per_100g: 12.5,
  },
  {
    name: 'Pan lactal integral',
    brand: 'Panificadora Ejemplo',
    source: 'manual',
    state: 'as_eaten',
    carbs_per_100g: 41,
  },
  {
    name: 'Pan de campo',
    brand: null,
    source: 'manual',
    state: 'as_eaten',
    carbs_per_100g: 52,
    notes: 'De la panadería del barrio',
  },
  {
    name: 'Arroz largo fino',
    brand: 'Molinos Ejemplo',
    source: 'manual',
    state: 'raw_cooked',
    carbs_per_100g: 78,
    cooking_factor: 2.6,
  },
  {
    // Without how much it yields: "Falta cuánto rinde".
    name: 'Fideos tirabuzón',
    brand: 'Pastas Ejemplo',
    source: 'manual',
    state: 'raw_cooked',
    carbs_per_100g: 72,
  },
]
// SR Legacy fdc_id of the reference table foods copied to the catalog:
// Banana and Manzana con cáscara. Any other two are used if they are gone.
const TABLE_CODES = ['173944', '171688']

function foodState(food: Food): FoodState {
  if (food.state === 'as_eaten' || food.state === 'raw_cooked') {
    return food.state
  }
  throw new Error(`Estado de alimento desconocido: ${food.state}`)
}

/**
 * The id of the user's copy of a reference table food, inserting it if there
 * is none: the same lookup as findOrCreateTableFood in
 * src/features/meals/api.ts (spec §6.2, §14 #51).
 */
async function findOrCreateTableFood(
  supabase: Supabase,
  copy: TablesInsert<'foods'> & { reference_code: string },
): Promise<string> {
  const found = await supabase
    .from('foods')
    .select('id')
    .eq('source', 'reference')
    .eq('reference_db', 'usda_fdc')
    .eq('reference_code', copy.reference_code)
    .is('archived_at', null)
    .order('created_at')
    .limit(1)
    .maybeSingle()
  if (found.error) throw new Error(found.error.message)
  if (found.data !== null) return found.data.id
  const inserted = await supabase
    .from('foods')
    .insert(copy)
    .select('id')
    .single()
  if (inserted.error) throw new Error(inserted.error.message)
  return inserted.data.id
}

/** Loads the demo foods if the user has none. Returns how many it loaded. */
async function ensureFoods(supabase: Supabase): Promise<number> {
  const existing = await supabase
    .from('foods')
    .select('id', { count: 'exact', head: true })
  if (existing.error) {
    throw new Error(
      `No se pudieron leer los alimentos: ${existing.error.message}`,
    )
  }
  if ((existing.count ?? 0) > 0) return 0

  const manual = await supabase.from('foods').insert(MANUAL_FOODS)
  if (manual.error) {
    throw new Error(
      `No se pudieron cargar los alimentos: ${manual.error.message}`,
    )
  }
  // The reference table as the meal screen reads it (fetchReferenceFoods).
  const table = await supabase
    .from('reference_foods')
    .select(
      'reference_code, description_original, name_es, state, carbs_per_100g',
    )
    .eq('reference_db', 'usda_fdc')
    .eq('state', 'as_eaten')
  if (table.error) {
    throw new Error(
      `No se pudo leer la tabla de alimentos: ${table.error.message}`,
    )
  }
  const chosen = [
    ...table.data.filter((ref) => TABLE_CODES.includes(ref.reference_code)),
    ...table.data.filter((ref) => !TABLE_CODES.includes(ref.reference_code)),
  ].slice(0, 2)
  for (const ref of chosen) {
    // The copy as tableFoodCopy makes it: named as in the table, no brand.
    await findOrCreateTableFood(supabase, {
      name: ref.name_es,
      brand: null,
      source: 'reference',
      state: ref.state,
      carbs_per_100g: ref.carbs_per_100g,
      reference_db: 'usda_fdc',
      reference_code: ref.reference_code,
      reference_description: ref.description_original,
    })
  }
  return MANUAL_FOODS.length + chosen.length
}

async function activeFoods(supabase: Supabase): Promise<Food[]> {
  const { data, error } = await supabase
    .from('foods')
    .select(FOOD_COLUMNS)
    .is('archived_at', null)
    .order('created_at')
    .order('name')
  if (error)
    throw new Error(`No se pudieron leer los alimentos: ${error.message}`)
  return data
}

/** The demo foods each state needs, by what they are (and by name first). */
type DemoFoods = {
  units: Food | undefined
  cooked: Food | undefined
  missingYield: Food | undefined
  table: Food | undefined
  yogurt: Food | undefined
  bread: Food | undefined
  sliced: Food | undefined
}

function demoFoods(foods: Food[]): DemoFoods {
  const pick = (name: string, fits: (food: Food) => boolean) =>
    foods.find((food) => food.name === name && fits(food)) ?? foods.find(fits)
  const plain = (food: Food) =>
    food.state === 'as_eaten' &&
    food.unit_weight_g === null &&
    food.source !== 'reference'
  return {
    units: pick(
      'Alfajor de chocolate',
      (food) => food.state === 'as_eaten' && food.unit_weight_g !== null,
    ),
    cooked: pick(
      'Arroz largo fino',
      (food) => food.state === 'raw_cooked' && food.cooking_factor !== null,
    ),
    missingYield: pick('Fideos tirabuzón', (food) =>
      needsCookingFactor(foodState(food), food.cooking_factor),
    ),
    table: pick(
      'Banana',
      (food) => food.source === 'reference' && food.reference_db === 'usda_fdc',
    ),
    yogurt: pick('Yogur bebible de frutilla', plain),
    bread: pick('Pan de campo', plain),
    sliced: pick('Pan lactal integral', plain),
  }
}

/** The settings, with a dose alert: without one there are no dose warnings. */
async function ensureDoseAlert(
  supabase: Supabase,
  userId: string,
): Promise<Settings> {
  const { data, error } = await supabase
    .from('user_settings')
    .select(SETTINGS_COLUMNS)
    .single()
  if (error)
    throw new Error(`No se pudo leer la configuración: ${error.message}`)
  if (data.max_dose_warning_units !== null) return data
  return setDoseAlert(supabase, userId, DOSE_ALERT_UNITS)
}

/**
 * Accepts the usage notice of the demo user (plan M7) if it has not been
 * accepted yet: otherwise its window would cover every screen.
 */
async function ensureUsageNoticeAccepted(
  supabase: Supabase,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('user_settings')
    .update({ usage_notice_accepted_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('usage_notice_accepted_at', null)
  if (error) {
    throw new Error(`No se pudo aceptar el aviso de uso: ${error.message}`)
  }
}

async function setDoseAlert(
  supabase: Supabase,
  userId: string,
  units: number | null,
): Promise<Settings> {
  const { data, error } = await supabase
    .from('user_settings')
    .update({ max_dose_warning_units: units })
    .eq('user_id', userId)
    .select(SETTINGS_COLUMNS)
    .single()
  if (error) {
    throw new Error(`No se pudo cambiar la alerta de dosis: ${error.message}`)
  }
  return data
}

type ItemSpec = { food: Food | undefined; mode: QuantityMode; quantity: string }
type MealSpec = {
  /** Wall-clock time in Buenos Aires, "HH:mm". */
  time: string
  items: ItemSpec[]
  /**
   * The applied dose: undefined follows the calculated dose (as the field
   * does until it is edited), a text is what the user typed, and null is a
   * meal without applied dose (the history shows "Aplicada —").
   */
  applied?: string | null
}

function mealSpecs(foods: DemoFoods) {
  const breakfast: MealSpec = {
    time: '08:30',
    items: [
      { food: foods.yogurt, mode: 'grams', quantity: '200' },
      { food: foods.sliced, mode: 'grams', quantity: '50' },
    ],
  }
  const lunch: MealSpec = {
    time: '13:15',
    items: [
      { food: foods.cooked, mode: 'grams', quantity: '250' },
      { food: foods.table, mode: 'grams', quantity: '120' },
    ],
    applied: '7',
  }
  const snack: MealSpec = {
    time: '17:30',
    items: [{ food: foods.units, mode: 'units', quantity: '1' }],
    applied: null,
  }
  const dinner: MealSpec = {
    time: '21:00',
    items: [
      { food: foods.cooked, mode: 'grams', quantity: '200' },
      { food: foods.bread, mode: 'grams', quantity: '40' },
    ],
  }
  return { breakfast, lunch, snack, dinner }
}

/**
 * Saves a meal with create_meal, as the app does (toNewMealRecord and
 * createMeal in src/features/meals): the values come from calculateMeal,
 * unrounded, and each item carries a copy of its food. Items without a food
 * (or that cannot be calculated) are left out. Returns whether it saved.
 */
async function saveMeal(
  supabase: Supabase,
  settings: Settings,
  spec: MealSpec,
  eatenAt: string,
): Promise<boolean> {
  const items = spec.items.flatMap(({ food, mode, quantity }) =>
    food !== undefined &&
    !needsCookingFactor(foodState(food), food.cooking_factor)
      ? [{ food, mode, quantity }]
      : [],
  )
  if (items.length === 0) return false
  const inputs: MealItemInput[] = items.map(({ food, mode, quantity }) => ({
    foodState: foodState(food),
    carbsPer100g: food.carbs_per_100g,
    cookingFactor: food.cooking_factor,
    unitWeightG: food.unit_weight_g,
    quantityMode: mode,
    quantity: parseUserNumber(quantity),
  }))
  const result = calculateMeal(inputs, {
    carbRatioGPerUnit: settings.carb_ratio_g_per_unit,
    maxDoseWarningUnits: settings.max_dose_warning_units,
    maxItemGramsWarning: settings.max_item_grams_warning,
  })
  if (!result.ok) throw new Error('Una comida de demo no se pudo calcular.')

  let applied: number | null
  if (spec.applied === undefined) {
    applied = result.doseUnits
  } else if (spec.applied === null) {
    applied = null
  } else {
    const typed = parseNonNegativeUserNumber(spec.applied)
    if ('error' in typed) throw new Error('Dosis aplicada de demo inválida.')
    applied = typed.value
  }

  const payload = {
    meal: {
      eaten_at: eatenAt,
      carb_ratio_g_per_unit: settings.carb_ratio_g_per_unit,
      total_carbs_g: result.totalCarbsG,
      calculated_dose_units: result.doseUnits,
      applied_dose_units: applied,
      calc_version: CALC_VERSION,
    },
    items: items.map(({ food, mode }, position) => {
      const calc = result.items[position]
      const input = inputs[position]
      if (calc === undefined || input === undefined) {
        throw new Error('El cálculo no coincide con los ítems.')
      }
      const inUnits = mode === 'units'
      return {
        food_id: food.id,
        position,
        food_name: food.name,
        food_brand: food.brand,
        food_source: food.source,
        food_state: food.state,
        quantity_mode: mode,
        units: inUnits ? input.quantity : null,
        unit_weight_g: inUnits ? food.unit_weight_g : null,
        grams: calc.grams,
        carbs_per_100g: food.carbs_per_100g,
        cooking_factor:
          food.state === 'raw_cooked' ? food.cooking_factor : null,
        effective_carbs_per_100g: calc.effectiveCarbsPer100g,
        carbs_g: calc.carbsG,
      }
    }),
  }
  const { error } = await supabase.rpc('create_meal', { payload })
  if (error)
    throw new Error(`No se pudo guardar una comida de demo: ${error.message}`)
  return true
}

/** The Buenos Aires day `count` days before `day` ("YYYY-MM-DD"). */
function daysBefore(day: string, count: number): string {
  const [year = NaN, month = NaN, dayOfMonth = NaN] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, dayOfMonth - count))
    .toISOString()
    .slice(0, 10)
}

function instantAt(day: string, time: string): string {
  const instant = eatenAtFromInput(`${day}T${time}`)
  if (instant === null) throw new Error(`Fecha inválida: ${day} ${time}`)
  return instant
}

/**
 * Makes sure the history has meals today, yesterday and on at least 3 other
 * days (Buenos Aires days, as the history groups them). Adds 1 to 3 meals to
 * each missing day; if none is missing, adds nothing.
 */
async function ensureMeals(
  supabase: Supabase,
  settings: Settings,
  foods: DemoFoods,
): Promise<{ meals: number; days: number }> {
  // As the history lists them: not deleted, with at least one item.
  const { data, error } = await supabase
    .from('meals')
    .select('eaten_at, meal_items!inner(id)')
    .is('deleted_at', null)
    .order('eaten_at', { ascending: false })
    .limit(1000)
  if (error)
    throw new Error(`No se pudieron leer las comidas: ${error.message}`)
  const days = new Set(data.map((meal) => eatenDay(meal.eaten_at)))
  const today = eatenDay(now.toISOString())
  const yesterday = daysBefore(today, 1)
  const { breakfast, lunch, snack, dinner } = mealSpecs(foods)

  const plan: { spec: MealSpec; eatenAt: string }[][] = []
  if (!days.has(today)) {
    // Today, before now (a future meal would be odd under "Hoy"), but not
    // before today's midnight.
    const start = Date.parse(instantAt(today, '00:01'))
    const at = (minutesAgo: number, minutesAfterStart: number) =>
      new Date(
        Math.max(
          now.getTime() - minutesAgo * 60_000,
          start + minutesAfterStart * 60_000,
        ),
      ).toISOString()
    plan.push([
      { spec: breakfast, eatenAt: at(180, 0) },
      { spec: lunch, eatenAt: at(45, 1) },
    ])
  }
  if (!days.has(yesterday)) {
    plan.push(
      [breakfast, lunch, dinner].map((spec) => ({
        spec,
        eatenAt: instantAt(yesterday, spec.time),
      })),
    )
  }
  const olderDays = [...days].filter((day) => day < yesterday).length
  let needed = Math.max(0, 3 - olderDays)
  const rotation = [[lunch], [breakfast, snack], [breakfast, lunch, dinner]]
  for (const offset of [2, 4, 7, 10, 14, 21, 30]) {
    if (needed === 0) break
    const day = daysBefore(today, offset)
    if (days.has(day)) continue
    const specs = rotation[needed % rotation.length] ?? [lunch]
    plan.push(
      specs.map((spec) => ({ spec, eatenAt: instantAt(day, spec.time) })),
    )
    needed -= 1
  }

  let meals = 0
  let addedDays = 0
  for (const day of plan) {
    let saved = 0
    for (const { spec, eatenAt } of day) {
      if (await saveMeal(supabase, settings, spec, eatenAt)) saved += 1
    }
    meals += saved
    if (saved > 0) addedDays += 1
  }
  return { meals, days: addedDays }
}

// --- Screenshots ----------------------------------------------------------------

type Capture = {
  file: string
  route: string
  description: string
  kind: 'viewport' | 'full'
}
type Failure = {
  state: string
  route: string | null
  description: string
  error: string
}
type Omitted = { state: string; description: string; reason: string }

type State = {
  /** "pantalla-estado", the file name after the number. */
  name: string
  /** What the screenshot shows, in Spanish, for the reviewer. */
  description: string
  /** Taken without a session, in a context of its own. */
  anonymous?: boolean
  /** Not taken in this run, and why. */
  omitted?: string
  /** Takes the page to the state (from any screen). */
  run: (page: Page) => Promise<void>
}

const index = {
  createdAt: now.toISOString(),
  baseUrl: null as string | null,
  device: deviceName,
  viewport: device.viewport,
  notes: [
    'Capturas de Playwright WebKit (no Safari de iOS) emulando el dispositivo: tamaño de pantalla, densidad, toque y user agent.',
    'No imitan la app agregada a la pantalla de inicio (sin las barras de Safari la pantalla es más alta), el teclado de iOS (los estados con un campo enfocado lo tendrían abierto) ni las safe areas reales (notch y barra de inicio). Las fuentes pueden no ser las de iOS.',
    'Los datos son inventados, de un usuario de demo de dev.',
  ],
  captures: [] as Capture[],
  failed: [] as Failure[],
  omitted: [] as Omitted[],
  error: null as string | null,
}

/**
 * Waits until the screen is drawn: no "Cargando…" nor gray loading shapes
 * ([data-loading]), requests done, fonts.
 */
async function settle(page: Page) {
  await page.waitForFunction(
    "!document.body.innerText.includes('Cargando…') && document.querySelector('[data-loading]') === null",
    undefined,
    { timeout: 20_000 },
  )
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
  await page.evaluate('document.fonts.ready.then(() => true)')
  await page.waitForTimeout(200)
}

/** What is on screen and, if the page is longer, the whole page. */
async function shoot(page: Page, base: string): Promise<Capture['kind'][]> {
  await settle(page)
  await page.screenshot({
    path: path.join(outDir, `${base}.png`),
    scale: 'css',
    animations: 'disabled',
  })
  const longer = await page.evaluate<boolean>(
    'document.documentElement.scrollHeight > window.innerHeight + 1',
  )
  if (!longer) return ['viewport']
  await page.screenshot({
    path: path.join(outDir, `${base}-full.png`),
    scale: 'css',
    animations: 'disabled',
    fullPage: true,
  })
  return ['viewport', 'full']
}

function need(food: Food | undefined, what: string): Food {
  if (food === undefined) {
    throw new Error(`El usuario de demo no tiene un alimento ${what}.`)
  }
  return food
}

function firstWord(text: string): string {
  return text.split(/\s+/)[0] ?? text
}

function buildStates(
  baseUrl: string,
  foods: DemoFoods,
  settings: Settings,
  clearDoseAlert: () => Promise<void>,
  // The states after the --sin-alerta ones need the dose alert back.
  putDoseAlertBack: () => Promise<void>,
): State[] {
  const go = async (page: Page, route: string) => {
    await page.goto(`${baseUrl}${route}`)
  }

  // Inicio with an empty meal: the meal in progress lives in sessionStorage
  // (spec §6.6), so it is removed and the page reloaded.
  const emptyMeal = async (page: Page) => {
    await go(page, '/')
    await page.evaluate(`sessionStorage.removeItem('${MEAL_DRAFT_KEY}')`)
    await page.reload()
    await page.locator('#meal-food-search-open').waitFor()
  }

  // Opens the search over the whole screen (UX-08): the field of an empty
  // Inicio, or "+ Agregar alimento".
  const openSearch = async (page: Page) => {
    const field = page.locator('#meal-food-search-open')
    if (await field.isVisible()) {
      await field.click()
    } else {
      await page.getByRole('button', { name: 'Agregar alimento' }).click()
    }
    await page.getByRole('dialog').waitFor()
  }

  const itemCard = (page: Page, food: Food) =>
    page
      .locator('li')
      .filter({ has: page.getByText(food.name, { exact: true }) })
      .first()

  // Picks a food in the search of Inicio and types its quantity, as a user.
  const addItem = async (page: Page, food: Food, quantity: string) => {
    await openSearch(page)
    await page.locator('#meal-food-search').fill(food.name)
    await page
      .getByRole('dialog')
      .getByRole('button', { name: food.name })
      .first()
      .click()
    // Picking closes the search and leaves its entry of the browser history.
    await page.getByRole('dialog').waitFor({ state: 'detached' })
    await page.waitForFunction(
      '!(history.state && history.state.usr && history.state.usr.foodSearch)',
    )
    const field = itemCard(page, food).locator('input[id$="-quantity"]')
    await field.pressSequentially(quantity)
    await field.blur()
  }

  // A meal of three items: one in units, one cooked and one of the table.
  const buildMeal = async (page: Page, cookedGrams = '250') => {
    await emptyMeal(page)
    await addItem(page, need(foods.units, 'con peso por unidad'), '1')
    await addItem(
      page,
      need(foods.cooked, 'que se cocina, con cuánto rinde'),
      cookedGrams,
    )
    await addItem(page, need(foods.table, 'copiado de la tabla'), '120')
  }

  const clearField = async (field: Locator) => {
    await field.click()
    await field.press('ControlOrMeta+a')
    await field.press('Backspace')
    if ((await field.inputValue()) !== '') {
      throw new Error('No se pudo vaciar el campo.')
    }
  }

  // "Guardar comida" in Inicio, "Guardar" in the other screens.
  const saveButton = (page: Page) =>
    page.getByRole('button', { name: /^Guardar( comida)?$/ })

  // Puts an element in the middle of the screen: scrollIntoViewIfNeeded
  // does nothing if a corner already shows, and the fixed bar at the
  // bottom can cover the rest.
  const center = (locator: Locator) =>
    locator.evaluate((element) => element.scrollIntoView({ block: 'center' }))

  const foodDetail = async (page: Page, food: Food) => {
    await go(page, `/foods/${food.id}`)
    await page.getByRole('link', { name: 'Editar' }).waitFor()
  }

  // The open days of the history live in its entry of the browser history,
  // and going to /history while on it keeps them: a day is only toggled if
  // it is closed.
  const openDay = async (page: Page, day: RegExp) => {
    const button = page.getByRole('button', { name: day })
    if ((await button.getAttribute('aria-expanded')) !== 'true') {
      await button.click()
    }
  }

  // The most recent meal of today, opened from the history list.
  const todayMeal = async (page: Page) => {
    await go(page, '/history')
    await openDay(page, /^Hoy\b/)
    await page.locator('a[href^="/history/"]').first().click()
    await page.getByRole('heading', { name: 'Comida', exact: true }).waitFor()
  }

  const breadQuery = firstWord(foods.bread?.name ?? 'pan').toLowerCase()

  // Cooked grams of a food that, alone, give more than the dose alert with
  // the demo ratio: the meal of buildMeal adds two more foods, so its dose
  // is above the alert. Only to type the quantity; the app calculates.
  const cookedGramsAbove = (food: Food) => {
    const alert = settings.max_dose_warning_units ?? DOSE_ALERT_UNITS
    const perGram = food.carbs_per_100g / (food.cooking_factor ?? 1) / 100
    if (!(perGram > 0)) {
      throw new Error(`«${food.name}» no tiene HC: no sirve para la alerta.`)
    }
    return Math.ceil((alert * settings.carb_ratio_g_per_unit) / perGram) + 1
  }

  return [
    {
      name: 'login',
      description: 'Inicio de sesión, sin sesión iniciada.',
      anonymous: true,
      run: async (page) => {
        await go(page, '/login')
        await page.getByRole('button', { name: 'Entrar' }).waitFor()
      },
    },

    // --- Inicio (spec §6.6) ---
    {
      name: 'inicio-vacio',
      description:
        'Inicio sin alimentos en la comida: el campo de búsqueda con «Con foto» a su derecha y, debajo, «Recientes» y «A esta hora comiste» (o «Tus últimas comidas»).',
      run: emptyMeal,
    },
    {
      name: 'inicio-buscador',
      description: `Inicio con el buscador a pantalla completa, escribiendo «${breadQuery}»: resultados de «Tus alimentos» y de la «Tabla de alimentos».`,
      run: async (page) => {
        await emptyMeal(page)
        await openSearch(page)
        await page.locator('#meal-food-search').fill(breadQuery)
        await page
          .getByRole('heading', { name: 'Tus alimentos' })
          .or(page.getByRole('heading', { name: 'Tabla de alimentos' }))
          .first()
          .waitFor()
      },
    },
    {
      name: 'inicio-falta-rinde',
      description:
        'Inicio con el buscador a pantalla completa, buscando un alimento que se cocina y no tiene cargado cuánto rinde: no se puede elegir, con «Falta cuánto rinde» y «Cargar cuánto rinde».',
      run: async (page) => {
        const food = need(foods.missingYield, 'que se cocina sin cuánto rinde')
        await emptyMeal(page)
        await openSearch(page)
        await page
          .locator('#meal-food-search')
          .fill(firstWord(food.name).toLowerCase())
        await page
          .getByRole('link', { name: 'Cargar cuánto rinde' })
          .first()
          .waitFor()
      },
    },
    {
      name: 'inicio-items',
      description:
        'Inicio con tres alimentos y sus cantidades (uno en unidades, uno cocido y uno de la tabla), el visor con los hidratos, la dosis y el ratio, «Agregar alimento» y «Con foto», «Me apliqué» con sus atajos, la fecha y «Guardar comida».',
      run: async (page) => {
        await buildMeal(page)
        await page
          .getByRole('heading', { name: 'Nueva comida' })
          .scrollIntoViewIfNeeded()
      },
    },
    {
      name: 'inicio-ver-la-cuenta',
      description:
        'Inicio con «Ver la cuenta» abierto en el alimento cocido y en el visor de la dosis.',
      run: async (page) => {
        await buildMeal(page)
        const cooked = need(foods.cooked, 'que se cocina, con cuánto rinde')
        await itemCard(page, cooked)
          .getByRole('button', { name: 'Ver la cuenta' })
          .click()
        // The arrow of the dose display, the one that controls its
        // calculation.
        await page
          .locator('button[aria-controls="meal-dose-calculation"]')
          .click()
      },
    },
    {
      name: 'inicio-error-cantidad',
      description:
        'Inicio con la cantidad de un alimento borrada, después de salir del campo: «Poné cuántos gramos comiste.» y el visor con «—» en lugar de los números.',
      run: async (page) => {
        await buildMeal(page)
        const field = itemCard(
          page,
          need(foods.table, 'copiado de la tabla'),
        ).locator('input[id$="-quantity"]')
        await clearField(field)
        await field.blur()
        await page.getByText('Poné cuántos gramos comiste.').waitFor()
        await center(field)
      },
    },
    {
      name: 'inicio-advertencias',
      description:
        'Inicio después de tocar «Guardar comida» con un alimento por encima de la alerta de gramos: el aviso en vivo debajo de su cantidad y el recuadro «Revisá antes de guardar», en lugar de «Guardar comida», con «Revisar» (principal) y «Guardar igual».',
      run: async (page) => {
        // More grams than the alert, so at least that warning shows up.
        await buildMeal(
          page,
          String(Math.ceil(settings.max_item_grams_warning) + 150),
        )
        await saveButton(page).click()
        const box = page
          .getByRole('alert')
          .filter({ hasText: 'Revisá antes de guardar' })
        await box.waitFor()
        await center(box)
      },
    },
    {
      name: 'inicio-cambiar-fecha',
      description:
        'Inicio con «Cambiar» la fecha abierto: el campo de fecha y hora y «Usar ahora».',
      run: async (page) => {
        await buildMeal(page)
        await page.getByRole('button', { name: 'Cambiar' }).click()
        await center(page.locator('#meal-eaten-at'))
      },
    },
    {
      name: 'inicio-dosis-editada',
      description:
        'Inicio con «Me apliqué» cambiado a mano (8,5): los atajos de la lapicera, con el elegido marcado si coincide, y el de la dosis calculada.',
      run: async (page) => {
        await buildMeal(page)
        const dose = page.locator('#meal-applied-dose')
        await clearField(dose)
        await dose.pressSequentially('8,5')
        await dose.blur()
        await page.locator('#meal-applied-dose-shortcuts').waitFor()
        await center(dose)
      },
    },
    {
      name: 'inicio-comida-guardada',
      description:
        'Inicio después de guardar una comida (se guarda de verdad): «Listo, guardada.» con los hidratos y la dosis, y «Ver en el historial», con la comida vacía.',
      run: async (page) => {
        await buildMeal(page)
        await saveButton(page).click()
        const saved = page.getByText('Listo, guardada.')
        const anyway = page.getByRole('button', { name: 'Guardar igual' })
        await saved.or(anyway).first().waitFor()
        if (await anyway.isVisible()) await anyway.click()
        await saved.waitFor({ timeout: 30_000 })
        await saved.scrollIntoViewIfNeeded()
      },
    },

    // --- Mis alimentos (spec §6.5) ---
    {
      name: 'alimentos',
      description:
        'Mis alimentos sin búsqueda: la lista plegada detrás de «Ver todos los alimentos».',
      run: async (page) => {
        await go(page, '/foods')
        await page
          .getByRole('button', { name: /^Ver todos los alimentos/ })
          .waitFor()
      },
    },
    {
      name: 'alimentos-todos',
      description: 'Mis alimentos con «Ver todos los alimentos» abierto.',
      run: async (page) => {
        await go(page, '/foods')
        await page
          .getByRole('button', { name: /^Ver todos los alimentos/ })
          .click()
      },
    },
    {
      name: 'alimentos-busqueda',
      description: `Mis alimentos buscando «${breadQuery}», con resultados.`,
      run: async (page) => {
        await go(page, '/foods')
        await page.locator('#food-search').fill(breadQuery)
      },
    },
    {
      name: 'alimentos-sin-resultados',
      description: 'Mis alimentos buscando «milanesa», sin resultados.',
      run: async (page) => {
        await go(page, '/foods')
        await page.locator('#food-search').fill('milanesa')
        await page.getByText('No hay alimentos que coincidan').waitFor()
      },
    },
    {
      name: 'alimento-tabla',
      description:
        'Detalle de un alimento copiado de la tabla de alimentos: «De la tabla de alimentos» con su ⓘ.',
      run: (page) => foodDetail(page, need(foods.table, 'copiado de la tabla')),
    },
    {
      name: 'alimento-cocido',
      description:
        'Detalle de un alimento que se cocina, con cuánto rinde cargado.',
      run: (page) =>
        foodDetail(page, need(foods.cooked, 'que se cocina, con cuánto rinde')),
    },
    {
      name: 'alimento-unidad',
      description: 'Detalle de un alimento con marca y peso por unidad.',
      run: (page) => foodDetail(page, need(foods.units, 'con peso por unidad')),
    },
    {
      name: 'alimento-falta-rinde',
      description:
        'Detalle de un alimento que se cocina sin cuánto rinde: la marca «Falta cuánto rinde».',
      run: (page) =>
        foodDetail(
          page,
          need(foods.missingYield, 'que se cocina sin cuánto rinde'),
        ),
    },
    {
      name: 'alimento-archivar',
      description:
        'Detalle de un alimento sin marca y con nota, con la confirmación de «Archivar» abierta (sin confirmar).',
      run: async (page) => {
        await foodDetail(page, need(foods.bread ?? foods.yogurt, 'manual'))
        // Only the first "Archivar": the one in the box would archive it.
        await page
          .getByRole('button', { name: 'Archivar alimento', exact: true })
          .click()
        await center(page.getByText('¿Archivar'))
      },
    },
    {
      name: 'alimento-editar',
      description:
        'Editar un alimento que se cocina, con cuánto rinde cargado.',
      run: async (page) => {
        const food = need(foods.cooked, 'que se cocina, con cuánto rinde')
        await go(page, `/foods/${food.id}/edit`)
        await page
          .getByRole('button', { name: 'Guardar', exact: true })
          .waitFor()
      },
    },
    {
      name: 'alimento-agregar-a-mano',
      description: 'Agregar un alimento a mano, con «Más opciones» abierto.',
      run: async (page) => {
        await go(page, '/foods/new')
        const more = page.getByRole('button', { name: 'Más opciones' })
        if ((await more.getAttribute('aria-expanded')) !== 'true') {
          await more.click()
        }
      },
    },
    {
      name: 'alimento-foto',
      description:
        'Agregar con una foto sin una foto elegida: lo que queda de la pantalla intermedia, que solo se ve si se abre por URL o se recarga (desde «Con foto» y «Agregar con una foto» se abre directo la cámara o la galería, UX-16; el script no elige fotos).',
      run: async (page) => {
        await go(page, '/foods/label')
        await page.getByText('Sacar o elegir la foto').waitFor()
      },
    },

    // --- Historial (spec §6.7) ---
    {
      name: 'historial',
      description:
        'Historial con todos los días plegados (al entrar, «Hoy» y «Ayer» arrancan abiertos: se pliegan a mano).',
      run: async (page) => {
        await go(page, '/history')
        await page.getByRole('button', { name: /^Hoy\b/ }).waitFor()
        // Only the days have aria-expanded on this screen.
        const open = page.locator('button[aria-expanded="true"]')
        for (let i = 0; i < 50 && (await open.count()) > 0; i++) {
          await open.first().click()
        }
      },
    },
    {
      name: 'historial-hoy-ayer',
      description:
        'Historial con «Hoy» y «Ayer» abiertos, como al entrar desde la barra (UX-11).',
      run: async (page) => {
        await go(page, '/history')
        await openDay(page, /^Hoy\b/)
        await openDay(page, /^Ayer\b/)
      },
    },
    {
      name: 'comida-detalle',
      description: 'Detalle de una comida guardada (la más reciente de hoy).',
      run: todayMeal,
    },
    {
      name: 'comida-ver-la-cuenta',
      description:
        'Detalle de una comida con «Ver la cuenta» abierto en cada alimento (el resumen de arriba no tiene «Ver la cuenta» desde UX-12).',
      run: async (page) => {
        await todayMeal(page)
        const closed = page.getByRole('button', { name: 'Ver la cuenta' })
        for (let i = 0; i < 20 && (await closed.count()) > 0; i++) {
          await closed.first().click()
        }
      },
    },
    {
      name: 'comida-borrar',
      description:
        'Detalle de una comida con la confirmación de «Borrar comida» abierta (sin confirmar).',
      run: async (page) => {
        await todayMeal(page)
        await page
          .getByRole('button', { name: 'Borrar comida', exact: true })
          .click()
        await center(page.getByText('¿Borrar la comida'))
      },
    },

    // --- Configuración (spec §6.8) ---
    {
      name: 'configuracion',
      description: 'Configuración, con la alerta de dosis máxima cargada.',
      run: async (page) => {
        await go(page, '/settings')
        await page.getByRole('button', { name: 'Cerrar sesión' }).waitFor()
      },
    },

    // --- Without the dose alert (--sin-alerta), last so numbers do not move ---
    {
      name: 'inicio-sin-alerta',
      description:
        'Inicio vacío sin la alerta de dosis máxima configurada: el aviso ámbar con «Ir a Configuración».',
      omitted: args['sin-alerta'] ? undefined : 'Se captura con --sin-alerta.',
      run: async (page) => {
        await clearDoseAlert()
        await emptyMeal(page)
        await page
          .getByText('Todavía no configuraste la alerta de dosis máxima')
          .waitFor()
      },
    },
    {
      name: 'configuracion-sin-alerta',
      description:
        'Configuración sin la alerta de dosis máxima: el aviso «Para empezar, completá la alerta de dosis máxima.» y el campo vacío.',
      omitted: args['sin-alerta'] ? undefined : 'Se captura con --sin-alerta.',
      run: async (page) => {
        await clearDoseAlert()
        await go(page, '/settings')
        await page
          .getByText('Para empezar, completá la alerta de dosis máxima.')
          .waitFor()
      },
    },

    // --- Added in tanda 2 of M1, at the end so the numbers above do not
    // move. None of them saves anything. ---
    {
      name: 'configuracion-cambiar-ratio',
      description:
        'Configuración después de escribir otro ratio y tocar «Guardar»: el recuadro «¿Cambiar el ratio…?», en lugar de «Guardar», con «Cambiar el ratio» y «No cambiar», sin confirmar (no se guarda nada; al salir de la pantalla, el campo vuelve al ratio guardado).',
      run: async (page) => {
        await putDoseAlertBack()
        await go(page, '/settings')
        const field = page.locator('#settings-carb_ratio_g_per_unit')
        await field.waitFor()
        await clearField(field)
        await field.pressSequentially(
          settings.carb_ratio_g_per_unit === 12 ? '15' : '12',
        )
        await field.blur()
        await saveButton(page).click()
        await page.getByRole('button', { name: 'No cambiar' }).waitFor()
        await center(page.getByText('¿Cambiar el ratio de'))
      },
    },
    {
      name: 'inicio-alerta-dosis',
      description:
        'Inicio con una comida cuya dosis calculada supera la alerta de dosis máxima: el visor con «Más que tu alerta de … unidades.» (sin tocar «Guardar comida»).',
      run: async (page) => {
        await putDoseAlertBack()
        await buildMeal(
          page,
          String(cookedGramsAbove(need(foods.cooked, 'que se cocina'))),
        )
        await page
          .getByText(/Más que tu alerta de [\d.,]+\sunidad/)
          .first()
          .waitFor()
        await page.evaluate('window.scrollTo(0, 0)')
      },
    },
    {
      name: 'alimento-rinde-raro',
      description:
        'Editar un alimento que se cocina con un rinde fuera de lo habitual (100 g crudo, 600 g cocido) y tocar «Guardar»: el recuadro en lugar de «Guardar» y «Cancelar», con «Revisar» (principal) y «Guardar igual», sin confirmar (no se guarda nada).',
      run: async (page) => {
        const food = need(foods.cooked, 'que se cocina, con cuánto rinde')
        await go(page, `/foods/${food.id}/edit`)
        await saveButton(page).waitFor()
        const more = page.getByRole('button', { name: 'Más opciones' })
        if ((await more.getAttribute('aria-expanded')) !== 'true') {
          await more.click()
        }
        const raw = page.locator('#food-rawWeight')
        const cooked = page.locator('#food-cookedWeight')
        await clearField(raw)
        await raw.pressSequentially('100')
        await clearField(cooked)
        await cooked.pressSequentially('600')
        await cooked.blur()
        await saveButton(page).click()
        await page.getByRole('button', { name: 'Guardar igual' }).waitFor()
        await center(page.getByRole('button', { name: 'Revisar' }))
      },
    },

    // --- Added in tanda 3 of M1, at the end so the numbers above do not
    // move. It saves nothing. ---
    {
      name: 'inicio-deshacer',
      description:
        'Inicio después de quitar un alimento con su ✕: en el lugar de su tarjeta, «Quitaste {nombre}.» con «Deshacer» (con el foco), que dura 5 segundos (no se toca).',
      run: async (page) => {
        await buildMeal(page)
        const table = need(foods.table, 'copiado de la tabla')
        await page
          .getByRole('button', { name: `Quitar ${table.name}`, exact: true })
          .click()
        const undo = page.getByRole('button', { name: 'Deshacer' })
        await undo.waitFor()
        await center(undo)
      },
    },
    {
      name: 'inicio-guardar-con-error',
      description:
        'Inicio con la cantidad de un alimento vacía y la página bajada del todo, después de tocar «Guardar comida»: la pantalla salta a esa cantidad, con el foco, y junto al botón «Falta la cantidad de {nombre}.» (no se guarda).',
      run: async (page) => {
        await buildMeal(page)
        const field = itemCard(
          page,
          need(foods.table, 'copiado de la tabla'),
        ).locator('input[id$="-quantity"]')
        await clearField(field)
        await page.evaluate(
          'window.scrollTo(0, document.documentElement.scrollHeight)',
        )
        await saveButton(page).click()
        await page.getByText(/^Falta la cantidad de /).waitFor()
      },
    },
    {
      name: 'inicio-cantidad-larga',
      description:
        'Inicio con «1.250,5» en la cantidad de un alimento que se cocina, con el foco en el campo: el contorno de foco y el número entero junto a «g cocidos».',
      run: async (page) => {
        await emptyMeal(page)
        const cooked = need(foods.cooked, 'que se cocina, con cuánto rinde')
        await addItem(page, cooked, '1250,5')
        const field = itemCard(page, cooked).locator('input[id$="-quantity"]')
        await field.focus()
        // The focus selects the whole number (UX-15): the caret goes to the
        // end, so the screenshot shows the number as it reads.
        await page.waitForTimeout(50)
        await page.evaluate(
          "(() => { const input = document.activeElement; if (input && 'setSelectionRange' in input) input.setSelectionRange(input.value.length, input.value.length) })()",
        )
        await center(field)
      },
    },

    // --- Added in tanda 4 of M1 (UX-08 to UX-10), at the end so the
    // numbers above do not move. None of them saves anything. ---
    {
      name: 'inicio-recientes',
      description:
        'Inicio vacía con «Recientes» (los últimos alimentos usados, a un toque) y «A esta hora comiste» (o «Tus últimas comidas»), cada comida con «Repetir».',
      run: async (page) => {
        await emptyMeal(page)
        await page.getByRole('heading', { name: 'Recientes' }).waitFor()
        await page
          .getByRole('heading', {
            name: /^(A esta hora comiste|Tus últimas comidas)$/,
          })
          .waitFor()
      },
    },
    {
      name: 'inicio-buscador-pantalla-completa',
      description:
        'Inicio después de tocar el campo de búsqueda: el buscador a pantalla completa, sin nada escrito, con la ayuda y «Recientes».',
      run: async (page) => {
        await emptyMeal(page)
        await openSearch(page)
      },
    },
    {
      name: 'inicio-repetir',
      description:
        'Inicio después de tocar «Repetir» en la primera comida de «A esta hora comiste» (o «Tus últimas comidas»): los mismos alimentos y cantidades, con los valores de hoy, el aviso «Copiaste la comida de…» y, si alguno no se pudo traer, el aviso de cada uno (no se guarda).',
      run: async (page) => {
        await emptyMeal(page)
        await page
          .getByRole('button', { name: /^Repetir la comida / })
          .first()
          .click()
        await page
          .getByText(/^(Copiaste la comida |No se pudo traer )/)
          .first()
          .waitFor()
        await page.evaluate('window.scrollTo(0, 0)')
      },
    },
    {
      name: 'inicio-corrigiendo',
      description:
        'Inicio después de tocar «Corregir» en el detalle de la comida más reciente de hoy (reemplazando la comida a medio cargar, si había): arriba, «Estás corrigiendo la comida de…» con «Cancelar la corrección», y la comida con su fecha y hora y su dosis aplicada (no se guarda).',
      run: async (page) => {
        await todayMeal(page)
        await page
          .getByRole('button', { name: 'Corregir', exact: true })
          .click()
        const replace = page.getByRole('button', {
          name: 'Reemplazar',
          exact: true,
        })
        const correcting = page.getByText(/^Estás corrigiendo la comida /)
        await replace.or(correcting).first().waitFor()
        if (await replace.isVisible()) await replace.click()
        await correcting.waitFor()
        await page.evaluate('window.scrollTo(0, 0)')
      },
    },

    // --- Added in M10 (the 24-hour glucose chart, spec §6.10), at the end
    // so the numbers above do not move. The demo user has no sensor: the
    // first two answer the glucose with invented readings, in the browser
    // only (nothing is saved). ---
    {
      name: 'inicio-glucosa',
      description:
        'Inicio con el recuadro de la glucosa (lecturas inventadas, respondidas en el navegador): el valor, la curva de las últimas 3 horas y la flecha; todo el recuadro abre el gráfico.',
      run: async (page) => {
        await fakeGlucose(page)
        await emptyMeal(page)
        await page.getByRole('link', { name: /^Glucosa del sensor/ }).waitFor()
      },
    },
    {
      name: 'glucosa',
      description:
        'Gráfico de la glucosa de las últimas 24 horas (lecturas inventadas, con un hueco de dos horas sin lecturas): el valor actual arriba, el selector de horas, la franja verde de 70 a 180, las guías, el más bajo y el más alto, el punto de ahora y un ícono por cada comida guardada en esas horas.',
      run: async (page) => {
        await fakeGlucose(page)
        await go(page, '/glucose')
        await page
          .getByRole('slider', { name: 'Lecturas de glucosa' })
          .waitFor()
      },
    },
    {
      name: 'glucosa-sin-lecturas',
      description:
        'Gráfico de la glucosa sin lecturas guardadas (el usuario de demo no tiene sensor).',
      run: async (page) => {
        await realGlucose(page)
        await go(page, '/glucose')
        await page.getByText('Todavía no hay lecturas guardadas').waitFor()
      },
    },
    // Added in the design batch of revision 2 (UX-29).
    {
      name: 'glucosa-toque',
      description:
        'Gráfico de la glucosa en 6 horas, con el dedo apoyado sobre la línea a un poco más de la mitad: la línea vertical, el punto y, en un globo arriba, el valor con su hora (UX-46).',
      run: async (page) => {
        await fakeGlucose(page)
        await go(page, '/glucose')
        await page.getByRole('button', { name: '6 horas' }).click()
        const chart = page.getByRole('slider', { name: 'Lecturas de glucosa' })
        await chart.waitFor()
        const box = await chart.boundingBox()
        if (box === null) throw new Error('El gráfico no está a la vista.')
        // Held down: letting go takes the mark away (#114).
        await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2)
        await page.mouse.down()
        await page
          .getByText(/^· \d{2}:\d{2}$/)
          .first()
          .waitFor()
      },
    },
    // Added in the detail batch of revision 2 (UX-42): the ⓘ opens a
    // bubble over the screen.
    {
      name: 'inicio-glucosa-info',
      description:
        'Inicio con el ⓘ del recuadro de la glucosa abierto: la explicación en un globo encima, sin mover nada (UX-42).',
      run: async (page) => {
        await fakeGlucose(page)
        await emptyMeal(page)
        await page.getByRole('link', { name: /^Glucosa del sensor/ }).waitFor()
        await openInfo(page)
      },
    },
    {
      name: 'alimento-tabla-info',
      description:
        'Detalle de un alimento de la tabla con el ⓘ de «De la tabla de alimentos» abierto (UX-42).',
      run: async (page) => {
        await foodDetail(page, need(foods.table, 'copiado de la tabla'))
        await openInfo(page)
      },
    },
    {
      name: 'configuracion-info',
      description: 'Configuración con su primer ⓘ abierto (UX-42).',
      run: async (page) => {
        await go(page, '/settings')
        await page.getByRole('button', { name: 'Cerrar sesión' }).waitFor()
        await openInfo(page)
      },
    },
  ]
}

// The glucose of the demo user, which has no sensor, answered in the
// browser with invented readings: the last one in glucose-latest and one
// every 15 min of the last 24 hours in glucose_readings, with a gap of two
// hours so the cut line shows. Nothing reaches the base.
const LATEST_GLUCOSE_ROUTE = '**/functions/v1/glucose-latest'
const SAVED_GLUCOSE_ROUTE = '**/rest/v1/glucose_readings*'

// Opens the first ⓘ of the screen and waits for its bubble.
async function openInfo(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: 'Más información' }).first()
  await button.click()
  await page.locator('[popover]:popover-open').waitFor()
}

async function realGlucose(page: Page): Promise<void> {
  await page.unroute(LATEST_GLUCOSE_ROUTE)
  await page.unroute(SAVED_GLUCOSE_ROUTE)
}

async function fakeGlucose(page: Page): Promise<void> {
  await realGlucose(page)
  const end = Date.now() - 3 * 60_000
  const readings: { measured_at: string; mgdl: number }[] = []
  for (let i = 95; i >= 0; i--) {
    // The gap: from 8 to 10 hours ago.
    if (i >= 32 && i < 40) continue
    const time = end - i * 15 * 60_000
    const mgdl = Math.round(135 + 55 * Math.sin(i / 7) + 25 * Math.sin(i / 2.3))
    readings.push({ measured_at: new Date(time).toISOString(), mgdl })
  }
  const last = readings.at(-1)
  await page.route(LATEST_GLUCOSE_ROUTE, (route) =>
    route.fulfill({
      json: {
        ok: true,
        reading:
          last === undefined
            ? null
            : {
                mgdl: last.mgdl,
                trend: 'steady',
                measured_at: last.measured_at,
              },
      },
    }),
  )
  await page.route(SAVED_GLUCOSE_ROUTE, (route) =>
    route.fulfill({ json: readings }),
  )
}

async function signInThroughUi(page: Page, baseUrl: string) {
  await page.goto(`${baseUrl}/login`)
  await page.getByLabel('Email').fill(demoEmail)
  await page.getByLabel('Contraseña').fill(demoPassword)
  await page.getByRole('button', { name: 'Entrar' }).click()
  // Inicio: «¿Qué vas a comer?» empty, «Nueva comida» with a meal kept.
  await page
    .getByRole('heading', { level: 1, name: /¿Qué vas a comer\?|Nueva comida/ })
    .waitFor()
}

async function startVite(): Promise<ViteDevServer> {
  const server = await createServer({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.ts'),
    logLevel: 'warn',
    clearScreen: false,
    server: { host: '127.0.0.1', port: PORT, strictPort: true },
  })
  try {
    await server.listen()
  } catch (error) {
    await server.close()
    throw error
  }
  return server
}

// --- Main -------------------------------------------------------------------------

let server: ViteDevServer | null = null
let browser: Browser | null = null
// Set by --sin-alerta when it clears the dose alert (in a closure: the cast
// keeps TypeScript from narrowing it to null).
let restoreDoseAlert = null as (() => Promise<void>) | null
let prodRequests = 0

try {
  await mkdir(outDir, { recursive: true })

  // Demo data, signed in as the demo user.
  const supabase = demoClient()
  const signIn = await supabase.auth.signInWithPassword({
    email: demoEmail,
    password: demoPassword,
  })
  if (signIn.error || !signIn.data.user) {
    throw new Error(
      `No se pudo iniciar sesión como usuario de demo: ${signIn.error?.message ?? 'sin usuario'}`,
    )
  }
  const userId = signIn.data.user.id
  await ensureUsageNoticeAccepted(supabase, userId)
  const loadedFoods = await ensureFoods(supabase)
  const foods = demoFoods(await activeFoods(supabase))
  const settings = await ensureDoseAlert(supabase, userId)
  const added = await ensureMeals(supabase, settings, foods)
  console.log(
    `Datos de demo: ${loadedFoods > 0 ? `${loadedFoods} alimentos cargados` : 'los alimentos ya estaban'}; ${added.meals > 0 ? `${added.meals} comidas agregadas en ${added.days} días` : 'las comidas ya estaban'}.`,
  )

  const clearDoseAlert = async () => {
    if (restoreDoseAlert !== null) return
    const previous = settings.max_dose_warning_units
    await setDoseAlert(supabase, userId, null)
    restoreDoseAlert = async () => {
      await setDoseAlert(supabase, userId, previous)
    }
  }
  const putDoseAlertBack = async () => {
    if (restoreDoseAlert === null) return
    await restoreDoseAlert()
    restoreDoseAlert = null
  }

  // The app: the Vite dev server, or the URL given.
  if (remoteUrl === null) {
    server = await startVite()
  }
  const baseUrl = remoteUrl ?? `http://127.0.0.1:${PORT}`
  index.baseUrl = baseUrl

  const launched = await webkit.launch()
  browser = launched
  const contextOptions = {
    ...device,
    locale: 'es-AR',
    timezoneId: TIME_ZONE,
    // --oscuro: the dark mode of the iPhone (UX-21).
    colorScheme: args.oscuro ? ('dark' as const) : ('light' as const),
  }
  // Nothing in the browser may reach prod (for example, a --url whose app
  // uses the prod project).
  const newContext = async (): Promise<BrowserContext> => {
    const context = await launched.newContext(contextOptions)
    context.setDefaultTimeout(15_000)
    context.setDefaultNavigationTimeout(60_000)
    await context.route(
      (url) => url.hostname.includes(PROD_REF),
      async (route) => {
        prodRequests += 1
        await route.abort()
      },
    )
    return context
  }
  const anonymousPage = await (await newContext()).newPage()
  const userPage = await (await newContext()).newPage()

  // The first load compiles the app: done once before the screenshots.
  await anonymousPage
    .goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
    .catch(() => {})

  let blocked: string | null = null
  try {
    await signInThroughUi(userPage, baseUrl)
  } catch (error) {
    blocked = `No se pudo iniciar sesión en la app: ${clean(error)}`
  }
  if (prodRequests > 0) {
    blocked =
      'La app pidió datos al proyecto de prod (bloqueado): no se captura.'
  }

  const states = buildStates(
    baseUrl,
    foods,
    settings,
    clearDoseAlert,
    putDoseAlertBack,
  )
  // --solo: only the named states (without their number). The others are
  // listed as omitted, so the numbers do not move. A state that needs one
  // before it may fail alone: then run without --solo.
  const only =
    args.solo === undefined
      ? null
      : new Set(args.solo.split(',').map((name) => name.trim()))
  if (only !== null) {
    const unknown = [...only].filter(
      (name) => !states.some((state) => state.name === name),
    )
    if (unknown.length > 0) {
      fail(`--solo: no existe el estado ${unknown.join(', ')}.\n${USAGE}`)
    }
  }
  for (const [position, state] of states.entries()) {
    const base = `${String(position + 1).padStart(2, '0')}-${state.name}`
    if (only !== null && !only.has(state.name)) {
      index.omitted.push({
        state: base,
        description: state.description,
        reason: 'No se pidió con --solo.',
      })
      continue
    }
    if (state.omitted !== undefined) {
      index.omitted.push({
        state: base,
        description: state.description,
        reason: state.omitted,
      })
      continue
    }
    const page = state.anonymous ? anonymousPage : userPage
    try {
      if (blocked !== null && !state.anonymous) throw new Error(blocked)
      await state.run(page)
      const route = new URL(page.url()).pathname
      for (const kind of await shoot(page, base)) {
        index.captures.push({
          file: kind === 'full' ? `${base}-full.png` : `${base}.png`,
          route,
          description:
            kind === 'full'
              ? `${state.description} (Página completa.)`
              : state.description,
          kind,
        })
      }
      console.log(`✓ ${base}`)
    } catch (error) {
      const message = clean(error)
      index.failed.push({
        state: base,
        route:
          page.url() === 'about:blank' ? null : new URL(page.url()).pathname,
        description: state.description,
        error: message,
      })
      console.log(`✗ ${base}: ${message.split('\n')[0] ?? ''}`)
    }
  }
  if (prodRequests > 0) {
    index.error = `La app intentó ${prodRequests} pedido(s) al proyecto de prod; se bloquearon.`
  }
} catch (error) {
  index.error = clean(error)
  console.error(index.error)
} finally {
  if (restoreDoseAlert !== null) {
    await restoreDoseAlert().catch((error: unknown) => {
      console.error(
        `No se pudo volver a poner la alerta de dosis: ${clean(error)}`,
      )
    })
  }
  await browser?.close().catch(() => {})
  await server?.close().catch(() => {})
}

await writeFile(
  path.join(outDir, 'index.json'),
  `${JSON.stringify(index, null, 2)}\n`,
).catch((error: unknown) => {
  console.error(`No se pudo escribir index.json: ${clean(error)}`)
})

const failedCount = index.failed.length
console.log(
  `\n${index.captures.length} capturas${failedCount > 0 ? `, ${failedCount} estado(s) fallaron (ver index.json)` : ''}${index.omitted.length > 0 ? `, ${index.omitted.length} omitido(s)` : ''}.`,
)
console.log(`Salida: ${outDir}`)
process.exit(index.error !== null || failedCount > 0 ? 1 : 0)
