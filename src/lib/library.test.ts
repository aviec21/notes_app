import { describe, expect, it } from 'vitest'
import type { FolderRecord, NoteRecord, TagRecord } from '../../shared/sync'
import { textToDoc } from './doc'
import {
  binItems,
  daysLeft,
  effectiveFolderId,
  folderNoteCounts,
  matchesQuery,
  sectionsFor,
  snippetAround,
  type LibraryData,
} from './library'

const DAY = 24 * 60 * 60 * 1000
let n = 0
const note = (over: Partial<NoteRecord> = {}): NoteRecord => ({
  id: `note-${++n}`, folderId: null, title: 'Untitled', content: textToDoc(''), contentText: '', tagIds: [],
  pinned: false, pinnedAt: null, createdAt: 1, updatedAt: 1, deletedAt: null, deleteBatch: null, ...over,
})
const folder = (over: Partial<FolderRecord> = {}): FolderRecord => ({
  id: `folder-${++n}`, name: 'Folder', color: null, pinned: false, pinnedAt: null, createdAt: 1, updatedAt: 1,
  deletedAt: null, deleteBatch: null, ...over,
})
const tag = (over: Partial<TagRecord> = {}): TagRecord => ({
  id: `tag-${++n}`, name: 'tag', color: null, createdAt: 1, updatedAt: 1, ...over,
})
const ids = (data: LibraryData, view: Parameters<typeof sectionsFor>[0], query = '') =>
  sectionsFor(view, query, data).map((s) => [s.id, s.items.map((i) => (i.kind === 'note' ? i.note.id : i.folder.id))])

describe('home view', () => {
  it('shows pinned items, folders, and only the notes that are not in a folder', () => {
    const work = folder({ id: 'work', name: 'Work' })
    const data: LibraryData = {
      folders: [work],
      tags: [],
      notes: [
        note({ id: 'loose', updatedAt: 5 }),
        note({ id: 'inWork', folderId: 'work' }),
        note({ id: 'pinnedInWork', folderId: 'work', pinned: true, pinnedAt: 9 }),
      ],
    }
    expect(ids(data, { kind: 'root' })).toEqual([
      ['pinned', ['pinnedInWork']],
      ['folders', ['work']],
      ['notes', ['loose']],
    ])
  })

  it('orders notes by most recent edit and folders by name', () => {
    const data: LibraryData = {
      tags: [],
      folders: [folder({ id: 'b', name: 'beta' }), folder({ id: 'a', name: 'Alpha' })],
      notes: [note({ id: 'old', updatedAt: 1 }), note({ id: 'new', updatedAt: 9 })],
    }
    expect(ids(data, { kind: 'root' })).toEqual([
      ['folders', ['a', 'b']],
      ['notes', ['new', 'old']],
    ])
  })

  it('treats a note whose folder is in the bin as not in any folder', () => {
    const gone = folder({ id: 'gone', deletedAt: 5 })
    const data: LibraryData = { tags: [], folders: [gone], notes: [note({ id: 'orphan', folderId: 'gone' })] }
    expect(ids(data, { kind: 'root' })).toEqual([['notes', ['orphan']]])
    expect(effectiveFolderId(data.notes[0], new Set())).toBeNull()
  })
})

describe('folder and tag views', () => {
  const data: LibraryData = {
    folders: [folder({ id: 'f' })],
    tags: [tag({ id: 't', name: 'urgent' })],
    notes: [
      note({ id: 'a', folderId: 'f', tagIds: ['t'], updatedAt: 2 }),
      note({ id: 'b', folderId: 'f', pinned: true, pinnedAt: 1 }),
      note({ id: 'c', tagIds: ['t'], updatedAt: 3 }),
      note({ id: 'gone', folderId: 'f', deletedAt: 9 }),
    ],
  }

  it("lists a folder's notes with pinned first, excluding binned ones", () => {
    expect(ids(data, { kind: 'folder', id: 'f' })).toEqual([['pinned', ['b']], ['notes', ['a']]])
  })

  it('lists notes with a tag from any folder', () => {
    expect(ids(data, { kind: 'tag', id: 't' })).toEqual([['notes', ['c', 'a']]])
  })

  it('counts live notes per folder', () => {
    expect(folderNoteCounts(data).get('f')).toBe(2)
  })
})

describe('recycle bin', () => {
  it('shows binned folders (with their note count) and notes binned on their own', () => {
    const now = 100 * DAY
    const data: LibraryData = {
      tags: [],
      folders: [folder({ id: 'f', name: 'Trip', deletedAt: now - 2 * DAY, deleteBatch: 'batch' })],
      notes: [
        note({ id: 'withFolder1', folderId: 'f', deletedAt: now - 2 * DAY, deleteBatch: 'batch' }),
        note({ id: 'withFolder2', folderId: 'f', deletedAt: now - 2 * DAY, deleteBatch: 'batch' }),
        note({ id: 'alone', deletedAt: now - 5 * DAY, deleteBatch: 'other' }),
        note({ id: 'live' }),
      ],
    }
    const items = binItems(data, now)
    expect(items.map((i) => (i.kind === 'folder' ? `folder:${i.folder.id}:${i.noteCount}` : `note:${i.note.id}`))).toEqual([
      'folder:f:2',
      'note:alone',
    ])
    expect(items.map((i) => i.daysLeft)).toEqual([28, 25])
  })

  it('counts whole days left, never below zero', () => {
    expect(daysLeft(0, 0)).toBe(30)
    expect(daysLeft(0, 29.2 * DAY)).toBe(1)
    expect(daysLeft(0, 45 * DAY)).toBe(0)
  })
})

describe('search', () => {
  const data: LibraryData = {
    folders: [folder({ id: 'f', name: 'Recipes' })],
    tags: [tag({ id: 't', name: 'Urgent' })],
    notes: [
      note({ id: 'title', title: 'Shopping List' }),
      note({ id: 'body', contentText: 'buy MILK and eggs' }),
      note({ id: 'tagged', tagIds: ['t'] }),
      note({ id: 'foldered', folderId: 'f' }),
      note({ id: 'binned', title: 'shopping old', deletedAt: 1 }),
    ],
  }

  it('matches partial words, ignoring case, in title, text, tags and folder names', () => {
    const found = (q: string) => sectionsFor({ kind: 'root' }, q, data).flatMap((s) => s.items.map((i) => (i.kind === 'note' ? i.note.id : `folder:${i.folder.id}`)))
    expect(found('shop')).toEqual(['title'])
    expect(found('milk')).toEqual(['body'])
    expect(found('URGE')).toEqual(['tagged'])
    expect(found('recip')).toEqual(['folder:f', 'foldered'])
  })

  it('searches across folders and never returns binned notes', () => {
    expect(matchesQuery(data.notes[4], 'shopping', data)).toBe(true) // it matches...
    const results = sectionsFor({ kind: 'root' }, 'shopping', data).flatMap((s) => s.items)
    expect(results).toHaveLength(1) // ...but is hidden because it is in the bin
  })

  it('cuts a snippet around the match', () => {
    expect(snippetAround('a'.repeat(200) + ' needle ' + 'b'.repeat(200), 'needle', 10)).toBe('…aaaaaaaaa needle bbbbbbbbb…')
    expect(snippetAround('short text', 'zzz')).toBe('short text')
  })
})
