/** A label photo is left alone for its first day (spec §6.1, §7.4). */
export const ORPHAN_PHOTO_AGE_MS = 24 * 60 * 60 * 1000

/** What the storage list gives for each entry of the user's folder. */
export type StoredPhoto = {
  name: string
  /** null for a subfolder. */
  id: string | null
  created_at: string | null
}

/**
 * The label photos of `userId`'s folder to delete (spec §6.1, §7.4): those
 * older than a day that no food uses (`usedPaths` has the photo_path of
 * every food, archived or not). A younger photo may belong to a food being
 * added in another tab. Subfolders, hidden entries (Supabase's
 * `.emptyFolderPlaceholder`), names with a slash and entries without a
 * valid date are left alone. Returns full paths, `{userId}/{name}`.
 */
export function orphanPhotoPaths(
  userId: string,
  stored: readonly StoredPhoto[],
  usedPaths: readonly (string | null)[],
  now: number,
): string[] {
  const used = new Set(usedPaths)
  const orphans: string[] = []
  for (const entry of stored) {
    if (entry.id === null) continue
    if (entry.name === '' || entry.name.startsWith('.')) continue
    if (entry.name.includes('/')) continue
    if (entry.created_at === null) continue
    const createdAt = Date.parse(entry.created_at)
    if (Number.isNaN(createdAt)) continue
    if (now - createdAt <= ORPHAN_PHOTO_AGE_MS) continue
    const path = `${userId}/${entry.name}`
    if (used.has(path)) continue
    orphans.push(path)
  }
  return orphans
}
