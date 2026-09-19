import { BIN_RETENTION_DAYS, type FolderRecord, type NoteRecord, type TagRecord } from '../../shared/sync'

const DAY_MS = 24 * 60 * 60 * 1000

/** Which screen is showing. Search results are layered on top of any of these. */
export type View =
  | { kind: 'root' } // folders + notes that are not in a folder
  | { kind: 'folder'; id: string }
  | { kind: 'tag'; id: string }
  | { kind: 'bin' }

export interface LibraryData {
  notes: NoteRecord[]
  folders: FolderRecord[]
  tags: TagRecord[]
}

export type Item =
  | { kind: 'note'; key: string; note: NoteRecord; daysLeft?: number }
  | { kind: 'folder'; key: string; folder: FolderRecord; noteCount: number; daysLeft?: number }

export interface Section {
  id: string
  title: string | null
  items: Item[]
}

export const itemKey = (kind: 'note' | 'folder', id: string) => `${kind}:${id}`

export function parseKey(key: string): { kind: 'note' | 'folder'; id: string } {
  const index = key.indexOf(':')
  return { kind: key.slice(0, index) as 'note' | 'folder', id: key.slice(index + 1) }
}

/** Whole days until an item in the bin is deleted for good (0 = today). */
export function daysLeft(deletedAt: number, now = Date.now()): number {
  return Math.max(0, Math.ceil(BIN_RETENTION_DAYS - (now - deletedAt) / DAY_MS))
}

const byRecent = (a: NoteRecord, b: NoteRecord) => b.updatedAt - a.updatedAt
const byName = (a: FolderRecord, b: FolderRecord) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
const byPinned = (a: { pinnedAt: number | null }, b: { pinnedAt: number | null }) =>
  (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0)

/** Folders that are not in the bin. */
export function liveFolders(data: LibraryData): FolderRecord[] {
  return data.folders.filter((f) => f.deletedAt === null)
}

/**
 * The folder a note effectively lives in. A note pointing at a folder that is binned or
 * gone (e.g. deleted on another device) counts as not in any folder.
 */
export function effectiveFolderId(note: NoteRecord, liveIds: Set<string>): string | null {
  return note.folderId && liveIds.has(note.folderId) ? note.folderId : null
}

/** Number of live notes in each live folder. */
export function folderNoteCounts(data: LibraryData): Map<string, number> {
  const liveIds = new Set(liveFolders(data).map((f) => f.id))
  const counts = new Map<string, number>()
  for (const note of data.notes) {
    if (note.deletedAt !== null) continue
    const folderId = effectiveFolderId(note, liveIds)
    if (folderId) counts.set(folderId, (counts.get(folderId) ?? 0) + 1)
  }
  return counts
}

/** Number of live notes carrying each tag. */
export function tagNoteCounts(data: LibraryData): Map<string, number> {
  const counts = new Map<string, number>()
  for (const note of data.notes) {
    if (note.deletedAt !== null) continue
    for (const tagId of note.tagIds) counts.set(tagId, (counts.get(tagId) ?? 0) + 1)
  }
  return counts
}

/** Top-level items in the bin: binned folders, and binned notes that were not binned with a folder. */
export function binItems(data: LibraryData, now = Date.now()): Item[] {
  const folders = data.folders.filter((f) => f.deletedAt !== null)
  const folderBatches = new Set(folders.map((f) => f.deleteBatch).filter((b): b is string => b !== null))
  const noteCounts = new Map<string, number>()
  const notes: NoteRecord[] = []
  for (const note of data.notes) {
    if (note.deletedAt === null) continue
    if (note.deleteBatch && folderBatches.has(note.deleteBatch)) {
      noteCounts.set(note.deleteBatch, (noteCounts.get(note.deleteBatch) ?? 0) + 1)
    } else {
      notes.push(note)
    }
  }
  const items: Item[] = [
    ...folders.map(
      (folder): Item => ({
        kind: 'folder',
        key: itemKey('folder', folder.id),
        folder,
        noteCount: folder.deleteBatch ? (noteCounts.get(folder.deleteBatch) ?? 0) : 0,
        daysLeft: daysLeft(folder.deletedAt!, now),
      }),
    ),
    ...notes.map(
      (note): Item => ({
        kind: 'note',
        key: itemKey('note', note.id),
        note,
        daysLeft: daysLeft(note.deletedAt!, now),
      }),
    ),
  ]
  return items.sort((a, b) => deletedAtOf(b) - deletedAtOf(a))
}

const deletedAtOf = (item: Item) => (item.kind === 'note' ? item.note.deletedAt : item.folder.deletedAt) ?? 0

function noteItem(note: NoteRecord): Item {
  return { kind: 'note', key: itemKey('note', note.id), note }
}

/** Case-insensitive, partial-match search over titles, text, tag names and folder names. */
export function matchesQuery(note: NoteRecord, query: string, data: LibraryData): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (note.title.toLowerCase().includes(q) || note.contentText.toLowerCase().includes(q)) return true
  const tagNames = data.tags.filter((t) => note.tagIds.includes(t.id)).map((t) => t.name.toLowerCase())
  if (tagNames.some((name) => name.includes(q))) return true
  const folder = data.folders.find((f) => f.id === note.folderId && f.deletedAt === null)
  return !!folder && folder.name.toLowerCase().includes(q)
}

/** A short excerpt of `text` around the first match of `query`, for search results. */
export function snippetAround(text: string, query: string, radius = 60): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const q = query.trim().toLowerCase()
  const at = q ? flat.toLowerCase().indexOf(q) : -1
  if (at === -1) return flat.slice(0, radius * 2)
  const start = Math.max(0, at - radius)
  const end = Math.min(flat.length, at + q.length + radius)
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`
}

/** What to show for a view (and optional search) as ordered sections. Empty sections are dropped. */
export function sectionsFor(view: View, query: string, data: LibraryData, now = Date.now()): Section[] {
  const folders = liveFolders(data)
  const liveIds = new Set(folders.map((f) => f.id))
  const counts = folderNoteCounts(data)
  const liveNotes = data.notes.filter((n) => n.deletedAt === null)
  const folderItem = (folder: FolderRecord): Item => ({
    kind: 'folder',
    key: itemKey('folder', folder.id),
    folder,
    noteCount: counts.get(folder.id) ?? 0,
  })

  let sections: Section[]
  if (query.trim()) {
    const matchingFolders = folders.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase()))
    const matchingNotes = liveNotes.filter((n) => matchesQuery(n, query, data)).sort(byRecent)
    sections = [
      { id: 'folders', title: 'Folders', items: matchingFolders.sort(byName).map(folderItem) },
      { id: 'notes', title: 'Notes', items: matchingNotes.map(noteItem) },
    ]
  } else if (view.kind === 'bin') {
    const items = binItems(data, now)
    sections = [
      { id: 'folders', title: 'Folders', items: items.filter((i) => i.kind === 'folder') },
      { id: 'notes', title: 'Notes', items: items.filter((i) => i.kind === 'note') },
    ]
  } else if (view.kind === 'tag') {
    sections = [{ id: 'notes', title: null, items: liveNotes.filter((n) => n.tagIds.includes(view.id)).sort(byRecent).map(noteItem) }]
  } else if (view.kind === 'folder') {
    const inFolder = liveNotes.filter((n) => effectiveFolderId(n, liveIds) === view.id)
    sections = [
      { id: 'pinned', title: 'Pinned', items: inFolder.filter((n) => n.pinned).sort(byPinned).map(noteItem) },
      { id: 'notes', title: 'Notes', items: inFolder.filter((n) => !n.pinned).sort(byRecent).map(noteItem) },
    ]
  } else {
    // Home: everything pinned (wherever it lives), then folders, then notes not in a folder.
    const pinned: Item[] = [
      ...folders.filter((f) => f.pinned).sort(byPinned).map(folderItem),
      ...liveNotes.filter((n) => n.pinned).sort(byPinned).map(noteItem),
    ]
    sections = [
      { id: 'pinned', title: 'Pinned', items: pinned },
      { id: 'folders', title: 'Folders', items: folders.filter((f) => !f.pinned).sort(byName).map(folderItem) },
      {
        id: 'notes',
        title: 'Notes',
        items: liveNotes
          .filter((n) => !n.pinned && effectiveFolderId(n, liveIds) === null)
          .sort(byRecent)
          .map(noteItem),
      },
    ]
  }
  return sections.filter((s) => s.items.length > 0)
}
