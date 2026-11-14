import { describe, expect, it } from 'vitest'
import { normalizeForSearch, searchFoods } from './search.ts'

type Item = { name: string; brand: string | null }

const food = (name: string, brand: string | null = null): Item => ({
  name,
  brand,
})

const names = (items: readonly Item[]) =>
  items.map((item) =>
    item.brand === null ? item.name : `${item.name} / ${item.brand}`,
  )

describe('normalizeForSearch', () => {
  it('pasa a minúsculas y quita tildes y diéresis', () => {
    expect(normalizeForSearch('Café Piña Pingüino ÁRBOL')).toBe(
      'cafe pina pinguino arbol',
    )
  })

  it('normaliza también la forma ya compuesta y la descompuesta', () => {
    expect(normalizeForSearch('Café')).toBe('cafe')
    expect(normalizeForSearch('Café')).toBe('cafe')
  })
})

describe('searchFoods', () => {
  const catalog = [
    food('Banana'),
    food('Arroz', 'Gallo'),
    food('Café', 'La Virginia'),
    food('Piña'),
    food('Alfajor', 'Havanna'),
    food('Leche 50% grasa'),
  ]

  it.each(['', '   ', ' ', ' \t\n '])(
    'consulta vacía (%j) → todos ordenados',
    (query) => {
      expect(names(searchFoods(catalog, query))).toEqual([
        'Alfajor / Havanna',
        'Arroz / Gallo',
        'Banana',
        'Café / La Virginia',
        'Leche 50% grasa',
        'Piña',
      ])
    },
  )

  it('no distingue mayúsculas', () => {
    expect(names(searchFoods([food('arroz')], 'ARROZ'))).toEqual(['arroz'])
    expect(names(searchFoods([food('ARROZ')], 'arroz'))).toEqual(['ARROZ'])
    expect(names(searchFoods(catalog, 'arroz'))).toEqual(['Arroz / Gallo'])
  })

  it('no distingue tildes, en ningún sentido', () => {
    expect(names(searchFoods([food('Café')], 'cafe'))).toEqual(['Café'])
    expect(names(searchFoods([food('Cafe')], 'café'))).toEqual(['Cafe'])
    expect(names(searchFoods([food('Café')], 'café'))).toEqual(['Café'])
    expect(names(searchFoods([food('Piña')], 'pina'))).toEqual(['Piña'])
    expect(names(searchFoods([food('Pina')], 'piña'))).toEqual(['Pina'])
  })

  it('busca también en la marca', () => {
    expect(names(searchFoods(catalog, 'gallo'))).toEqual(['Arroz / Gallo'])
  })

  it('una marca null no rompe la búsqueda', () => {
    expect(names(searchFoods([food('Banana', null)], 'banana'))).toEqual([
      'Banana',
    ])
    expect(searchFoods([food('Banana', null)], 'null')).toEqual([])
  })

  it.each([
    'havanna alfajor',
    'alfajor havanna',
    '  alfajor   havanna  ',
    'alfajor\thavanna',
  ])('varios términos en cualquier orden (%j)', (query) => {
    expect(names(searchFoods(catalog, query))).toEqual(['Alfajor / Havanna'])
  })

  it('todos los términos tienen que aparecer', () => {
    expect(searchFoods(catalog, 'alfajor jorgito')).toEqual([])
  })

  it('un término no cruza de nombre a marca', () => {
    expect(searchFoods([food('Alfa', 'Jor')], 'alfajor')).toEqual([])
    expect(searchFoods([food('Alfa', 'Jor')], 'alfa jor')).toHaveLength(1)
  })

  it('trata los caracteres especiales como texto literal', () => {
    expect(names(searchFoods(catalog, '50%'))).toEqual(['Leche 50% grasa'])
    for (const query of ['(', '.', '*', '[', '\\', '_', ',']) {
      expect(() => searchFoods(catalog, query)).not.toThrow()
    }
    expect(searchFoods(catalog, '.')).toEqual([])
    expect(searchFoods(catalog, '*')).toEqual([])
  })

  it('ordena alfabéticamente en español, sin distinguir mayúsculas', () => {
    expect(
      names(
        searchFoods(
          [food('Ñoquis'), food('Banana'), food('arroz'), food('Nuez')],
          '',
        ),
      ),
    ).toEqual(['arroz', 'Banana', 'Nuez', 'Ñoquis'])
  })

  it('las tildes no mueven el orden', () => {
    expect(
      names(searchFoods([food('Ajo'), food('Ácelga'), food('Acai')], '')),
    ).toEqual(['Acai', 'Ácelga', 'Ajo'])
  })

  it('con el mismo nombre, primero sin marca y después por marca', () => {
    expect(
      names(
        searchFoods(
          [
            food('Arroz', 'Molinos'),
            food('Arroz', 'Gallo'),
            food('Arroz', null),
            food('arroz', 'Dos Hermanos'),
          ],
          '',
        ),
      ),
    ).toEqual([
      'Arroz',
      'arroz / Dos Hermanos',
      'Arroz / Gallo',
      'Arroz / Molinos',
    ])
  })

  it('no muta la entrada', () => {
    const input = [food('Banana'), food('Arroz')]
    const copy = [...input]
    searchFoods(input, '')
    searchFoods(input, 'a')
    expect(input).toEqual(copy)
  })

  it('devuelve un arreglo nuevo aunque no filtre', () => {
    const input = [food('Arroz')]
    expect(searchFoods(input, '')).not.toBe(input)
  })

  it('catálogo vacío → vacío', () => {
    expect(searchFoods([], '')).toEqual([])
    expect(searchFoods([], 'arroz')).toEqual([])
  })

  it('conserva las demás propiedades del alimento', () => {
    const input = [{ id: 'a', name: 'Arroz', brand: null }]
    expect(searchFoods(input, 'arroz')[0]).toBe(input[0])
  })
})

describe('searchFoods: bordes', () => {
  it('encuentra un fragmento en el medio de la palabra', () => {
    expect(names(searchFoods([food('Arroz')], 'rro'))).toEqual(['Arroz'])
  })

  it('normaliza también la consulta en mayúsculas con tilde y ñ', () => {
    expect(names(searchFoods([food('cafe')], 'CAFÉ'))).toEqual(['cafe'])
    expect(names(searchFoods([food('Ñoquis')], 'noquis'))).toEqual(['Ñoquis'])
    expect(names(searchFoods([food('noquis')], 'ÑOQUIS'))).toEqual(['noquis'])
  })

  it('normaliza la consulta en forma descompuesta', () => {
    expect(names(searchFoods([food('Café')], 'Café'))).toEqual(['Café'])
  })

  it('no distingue tildes en la marca', () => {
    expect(names(searchFoods([food('Yerba', 'Pájaro')], 'pajaro'))).toEqual([
      'Yerba / Pájaro',
    ])
    expect(names(searchFoods([food('Yerba', 'Taragüí')], 'TARAGUI'))).toEqual([
      'Yerba / Taragüí',
    ])
  })

  it('un término que está en el nombre y otro en la marca', () => {
    expect(names(searchFoods([food('Alfajor', 'Havanna')], 'alf hav'))).toEqual(
      ['Alfajor / Havanna'],
    )
  })

  it('cada término puede estar en el mismo campo', () => {
    expect(
      names(searchFoods([food('Leche descremada'), food('Leche')], 'des le')),
    ).toEqual(['Leche descremada'])
  })

  it('basta con que falte un término para descartar', () => {
    expect(
      searchFoods([food('Arroz', 'Gallo')], 'arroz gallo integral'),
    ).toEqual([])
  })

  it('ordena también el resultado filtrado', () => {
    expect(
      names(
        searchFoods(
          [food('Pan lactal'), food('Banana'), food('Pan árabe'), food('Pan')],
          'pan',
        ),
      ),
    ).toEqual(['Pan', 'Pan árabe', 'Pan lactal'])
  })

  it('ordena las marcas sin distinguir mayúsculas ni tildes', () => {
    expect(
      names(
        searchFoods(
          [
            food('Yerba', 'Union'),
            food('Yerba', 'amanda'),
            food('Yerba', 'Ñandú'),
            food('Yerba', 'Nobleza'),
          ],
          '',
        ),
      ),
    ).toEqual([
      'Yerba / amanda',
      'Yerba / Nobleza',
      'Yerba / Ñandú',
      'Yerba / Union',
    ])
  })

  it('el sin marca va primero aunque venga último o en el medio', () => {
    expect(
      names(searchFoods([food('Arroz', 'Abc'), food('Arroz', null)], '')),
    ).toEqual(['Arroz', 'Arroz / Abc'])
    expect(
      names(searchFoods([food('Arroz', null), food('Arroz', 'Abc')], '')),
    ).toEqual(['Arroz', 'Arroz / Abc'])
  })

  it('un salto de línea en la consulta separa palabras y no une campos', () => {
    expect(searchFoods([food('Alfa', 'Jor')], 'a\nj')).toHaveLength(1)
    expect(searchFoods([food('Alfa', 'Jor')], 'aj')).toEqual([])
  })
})

describe('searchFoods: empates', () => {
  it('marcas que solo difieren en mayúsculas o tildes empatan y conservan el orden de entrada', () => {
    const tied = [
      food('Arroz', 'Gallo'),
      food('Arroz', 'gallo'),
      food('Arroz', 'Galló'),
    ]
    expect(names(searchFoods(tied, ''))).toEqual([
      'Arroz / Gallo',
      'Arroz / gallo',
      'Arroz / Galló',
    ])
    expect(names(searchFoods(tied.toReversed(), ''))).toEqual([
      'Arroz / Galló',
      'Arroz / gallo',
      'Arroz / Gallo',
    ])
  })
})
