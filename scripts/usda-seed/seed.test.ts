import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { carbsWithoutFiber } from '../../src/domain/dose/index.ts'
import {
  CARBS_NUTRIENT_ID,
  FIBER_NUTRIENT_ID,
  buildRows,
  parseCsvLine,
  parseSelection,
  parseUsdaAmount,
  toSeedSql,
  type NutrientAmount,
  type SeedRow,
  type SelectionEntry,
} from './seed.ts'

describe('parseCsvLine', () => {
  it.each([
    ['a,b,c', ['a', 'b', 'c']],
    ['"a","b","c"', ['a', 'b', 'c']],
    ['"Rice, white, cooked","1"', ['Rice, white, cooked', '1']],
    ['"trimmed to 0"" fat",x', ['trimmed to 0" fat', 'x']],
    ['""""', ['"']],
    ['"",""', ['', '']],
    ['a,,b', ['a', '', 'b']],
    ['a,', ['a', '']],
    ['"a",', ['a', '']],
    [',', ['', '']],
    ['', ['']],
    ['"",', ['', '']],
    ['1,"x",2', ['1', 'x', '2']],
  ])('%j → %j', (line, fields) => {
    expect(parseCsvLine(line)).toEqual(fields)
  })

  // build.ts splits on /\r?\n/ and strips the BOM before calling
  // parseCsvLine; these pin down what parseCsvLine does if they reach it.
  it('does not strip a trailing CR (build.ts splits on CRLF first)', () => {
    expect(parseCsvLine('a,b\r')).toEqual(['a', 'b\r'])
    expect(() => parseCsvLine('"a","b"\r')).toThrow(
      'texto después de la comilla de cierre',
    )
  })

  it('does not strip a BOM (build.ts removes it first)', () => {
    expect(parseCsvLine('\uFEFFa,b')).toEqual(['\uFEFFa', 'b'])
    expect(() => parseCsvLine('\uFEFF"id","name"')).toThrow(
      'comilla dentro de un campo sin comillas',
    )
  })

  it('keeps a BOM or a CR inside a quoted field', () => {
    expect(parseCsvLine('"\uFEFFa","b\rc"')).toEqual(['\uFEFFa', 'b\rc'])
  })

  it('keeps spaces and apostrophes as they are', () => {
    expect(parseCsvLine(' a , USDA\'s ,"x\'"')).toEqual([
      ' a ',
      " USDA's ",
      "x'",
    ])
  })

  it.each(['"abc', '"a,b', 'a,"b', '"a""', '"a"",b'])(
    '%j fails: unclosed quote',
    (line) => {
      expect(() => parseCsvLine(line)).toThrow('comillas sin cerrar')
    },
  )

  it.each(['a"b', 'a,b"c', 'ab"', 'x,"y",z"'])(
    '%j fails: quote inside an unquoted field',
    (line) => {
      expect(() => parseCsvLine(line)).toThrow(
        'comilla dentro de un campo sin comillas',
      )
    },
  )

  it.each(['"a"b', '"a" ,b', 'x,"a"b,c'])(
    '%j fails: text after the closing quote',
    (line) => {
      expect(() => parseCsvLine(line)).toThrow(
        'texto después de la comilla de cierre',
      )
    },
  )
})

describe('parseUsdaAmount', () => {
  it.each([
    ['28.2', 28.2],
    ['0', 0],
    ['0.000', 0],
    ['100', 100],
    ['0.1', 0.1],
    ['007', 7],
  ])('%j → %s', (text, value) => {
    expect(parseUsdaAmount(text)).toBe(value)
  })

  it.each([
    '',
    ' ',
    ' 2',
    '2 ',
    '-1',
    '+1',
    '1e3',
    'NaN',
    'Infinity',
    '1,5',
    '.5',
    '5.',
    '1.2.3',
    '0x10',
  ])('%j → null', (text) => {
    expect(parseUsdaAmount(text)).toBeNull()
  })
})

const banana = {
  fdc_id: 173944,
  usda_description: 'Bananas, raw',
  name_es: 'Banana',
}
const rice = {
  fdc_id: 168878,
  usda_description: 'Rice, white, long-grain, regular, enriched, cooked',
  name_es: 'Arroz blanco hervido',
}

describe('parseSelection', () => {
  it('accepts a valid list, unchanged', () => {
    expect(parseSelection([banana, rice])).toEqual([banana, rice])
  })

  it('accepts an empty list (the count is checked on the real file)', () => {
    expect(parseSelection([])).toEqual([])
  })

  it.each([
    ['not an array', { ...banana }],
    ['decimal fdc_id', [{ ...banana, fdc_id: 1.5 }]],
    ['negative fdc_id', [{ ...banana, fdc_id: -1 }]],
    ['zero fdc_id', [{ ...banana, fdc_id: 0 }]],
    ['string fdc_id', [{ ...banana, fdc_id: '173944' }]],
    ['missing name', [{ fdc_id: 1, usda_description: 'x' }]],
    ['missing description', [{ fdc_id: 1, name_es: 'x' }]],
    ['extra key', [{ ...banana, state: 'as_eaten' }]],
    ['empty name', [{ ...banana, name_es: '' }]],
    ['empty description', [{ ...banana, usda_description: '' }]],
  ])('fails with %s', (_, raw) => {
    expect(() => parseSelection(raw)).toThrow('La lista no es válida')
  })

  it.each([' Banana', 'Banana ', '  '])(
    'fails with the name %j (surrounding spaces)',
    (name) => {
      expect(() => parseSelection([{ ...banana, name_es: name }])).toThrow(
        'espacios al principio o al final',
      )
    },
  )

  it('fails with a repeated fdc_id, naming it', () => {
    expect(() =>
      parseSelection([banana, { ...banana, name_es: 'Otra banana' }]),
    ).toThrow('173944: el fdc_id está repetido')
  })

  it('fails with names that only differ in case or diacritics', () => {
    expect(() =>
      parseSelection([
        { fdc_id: 1, usda_description: 'x', name_es: 'Ananá' },
        { fdc_id: 2, usda_description: 'y', name_es: 'anana' },
      ]),
    ).toThrow('2: el nombre "anana" repite "Ananá"')
  })

  it('lists every problem at once', () => {
    const error = (() => {
      try {
        parseSelection([
          banana,
          { ...banana, name_es: 'banana' },
          { ...rice, name_es: 'Arroz ' },
        ])
      } catch (e) {
        return e instanceof Error ? e.message : ''
      }
      return ''
    })()
    expect(error).toContain('173944: el fdc_id está repetido')
    expect(error).toContain('173944: el nombre "banana" repite "Banana"')
    expect(error).toContain('168878: el nombre "Arroz " tiene espacios')
  })
})

const foods = new Map([
  [banana.fdc_id, banana.usda_description],
  [rice.fdc_id, rice.usda_description],
])

function amounts(
  fdcId: number,
  total: string | null,
  fiber: string | null,
): NutrientAmount[] {
  return [
    ...(total === null
      ? []
      : [{ fdcId, nutrientId: CARBS_NUTRIENT_ID, amount: total }]),
    ...(fiber === null
      ? []
      : [{ fdcId, nutrientId: FIBER_NUTRIENT_ID, amount: fiber }]),
  ]
}

function buildError(
  selection: SelectionEntry[],
  nutrients: NutrientAmount[],
): string {
  try {
    buildRows(selection, foods, nutrients)
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
  throw new Error('buildRows did not fail')
}

describe('buildRows', () => {
  const nutrients = [
    ...amounts(banana.fdc_id, '22.84', '2.6'),
    ...amounts(rice.fdc_id, '28.17', '0.4'),
    // Other nutrients and foods are ignored.
    { fdcId: banana.fdc_id, nutrientId: 1003, amount: '1.09' },
    ...amounts(999, '50', '1'),
  ]

  it('builds the rows in the order of the selection, without rounding', () => {
    expect(buildRows([rice, banana], foods, nutrients)).toEqual([
      {
        referenceCode: '168878',
        descriptionOriginal: rice.usda_description,
        nameEs: 'Arroz blanco hervido',
        state: 'as_eaten',
        carbsPer100g: 28.17 - 0.4,
        totalCarbsPer100g: 28.17,
        fiberPer100g: 0.4,
      },
      {
        referenceCode: '173944',
        descriptionOriginal: 'Bananas, raw',
        nameEs: 'Banana',
        state: 'as_eaten',
        carbsPer100g: 22.84 - 2.6,
        totalCarbsPer100g: 22.84,
        fiberPer100g: 2.6,
      },
    ])
  })

  it('accepts zero carbs and zero fiber', () => {
    const [row] = buildRows([banana], foods, amounts(banana.fdc_id, '0', '0'))
    expect(row?.carbsPer100g).toBe(0)
  })

  it('accepts fiber equal to the total', () => {
    const [row] = buildRows(
      [banana],
      foods,
      amounts(banana.fdc_id, '3.3', '3.3'),
    )
    expect(row?.carbsPer100g).toBe(0)
  })

  it('fails when the description does not match food.csv', () => {
    expect(
      buildError(
        [{ ...banana, usda_description: 'Bananas, cooked' }],
        nutrients,
      ),
    ).toContain('173944: la descripción no coincide')
  })

  it('fails when the id is not in food.csv', () => {
    expect(buildError([{ ...banana, fdc_id: 1 }], nutrients)).toContain(
      '1: no está en food.csv',
    )
  })

  it('fails when the total carbs are missing', () => {
    expect(buildError([banana], amounts(banana.fdc_id, null, '2.6'))).toContain(
      '173944: no informa HC totales (1005)',
    )
  })

  it('fails when the fiber is missing', () => {
    expect(
      buildError([banana], amounts(banana.fdc_id, '22.84', null)),
    ).toContain('173944: no informa fibra (1079)')
  })

  it('fails when both are missing, naming both', () => {
    const error = buildError([banana], [])
    expect(error).toContain('173944: no informa HC totales (1005)')
    expect(error).toContain('173944: no informa fibra (1079)')
  })

  it.each(['', '-1', 'abc'])('fails with the amount %j', (amount) => {
    expect(
      buildError([banana], amounts(banana.fdc_id, '22.84', amount)),
    ).toContain(`173944: fibra (1079) no es un número válido: "${amount}"`)
  })

  it('fails with a repeated nutrient row', () => {
    expect(
      buildError(
        [banana],
        [
          ...amounts(banana.fdc_id, '22.84', '2.6'),
          ...amounts(banana.fdc_id, '22.84', null),
        ],
      ),
    ).toContain('173944: HC totales (1005) está repetido')
  })

  it('fails when the fiber is more than the total', () => {
    expect(buildError([banana], amounts(banana.fdc_id, '2', '3'))).toContain(
      '173944: HC totales 2 y fibra 3 no dan un valor válido',
    )
  })

  it('fails when the total is more than 100', () => {
    expect(
      buildError([banana], amounts(banana.fdc_id, '100.5', '1')),
    ).toContain('173944: HC totales 100.5 y fibra 1 no dan un valor válido')
  })

  it.each([
    ['trailing space', 'Bananas, raw '],
    ['different case', 'bananas, raw'],
    ['empty', ''],
  ])('fails when the description only differs by %s', (_, usda_description) => {
    expect(buildError([{ ...banana, usda_description }], nutrients)).toContain(
      '173944: la descripción no coincide',
    )
  })

  it('does not look at the nutrients of a food whose description fails', () => {
    const error = buildError([{ ...banana, usda_description: 'x' }], [])
    expect(error).toContain('Hay 1 problema(s)')
    expect(error).not.toContain('no informa')
  })

  it('fails with a repeated fiber row, even with the same value', () => {
    expect(
      buildError(
        [banana],
        [
          ...amounts(banana.fdc_id, '22.84', '2.6'),
          ...amounts(banana.fdc_id, null, '2.6'),
        ],
      ),
    ).toContain('173944: fibra (1079) está repetido')
  })

  it.each(['1e1', '2.6 ', '-0', '+2'])(
    'fails with the total carbs amount %j',
    (amount) => {
      expect(
        buildError([banana], amounts(banana.fdc_id, amount, '2.6')),
      ).toContain(
        `173944: HC totales (1005) no es un número válido: "${amount}"`,
      )
    },
  )

  it('does not treat an empty fiber amount as 0', () => {
    expect(buildError([banana], amounts(banana.fdc_id, '22.84', ''))).toContain(
      'fibra (1079) no es un número válido: ""',
    )
  })

  it('uses the fiber nutrient 1079 and the carbs nutrient 1005', () => {
    expect(CARBS_NUTRIENT_ID).toBe(1005)
    expect(FIBER_NUTRIENT_ID).toBe(1079)
    // 1082 is soluble fiber, 1084 insoluble: they are not the fiber.
    expect(
      buildError(
        [banana],
        [
          ...amounts(banana.fdc_id, '22.84', null),
          { fdcId: banana.fdc_id, nutrientId: 1082, amount: '1' },
        ],
      ),
    ).toContain('no informa fibra (1079)')
  })

  it('does not take the nutrients of another food', () => {
    expect(
      buildError([banana], amounts(rice.fdc_id, '28.17', '0.4')),
    ).toContain('173944: no informa HC totales (1005)')
  })

  it('returns an empty list for an empty selection', () => {
    expect(buildRows([], foods, [])).toEqual([])
  })

  it('accepts a total of exactly 100', () => {
    const [row] = buildRows([banana], foods, amounts(banana.fdc_id, '100', '0'))
    expect(row?.carbsPer100g).toBe(100)
  })

  it('lists the problems of every food at once', () => {
    const error = buildError(
      [{ ...banana, usda_description: 'x' }, rice],
      amounts(rice.fdc_id, '28.17', null),
    )
    expect(error).toContain('Hay 2 problema(s)')
    expect(error).toContain('173944: la descripción no coincide')
    expect(error).toContain('168878: no informa fibra (1079)')
  })
})

describe('toSeedSql', () => {
  const rows: SeedRow[] = [
    {
      referenceCode: '171688',
      descriptionOriginal:
        "Apples, raw, with skin (Includes foods for USDA's Food Distribution Program)",
      nameEs: 'Manzana con cáscara',
      state: 'as_eaten',
      carbsPer100g: 11.41,
      totalCarbsPer100g: 13.81,
      fiberPer100g: 2.4,
    },
    {
      referenceCode: '168878',
      descriptionOriginal: 'Rice, white, "long-grain", cooked',
      nameEs: 'Ñoqui, piña y jamón',
      state: 'as_eaten',
      carbsPer100g: 0.19999999999999998,
      totalCarbsPer100g: 0.3,
      fiberPer100g: 0,
    },
  ]

  it('writes the whole migration', () => {
    expect(toSeedSql(rows)).toBe(
      `-- USDA FoodData Central seed for reference_foods (spec §5.2, §7.1, §14 #50).
-- Generated by scripts/usda-seed/build.ts from scripts/usda-seed/selection.json
-- and SR Legacy (April 2018, CSV). Do not edit: change the selection and
-- generate a new migration (CLAUDE.md, rule 6).
-- Source: U.S. Department of Agriculture, Agricultural Research Service,
-- Beltsville Human Nutrition Research Center. FoodData Central. CC0 1.0.
delete from public.reference_foods where reference_db = 'usda_fdc';
insert into public.reference_foods
  (reference_db, reference_code, description_original, name_es, state,
   carbs_per_100g, total_carbs_per_100g, fiber_per_100g)
values
  ('usda_fdc', '171688', 'Apples, raw, with skin (Includes foods for USDA''s Food Distribution Program)', 'Manzana con cáscara', 'as_eaten', 11.41, 13.81, 2.4),
  ('usda_fdc', '168878', 'Rice, white, "long-grain", cooked', 'Ñoqui, piña y jamón', 'as_eaten', 0.19999999999999998, 0.3, 0);
`,
    )
  })

  it('escapes apostrophes in the name too', () => {
    expect(toSeedSql([{ ...rows[1]!, nameEs: "D'Ana" }])).toContain("'D''Ana'")
  })

  it('doubles every apostrophe in every text field', () => {
    const sql = toSeedSql([
      {
        ...rows[0]!,
        referenceCode: "1'2",
        descriptionOriginal: "''x'",
        nameEs: "'",
      },
    ])
    expect(sql).toContain(
      "  ('usda_fdc', '1''2', '''''x''', '''', 'as_eaten', 11.41, 13.81, 2.4);",
    )
  })

  it('leaves backslashes as they are (standard SQL strings)', () => {
    expect(
      toSeedSql([{ ...rows[0]!, descriptionOriginal: 'a\\b\\' }]),
    ).toContain(", 'a\\b\\', ")
  })

  it('writes small and large numbers the way JavaScript prints them', () => {
    // Postgres reads 1e-7 as a numeric constant; no real value needs it.
    const sql = toSeedSql([
      {
        ...rows[0]!,
        carbsPer100g: 1e-7,
        totalCarbsPer100g: 100,
        fiberPer100g: -0,
      },
    ])
    expect(sql).toContain("'as_eaten', 1e-7, 100, 0);")
  })

  it.each([Infinity, -Infinity])('fails with %s', (value) => {
    expect(() => toSeedSql([{ ...rows[0]!, fiberPer100g: value }])).toThrow(
      'número inválido',
    )
    expect(() =>
      toSeedSql([{ ...rows[0]!, totalCarbsPer100g: value }]),
    ).toThrow('número inválido')
  })

  it('deletes the previous USDA rows before inserting', () => {
    const sql = toSeedSql(rows)
    const del = sql.indexOf(
      "delete from public.reference_foods where reference_db = 'usda_fdc';",
    )
    expect(del).toBeGreaterThan(-1)
    expect(del).toBeLessThan(sql.indexOf('insert into public.reference_foods'))
  })

  it('uses LF line endings and ends with a newline', () => {
    const sql = toSeedSql(rows)
    expect(sql).not.toContain('\r')
    expect(sql.endsWith(');\n')).toBe(true)
  })

  it('fails with no rows', () => {
    expect(() => toSeedSql([])).toThrow('No hay filas')
  })

  it('fails with a number that SQL would not read', () => {
    expect(() => toSeedSql([{ ...rows[0]!, carbsPer100g: NaN }])).toThrow(
      'número inválido',
    )
  })
})

// --- Real files of the repo (they run in CI without the USDA download) ------

const seedDir = import.meta.dirname
const migrationsDir = path.join(seedDir, '..', '..', 'supabase', 'migrations')
const selection = parseSelection(
  JSON.parse(readFileSync(path.join(seedDir, 'selection.json'), 'utf8')),
)

describe('selection.json', () => {
  it('is valid and has between 150 and 300 foods', () => {
    expect(selection.length).toBeGreaterThanOrEqual(150)
    expect(selection.length).toBeLessThanOrEqual(300)
  })

  it.each([
    'Banana',
    'Manzana con cáscara',
    'Papa hervida sin cáscara',
    'Puré de papas',
    'Tapa de tarta horneada',
    'Arroz blanco hervido',
    'Arroz integral hervido',
    'Arroz parboil hervido',
    'Fideos hervidos',
    'Fideos integrales hervidos',
    'Polenta cocida',
    'Lentejas hervidas',
    'Garbanzos hervidos',
  ])('has %j', (name) => {
    expect(selection.map((entry) => entry.name_es)).toContain(name)
  })
})

describe('the latest USDA seed migration', () => {
  const file = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('_reference_foods_usda_seed.sql'))
    .toSorted()
    .at(-1)
  const sql = file ? readFileSync(path.join(migrationsDir, file), 'utf8') : ''
  const text = String.raw`'((?:[^']|'')*)'`
  const rowPattern = new RegExp(
    String.raw`^  \('usda_fdc', '(\d+)', ${text}, ${text}, 'as_eaten', ([^,]+), ([^,]+), ([^,)]+)\)[,;]$`,
    'gm',
  )
  const rows = [...sql.matchAll(rowPattern)].map((match) => ({
    code: match[1],
    description: match[2]?.replaceAll("''", "'"),
    name: match[3]?.replaceAll("''", "'"),
    carbs: Number(match[4]),
    total: Number(match[5]),
    fiber: Number(match[6]),
  }))

  it('exists', () => {
    expect(file).toBeDefined()
  })

  it('has exactly the foods of selection.json, in order', () => {
    expect(rows.map((row) => [row.code, row.description, row.name])).toEqual(
      selection.map((entry) => [
        String(entry.fdc_id),
        entry.usda_description,
        entry.name_es,
      ]),
    )
  })

  it('has one row line per food and ends with the statement', () => {
    expect(sql.match(/^ {2}\('usda_fdc'/gm)?.length).toBe(selection.length)
    expect(sql.trimEnd().endsWith(');')).toBe(true)
  })

  it('stores carbs as total minus fiber, with domain/dose', () => {
    for (const row of rows) {
      expect(row.carbs).toBe(carbsWithoutFiber(row.total, row.fiber))
    }
  })
})

// --- build.ts end to end, with CSV files rebuilt from the migration ---------
// The real USDA download is not in the repo, so the CSV files are generated
// from selection.json and the amounts stored in the migration. build.ts has
// to give back the migration byte for byte.

describe('build.ts', () => {
  const migrationFile = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('_reference_foods_usda_seed.sql'))
    .toSorted()
    .at(-1)
  const migration = migrationFile
    ? readFileSync(path.join(migrationsDir, migrationFile))
    : Buffer.alloc(0)
  const amountsByCode = new Map(
    [
      ...migration
        .toString('utf8')
        .matchAll(
          /^ {2}\('usda_fdc', '(\d+)', .*, ([^,]+), ([^,]+), ([^,)]+)\)[,;]$/gm,
        ),
    ].map((m) => [m[1], { total: m[3] ?? '', fiber: m[4] ?? '' }]),
  )
  const csvText = (value: string) => `"${value.replaceAll('"', '""')}"`
  const csvLine = (fields: (string | number)[]) =>
    fields.map((f) => csvText(String(f))).join(',')

  function writeCsvs(dir: string, eol: string, bom: boolean, fiberId = 1079) {
    const file = (name: string, lines: string[]) =>
      writeFileSync(
        path.join(dir, name),
        (bom ? '\uFEFF' : '') + lines.join(eol) + eol,
        'utf8',
      )
    file('nutrient.csv', [
      csvLine(['id', 'name', 'unit_name', 'nutrient_nbr', 'rank']),
      csvLine([1003, 'Protein', 'G', '203', '600']),
      csvLine([1005, 'Carbohydrate, by difference', 'G', '205', '1110']),
      csvLine([1079, 'Fiber, total dietary', 'G', '291', '1200']),
    ])
    file('food.csv', [
      csvLine(['fdc_id', 'data_type', 'description', 'food_category_id']),
      csvLine([1, 'sr_legacy_food', 'Not selected, raw', '9']),
      ...selection.map((e) =>
        csvLine([e.fdc_id, 'sr_legacy_food', e.usda_description, '9']),
      ),
    ])
    let id = 1
    file('food_nutrient.csv', [
      csvLine(['id', 'fdc_id', 'nutrient_id', 'amount', 'data_points']),
      csvLine([id++, 1, 1005, '50', '1']),
      ...selection.flatMap((e) => {
        const a = amountsByCode.get(String(e.fdc_id))
        return [
          csvLine([id++, e.fdc_id, 1003, '1.5', '1']),
          csvLine([id++, e.fdc_id, 1005, a?.total ?? '', '1']),
          csvLine([id++, e.fdc_id, fiberId, a?.fiber ?? '', '1']),
        ]
      }),
    ])
  }

  const buildScript = path.join(seedDir, 'build.ts')
  const run = (csvDir: string, output: string) =>
    spawnSync(process.execPath, [buildScript, csvDir, output], {
      encoding: 'utf8',
    })

  let tmp = ''
  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'usda-seed-'))
  })
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('has the amounts of every selected food in the migration', () => {
    expect(amountsByCode.size).toBe(selection.length)
  })

  it.each([
    ['LF', '\n', false],
    ['CRLF with BOM', '\r\n', true],
  ])('regenerates the migration byte for byte from %s files', (_, eol, bom) => {
    writeCsvs(tmp, eol, bom)
    const output = path.join(tmp, 'out.sql')
    const result = run(tmp, output)
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(readFileSync(output).equals(migration)).toBe(true)
  })

  it('writes into an existing empty file (a new migration)', () => {
    writeCsvs(tmp, '\n', false)
    const output = path.join(tmp, 'new.sql')
    writeFileSync(output, '')
    expect(run(tmp, output).status).toBe(0)
    expect(readFileSync(output).equals(migration)).toBe(true)
  })

  it('refuses to overwrite a file with content', () => {
    writeCsvs(tmp, '\n', false)
    const output = path.join(tmp, 'applied.sql')
    writeFileSync(output, 'select 1;\n')
    const result = run(tmp, output)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('ya existe y no está vacío')
    expect(readFileSync(output, 'utf8')).toBe('select 1;\n')
  })

  it('fails, without writing, when a nutrient is missing', () => {
    writeCsvs(tmp, '\n', false, 1082)
    const output = path.join(tmp, 'out.sql')
    const result = run(tmp, output)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('no informa fibra (1079)')
    expect(existsSync(output)).toBe(false)
  })

  it('fails without arguments', () => {
    const result = spawnSync(process.execPath, [buildScript], {
      encoding: 'utf8',
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Uso:')
  })
})
