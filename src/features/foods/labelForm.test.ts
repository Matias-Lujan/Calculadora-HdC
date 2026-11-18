import { describe, expect, it } from 'vitest'
import {
  carbsLine,
  chooseColumn,
  energyWarning,
  fieldNote,
  initialLabelFormTexts,
  labelNumberText,
  needsFiberWarning,
  toNewLabelFood,
  unitOffer,
  validateLabelForm,
  type LabelFormTexts,
} from './labelForm.ts'
import type {
  TranscribedField,
  Transcription,
  TranscriptionColumn,
} from './transcription.ts'
import { transcriptionSchema } from './transcription.ts'

// Invented label data (CLAUDE.md rule 5).

const legible = (text: string): TranscribedField => ({
  status: 'legible',
  text,
})
const illegible: TranscribedField = { status: 'illegible', text: null }
const absent: TranscribedField = { status: 'not_present', text: null }

const perPortion: TranscriptionColumn = {
  basis: 'per_portion',
  header_text: 'Porción',
  state: 'as_sold',
  state_text: null,
  portion_size_g: legible('50 g'),
  portion_description: legible('1 alfajor'),
  carbohydrates_g: legible('38'),
  energy: legible('190 kcal = 798 kJ'),
}

const per100g: TranscriptionColumn = {
  basis: 'per_100g',
  header_text: '100 g',
  state: 'as_sold',
  state_text: null,
  portion_size_g: absent,
  portion_description: absent,
  carbohydrates_g: legible('78,3'),
  energy: legible('390 kcal = 1638 kJ'),
}

function label(overrides: Partial<Transcription> = {}): Transcription {
  return transcriptionSchema.parse({
    is_nutrition_label: true,
    product_name: legible('Alfajor de prueba'),
    brand: legible('Marca Inventada'),
    carbohydrate_row_label: legible('Carbohidratos'),
    columns: [perPortion],
    observations: null,
    ...overrides,
  })
}

/** The texts of a valid food from `transcription`, as eaten. */
function filled(transcription: Transcription | null): LabelFormTexts {
  return { ...initialLabelFormTexts(transcription), state: 'as_eaten' }
}

describe('initialLabelFormTexts', () => {
  it('con una columna, la elige y carga nombre, marca, porción y HC', () => {
    expect(initialLabelFormTexts(label())).toMatchObject({
      name: 'Alfajor de prueba',
      brand: 'Marca Inventada',
      state: null,
      column: 0,
      basis: 'per_portion',
      portion: '50',
      labelCarbs: '38',
      fiber: '',
    })
  })

  it('con dos columnas no elige ninguna, y guardar pide la columna', () => {
    const transcription = label({ columns: [per100g, perPortion] })
    const texts = initialLabelFormTexts(transcription)
    expect(texts).toMatchObject({
      column: null,
      basis: null,
      portion: '',
      labelCarbs: '',
    })
    const result = validateLabelForm(
      { ...texts, state: 'as_eaten' },
      transcription,
    )
    expect(result.values).toBeNull()
    expect(result.errors.column).toBe('COLUMN_REQUIRED')
    expect(result.errors.basis).toBeUndefined()
  })

  it('sin columnas, no elige ninguna y pregunta la base', () => {
    const transcription = label({ columns: [] })
    const texts = filled(transcription)
    expect(texts.column).toBeNull()
    expect(validateLabelForm(texts, transcription).errors).toEqual({
      basis: 'BASIS_REQUIRED',
    })
  })

  it('un nombre o una marca que no se leen quedan vacíos', () => {
    const texts = initialLabelFormTexts(
      label({ product_name: illegible, brand: absent }),
    )
    expect(texts.name).toBe('')
    expect(texts.brand).toBe('')
  })

  it('cargado a mano, todo vacío y sin base', () => {
    const texts = initialLabelFormTexts(null)
    expect(texts).toEqual({
      name: '',
      brand: '',
      state: null,
      rawWeight: '',
      cookedWeight: '',
      unitWeight: '',
      unitLabel: '',
      notes: '',
      column: null,
      basis: null,
      portion: '',
      labelCarbs: '',
      fiber: '',
    })
  })
})

describe('chooseColumn', () => {
  it('una columna cada 100 g carga la base y los HC', () => {
    expect(chooseColumn(per100g, 1)).toEqual({
      column: 1,
      basis: 'per_100g',
      portion: '',
      labelCarbs: '78,3',
      fiber: '',
    })
  })

  it('una columna por porción carga la porción y los HC', () => {
    expect(chooseColumn(perPortion, 0)).toEqual({
      column: 0,
      basis: 'per_portion',
      portion: '50',
      labelCarbs: '38',
      fiber: '',
    })
  })

  it('una columna sin base conocida deja la base sin elegir (y se pide)', () => {
    const unknown: TranscriptionColumn = { ...perPortion, basis: 'unknown' }
    const transcription = label({ columns: [unknown] })
    const texts = filled(transcription)
    expect(texts.basis).toBeNull()
    expect(texts.portion).toBe('50')
    expect(validateLabelForm(texts, transcription).errors.basis).toBe(
      'BASIS_REQUIRED',
    )
  })

  it('cambiar de columna pisa lo escrito y vacía la fibra', () => {
    const texts: LabelFormTexts = {
      ...filled(label()),
      portion: '99',
      labelCarbs: '1',
      fiber: '2',
    }
    const next = { ...texts, ...chooseColumn(per100g, 1) }
    expect(next).toMatchObject({
      column: 1,
      basis: 'per_100g',
      labelCarbs: '78,3',
      fiber: '',
    })
  })
})

describe('labelNumberText y fieldNote', () => {
  it.each([
    [illegible, ''],
    [absent, ''],
    [legible('<0,5'), ''],
    [legible('1.234'), ''],
    [legible('12,5 g'), '12,5'],
    [legible('1.234,5'), '1.234,5'],
    [legible('0'), '0'],
  ])('%o arranca con "%s"', (field, expected) => {
    expect(labelNumberText(field)).toBe(expected)
  })

  it('la nota dice el texto original o por qué quedó vacío', () => {
    expect(fieldNote(legible('50 g'))).toBe('En la etiqueta: "50 g"')
    expect(fieldNote(legible('<0,5'))).toBe(
      'En la etiqueta dice "<0,5". Completalo vos.',
    )
    expect(fieldNote(illegible)).toBe('No se lee en la foto. Completalo vos.')
    expect(fieldNote(absent)).toBe('La etiqueta no lo trae. Completalo vos.')
  })
})

describe('validateLabelForm', () => {
  it('por porción, 38 g en 50 g se guardan como exactamente 76', () => {
    const result = validateLabelForm(filled(label()), label())
    expect(result.errors).toEqual({})
    expect(result.values).toEqual({
      name: 'Alfajor de prueba',
      brand: 'Marca Inventada',
      state: 'as_eaten',
      carbs_per_100g: 76,
      cooking_factor: null,
      unit_weight_g: null,
      unit_label: null,
      notes: null,
    })
  })

  it('cada 100 g, los HC se guardan tal cual', () => {
    const transcription = label({ columns: [per100g] })
    const result = validateLabelForm(filled(transcription), transcription)
    expect(result.values?.carbs_per_100g).toBe(78.3)
  })

  it('HC mayores que la porción marcan los HC', () => {
    const texts = { ...filled(label()), labelCarbs: '51' }
    const result = validateLabelForm(texts, label())
    expect(result.values).toBeNull()
    expect(result.errors).toEqual({ labelCarbs: 'CARBS_EXCEED_PORTION' })
  })

  it('cada 100 g, más de 100 marca los HC', () => {
    const transcription = label({ columns: [per100g] })
    const texts = { ...filled(transcription), labelCarbs: '100,1' }
    expect(validateLabelForm(texts, transcription).errors).toEqual({
      labelCarbs: 'ABOVE_100',
    })
    const edge = { ...filled(transcription), labelCarbs: '100' }
    expect(validateLabelForm(edge, transcription).values?.carbs_per_100g).toBe(
      100,
    )
  })

  it('porción y HC vacíos (ilegibles) se piden; la porción 0 no vale', () => {
    const transcription = label({
      columns: [
        { ...perPortion, portion_size_g: illegible, carbohydrates_g: absent },
      ],
    })
    const texts = filled(transcription)
    expect(validateLabelForm(texts, transcription).errors).toEqual({
      portion: 'REQUIRED',
      labelCarbs: 'REQUIRED',
    })
    const zero = { ...texts, portion: '0', labelCarbs: '0' }
    expect(validateLabelForm(zero, transcription).errors).toEqual({
      portion: 'NOT_POSITIVE',
    })
  })

  it('HC 0 es válido', () => {
    const texts = { ...filled(label()), labelCarbs: '0' }
    expect(validateLabelForm(texts, label()).values?.carbs_per_100g).toBe(0)
  })

  it('una fibra escrita sin el aviso no se valida ni se resta', () => {
    expect(needsFiberWarning(label())).toBe(false)
    const texts = { ...filled(label()), fiber: 'abc' }
    const result = validateLabelForm(texts, label())
    expect(result.errors).toEqual({})
    expect(result.values?.carbs_per_100g).toBe(76)
  })

  it('con el aviso de fibra, la fibra se resta antes de pasar a 100 g', () => {
    const transcription = label({
      carbohydrate_row_label: legible('Total Carbohydrate'),
    })
    expect(needsFiberWarning(transcription)).toBe(true)
    const texts = { ...filled(transcription), fiber: '3' }
    expect(validateLabelForm(texts, transcription).values?.carbs_per_100g).toBe(
      ((38 - 3) / 50) * 100,
    )
    const tooMuch = { ...texts, fiber: '39' }
    expect(validateLabelForm(tooMuch, transcription).errors).toEqual({
      fiber: 'FIBER_EXCEEDS_CARBS',
    })
    const invalid = { ...texts, fiber: '3,' }
    expect(validateLabelForm(invalid, transcription).errors).toEqual({
      fiber: 'INVALID_NUMBER',
    })
    const empty = { ...texts, fiber: '' }
    expect(validateLabelForm(empty, transcription).values?.carbs_per_100g).toBe(
      76,
    )
  })

  it('"Carbohidratos, de los cuales:" (formato nuevo) no muestra el aviso', () => {
    const transcription = label({
      carbohydrate_row_label: legible('Carbohidratos, de los cuales:'),
    })
    expect(needsFiberWarning(transcription)).toBe(false)
  })

  it('un rótulo ilegible o ausente no muestra el aviso', () => {
    expect(
      needsFiberWarning(label({ carbohydrate_row_label: illegible })),
    ).toBe(false)
    expect(needsFiberWarning(label({ carbohydrate_row_label: absent }))).toBe(
      false,
    )
    expect(needsFiberWarning(null)).toBe(false)
  })

  it('"¿Se cocina antes de comer?" y el nombre son obligatorios', () => {
    const texts = { ...initialLabelFormTexts(label()), name: '  ' }
    expect(validateLabelForm(texts, label()).errors).toEqual({
      name: 'NAME_REQUIRED',
      state: 'STATE_REQUIRED',
    })
  })

  it('cargado a mano: pide la base, y por porción valida igual', () => {
    const texts = filled(null)
    expect(validateLabelForm(texts, null).errors).toMatchObject({
      basis: 'BASIS_REQUIRED',
      name: 'NAME_REQUIRED',
    })
    const typed: LabelFormTexts = {
      ...texts,
      name: 'Galletitas de prueba',
      basis: 'per_portion',
      portion: '30',
      labelCarbs: '20',
    }
    const result = validateLabelForm(typed, null)
    expect(result.values?.carbs_per_100g).toBe((20 / 30) * 100)
  })

  it('con dos columnas, guarda la elegida y no la otra', () => {
    const transcription = label({ columns: [per100g, perPortion] })
    const texts = {
      ...filled(transcription),
      ...chooseColumn(perPortion, 1),
    }
    const result = validateLabelForm(texts, transcription)
    expect(result.errors).toEqual({})
    expect(result.values?.carbs_per_100g).toBe(76)
  })

  it('pasar a cada 100 g ignora la porción que quedó escrita', () => {
    const texts: LabelFormTexts = {
      ...filled(label()),
      basis: 'per_100g',
      portion: '0',
    }
    const result = validateLabelForm(texts, label())
    expect(result.errors).toEqual({})
    expect(result.values?.carbs_per_100g).toBe(38)
  })

  it('cada 100 g con el aviso, la fibra se resta sin dividir', () => {
    const transcription = label({
      carbohydrate_row_label: legible('Total Carbohydrate'),
      columns: [{ ...per100g, carbohydrates_g: legible('78') }],
    })
    const texts = { ...filled(transcription), fiber: '3' }
    expect(validateLabelForm(texts, transcription).values?.carbs_per_100g).toBe(
      75,
    )
  })

  it('un producto que se cocina se guarda sin cuánto rinde', () => {
    const texts: LabelFormTexts = { ...filled(label()), state: 'raw_cooked' }
    const result = validateLabelForm(texts, label())
    expect(result.values).toMatchObject({
      state: 'raw_cooked',
      cooking_factor: null,
      carbs_per_100g: 76,
    })
  })
})

describe('carbsLine', () => {
  const fiberLabel = label({
    carbohydrate_row_label: legible('Total Carbohydrate'),
  })

  it('por porción muestra la cuenta', () => {
    expect(carbsLine(filled(label()), label())).toBe(
      '38 × 100 ÷ 50 = 76,0 g de HC cada 100 g',
    )
  })

  it('con fibra, la resta entre paréntesis; en crudo, lo dice', () => {
    const texts = { ...filled(fiberLabel), fiber: '3' }
    expect(carbsLine(texts, fiberLabel)).toBe(
      '(38 − 3) × 100 ÷ 50 = 70,0 g de HC cada 100 g',
    )
    expect(carbsLine({ ...texts, state: 'raw_cooked' }, fiberLabel)).toBe(
      '(38 − 3) × 100 ÷ 50 = 70,0 g de HC cada 100 g en crudo',
    )
  })

  it('cada 100 g: solo con fibra', () => {
    const texts: LabelFormTexts = {
      ...filled(fiberLabel),
      basis: 'per_100g',
      labelCarbs: '78',
    }
    expect(carbsLine(texts, fiberLabel)).toBeNull()
    expect(carbsLine({ ...texts, fiber: '3' }, fiberLabel)).toBe(
      '78 − 3 = 75,0 g de HC cada 100 g',
    )
  })

  it('sin números válidos no hay línea', () => {
    expect(carbsLine({ ...filled(label()), portion: '' }, label())).toBeNull()
    expect(carbsLine({ ...filled(label()), labelCarbs: '51' }, label())).toBe(
      null,
    )
  })
})

describe('energyWarning', () => {
  // 30 g of carbs in a column of 107 kcal: a decimal comma lost ("3,0").
  const lostComma: TranscriptionColumn = {
    ...perPortion,
    portion_size_g: legible('60 g'),
    carbohydrates_g: legible('30 g'),
    energy: legible('107 kcal = 449 kJ'),
  }
  const withEnergy = (energy: TranscribedField) =>
    label({ columns: [{ ...lostComma, energy }] })

  it('avisa con la energía como está impresa y los HC como están en el campo', () => {
    const transcription = label({ columns: [lostComma] })
    const warning = energyWarning(filled(transcription), transcription)
    expect(warning).toContain('"107 kcal = 449 kJ"')
    expect(warning).toContain('30 g de HC')
  })

  it('con los HC bien leídos no avisa', () => {
    const transcription = label({ columns: [lostComma] })
    expect(
      energyWarning(
        { ...filled(transcription), labelCarbs: '3' },
        transcription,
      ),
    ).toBeNull()
  })

  it.each([
    ['ilegible', illegible],
    ['ausente', absent],
    ['solo en kJ', legible('449 kJ')],
  ])('sin calorías (%s) no avisa', (_, energy) => {
    const transcription = withEnergy(energy)
    expect(energyWarning(filled(transcription), transcription)).toBeNull()
  })

  it('cargado a mano no avisa', () => {
    expect(
      energyWarning(
        { ...filled(null), basis: 'per_portion', labelCarbs: '30' },
        null,
      ),
    ).toBeNull()
  })

  describe('con dos columnas', () => {
    const per100gColumn: TranscriptionColumn = {
      ...per100g,
      carbohydrates_g: legible('40'),
      energy: legible('178 kcal'),
    }
    const transcription = label({ columns: [lostComma, per100gColumn] })

    it('sin columna elegida no avisa', () => {
      expect(energyWarning(filled(transcription), transcription)).toBeNull()
    })

    it('la de 100 g se compara con sus propias calorías', () => {
      const texts = {
        ...filled(transcription),
        ...chooseColumn(per100gColumn, 1),
      }
      // 40 g give 160 kcal: within 178, though above the portion's 107.
      expect(energyWarning(texts, transcription)).toBeNull()
      const warning = energyWarning(
        { ...texts, labelCarbs: '50' },
        transcription,
      )
      expect(warning).toContain('"178 kcal"')
      expect(warning).toContain('50 g de HC')
    })
  })

  it('con el aviso de fibra, la fibra cargada se resta; sin el aviso, se ignora', () => {
    const fiberLabel = label({
      carbohydrate_row_label: legible('Total Carbohydrate'),
      columns: [lostComma],
    })
    const mercosur = label({ columns: [lostComma] })
    expect(
      energyWarning({ ...filled(fiberLabel), fiber: '10' }, fiberLabel),
    ).toBeNull()
    expect(
      energyWarning({ ...filled(fiberLabel), fiber: '' }, fiberLabel),
    ).not.toBeNull()
    expect(
      energyWarning({ ...filled(mercosur), fiber: '10' }, mercosur),
    ).not.toBeNull()
  })

  it('con HC vacíos o no válidos, o fibra no válida, no avisa', () => {
    const transcription = label({ columns: [lostComma] })
    const fiberLabel = label({
      carbohydrate_row_label: legible('Total Carbohydrate'),
      columns: [lostComma],
    })
    for (const labelCarbs of ['', '-30', 'abc']) {
      expect(
        energyWarning({ ...filled(transcription), labelCarbs }, transcription),
      ).toBeNull()
    }
    expect(
      energyWarning({ ...filled(fiberLabel), fiber: 'abc' }, fiberLabel),
    ).toBeNull()
  })
})

describe('unitOffer', () => {
  it('por porción, "1 alfajor", tal como se come y con porción válida', () => {
    expect(unitOffer(filled(label()), label())).toEqual({
      weightText: '50',
      label: 'alfajor',
    })
  })

  it('no se ofrece en otros casos', () => {
    const texts = filled(label())
    expect(unitOffer({ ...texts, state: 'raw_cooked' }, label())).toBeNull()
    expect(unitOffer({ ...texts, state: null }, label())).toBeNull()
    expect(unitOffer({ ...texts, portion: '' }, label())).toBeNull()
    expect(unitOffer({ ...texts, basis: 'per_100g' }, label())).toBeNull()
    const two = label({
      columns: [{ ...perPortion, portion_description: legible('2 alfajores') }],
    })
    expect(unitOffer(filled(two), two)).toBeNull()
    const unread = label({
      columns: [{ ...perPortion, portion_description: illegible }],
    })
    expect(unitOffer(filled(unread), unread)).toBeNull()
    expect(unitOffer({ ...filled(null), basis: 'per_portion' }, null)).toBe(
      null,
    )
  })

  it('una vez copiada, deja de ofrecerse', () => {
    const texts = { ...filled(label()), unitWeight: '50', unitLabel: 'alfajor' }
    expect(unitOffer(texts, label())).toBeNull()
  })
})

describe('toNewLabelFood', () => {
  it('guarda source label, la foto y la transcripción original tal cual', () => {
    const transcription = label()
    const texts = { ...filled(transcription), name: 'Otro nombre' }
    const values = validateLabelForm(texts, transcription).values
    if (values === null) throw new Error('invalid')
    const row = toNewLabelFood(values, 'user/photo.jpg', transcription)
    expect(row).toEqual({
      ...values,
      source: 'label',
      photo_path: 'user/photo.jpg',
      label_transcription: transcription,
    })
    if (row.source !== 'label') throw new Error('not a label')
    expect(row.label_transcription).toBe(transcription)
    expect(row.name).toBe('Otro nombre')
    for (const column of [
      'reference_db',
      'reference_code',
      'reference_description',
      'user_id',
    ]) {
      expect(row).not.toHaveProperty(column)
    }
  })

  it('cargado a mano, la transcripción va null', () => {
    const typed: LabelFormTexts = {
      ...filled(null),
      name: 'Galletitas de prueba',
      basis: 'per_100g',
      labelCarbs: '68,4',
    }
    const values = validateLabelForm(typed, null).values
    if (values === null) throw new Error('invalid')
    expect(toNewLabelFood(values, 'user/photo.jpg', null)).toMatchObject({
      source: 'label',
      photo_path: 'user/photo.jpg',
      label_transcription: null,
      carbs_per_100g: 68.4,
    })
  })
})
