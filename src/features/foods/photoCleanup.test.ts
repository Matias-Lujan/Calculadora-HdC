import { describe, expect, it } from 'vitest'
import { orphanPhotoPaths, type StoredPhoto } from './photoCleanup.ts'

const USER = 'user-1'
const NOW = Date.parse('2026-11-26T12:00:00Z')
const OLD = '2026-11-24T12:00:00Z'
const NEW = '2026-11-26T08:00:00Z'

function photo(name: string, created_at: string | null = OLD): StoredPhoto {
  return { name, id: `id-${name}`, created_at }
}

describe('orphanPhotoPaths', () => {
  it('deletes an old photo that no food uses', () => {
    expect(orphanPhotoPaths(USER, [photo('a.jpg')], [], NOW)).toEqual([
      'user-1/a.jpg',
    ])
  })

  it('keeps a photo that a food uses, archived or not', () => {
    const stored = [photo('a.jpg'), photo('b.jpg'), photo('c.jpg')]
    const used = ['user-1/a.jpg', null, 'user-1/c.jpg']
    expect(orphanPhotoPaths(USER, stored, used, NOW)).toEqual(['user-1/b.jpg'])
  })

  it('keeps a loose photo younger than a day', () => {
    expect(orphanPhotoPaths(USER, [photo('a.jpg', NEW)], [], NOW)).toEqual([])
  })

  it('keeps a photo of exactly a day, and deletes one just older', () => {
    const exactly = new Date(NOW - 24 * 60 * 60 * 1000).toISOString()
    const older = new Date(NOW - 24 * 60 * 60 * 1000 - 1).toISOString()
    const stored = [photo('a.jpg', exactly), photo('b.jpg', older)]
    expect(orphanPhotoPaths(USER, stored, [], NOW)).toEqual(['user-1/b.jpg'])
  })

  it('does not match a used path of another folder', () => {
    // The same name under another folder does not protect it.
    expect(
      orphanPhotoPaths(USER, [photo('a.jpg')], ['user-2/a.jpg'], NOW),
    ).toEqual(['user-1/a.jpg'])
  })

  it('leaves folder placeholders, subfolders and odd names alone', () => {
    const stored: StoredPhoto[] = [
      photo('.emptyFolderPlaceholder'),
      { name: 'sub', id: null, created_at: null },
      photo('../user-2/a.jpg'),
      photo('sub/a.jpg'),
      photo(''),
    ]
    expect(orphanPhotoPaths(USER, stored, [], NOW)).toEqual([])
  })

  it('leaves entries without a valid date alone', () => {
    const stored = [photo('a.jpg', null), photo('b.jpg', 'not a date')]
    expect(orphanPhotoPaths(USER, stored, [], NOW)).toEqual([])
  })

  it('returns nothing for an empty folder', () => {
    expect(orphanPhotoPaths(USER, [], ['user-1/a.jpg'], NOW)).toEqual([])
  })
})
