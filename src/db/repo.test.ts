import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { NotesDB } from './db'
import { Repo } from './repo'

let counter = 0
function setup() {
  const db = new NotesDB(`repo-test-${++counter}`)
  return { db, repo: new Repo(db) }
}

async function noteIn(repo: Repo, title: string, folderId: string | null = null) {
  const id = await repo.createNote(folderId)
  await repo.setNoteText(id, title, `${title} body`)
  return id
}

describe('folders and the recycle bin', () => {
  it('bins a folder together with its notes, and restores them together', async () => {
    const { db, repo } = setup()
    const folder = await repo.createFolder('Trip')
    const inside1 = await noteIn(repo, 'Flights', folder)
    const inside2 = await noteIn(repo, 'Hotels', folder)
    const outside = await noteIn(repo, 'Elsewhere')

    await repo.trashFolders([folder])
    expect((await db.folders.get(folder))?.deletedAt).not.toBeNull()
    expect((await db.notes.get(inside1))?.deletedAt).not.toBeNull()
    expect((await db.notes.get(inside2))?.deletedAt).not.toBeNull()
    expect((await db.notes.get(outside))?.deletedAt).toBeNull()

    await repo.restore([{ entity: 'folder', id: folder }])
    for (const id of [inside1, inside2]) {
      expect(await db.notes.get(id)).toMatchObject({ deletedAt: null, deleteBatch: null, folderId: folder })
    }
    expect(await db.folders.get(folder)).toMatchObject({ deletedAt: null, deleteBatch: null })
  })

  it('does not restore a note that was binned earlier along with its folder', async () => {
    const { db, repo } = setup()
    const folder = await repo.createFolder('Work')
    const early = await noteIn(repo, 'Binned first', folder)
    const late = await noteIn(repo, 'Binned with folder', folder)
    await repo.trashNotes([early])
    await repo.trashFolders([folder])

    await repo.restore([{ entity: 'folder', id: folder }])
    expect((await db.notes.get(late))?.deletedAt).toBeNull()
    expect((await db.notes.get(early))?.deletedAt).not.toBeNull() // still in the bin, on its own
  })

  it('restores a note whose folder is still binned into "no folder"', async () => {
    const { db, repo } = setup()
    const folder = await repo.createFolder('Old')
    const id = await noteIn(repo, 'Keep me', folder)
    await repo.trashFolders([folder])

    await repo.restore([{ entity: 'note', id }])
    expect(await db.notes.get(id)).toMatchObject({ deletedAt: null, folderId: null })
    expect((await db.folders.get(folder))?.deletedAt).not.toBeNull() // folder stays binned
  })

  it('keeps the folder when a note is restored and its folder is fine', async () => {
    const { db, repo } = setup()
    const folder = await repo.createFolder('Fine')
    const id = await noteIn(repo, 'Note', folder)
    await repo.trashNotes([id])
    await repo.restore([{ entity: 'note', id }])
    expect((await db.notes.get(id))?.folderId).toBe(folder)
  })

  it('deleting a folder for good also deletes the notes binned with it', async () => {
    const { db, repo } = setup()
    const folder = await repo.createFolder('Gone')
    const inside = await noteIn(repo, 'Inside', folder)
    const other = await noteIn(repo, 'Other')
    await repo.trashFolders([folder])
    await repo.trashNotes([other])

    await repo.deleteForever([{ entity: 'folder', id: folder }])
    expect(await db.folders.get(folder)).toBeUndefined()
    expect(await db.notes.get(inside)).toBeUndefined()
    expect(await db.notes.get(other)).toBeDefined() // unrelated binned note is untouched
  })

  it('empties the bin without touching live items', async () => {
    const { db, repo } = setup()
    const live = await noteIn(repo, 'Live')
    const binned = await noteIn(repo, 'Binned')
    const folder = await repo.createFolder('Binned folder')
    await repo.trashNotes([binned])
    await repo.trashFolders([folder])

    await repo.emptyBin()
    expect(await db.notes.toArray().then((n) => n.map((x) => x.id))).toEqual([live])
    expect(await db.folders.count()).toBe(0)
  })

  it('clears items whose 30 days in the bin are up, and leaves newer ones alone', async () => {
    const { db, repo } = setup()
    const old = await noteIn(repo, 'Old')
    const recent = await noteIn(repo, 'Recent')
    const live = await noteIn(repo, 'Live')
    const oldFolder = await repo.createFolder('Old folder')
    const inside = await noteIn(repo, 'Inside', oldFolder)

    const day = 24 * 60 * 60 * 1000
    await repo.trashNotes([old, recent])
    await repo.trashFolders([oldFolder])
    await db.notes.update(old, { deletedAt: Date.now() - 31 * day })
    await db.notes.update(inside, { deletedAt: Date.now() - 31 * day })
    await db.folders.update(oldFolder, { deletedAt: Date.now() - 31 * day })

    expect(await repo.purgeExpired()).toBe(2) // the folder and the stand-alone note
    expect(await db.notes.get(old)).toBeUndefined()
    expect(await db.notes.get(inside)).toBeUndefined() // it went with its folder
    expect(await db.folders.get(oldFolder)).toBeUndefined()
    expect(await db.notes.get(recent)).toBeDefined()
    expect(await db.notes.get(live)).toBeDefined()
    expect(await repo.purgeExpired()).toBe(0)
  })

  it('queues permanent deletes so the server and other devices learn of them', async () => {
    const { db, repo } = setup()
    const id = await noteIn(repo, 'Synced note')
    await db.outbox.clear()
    await db.notes.update(id, { rev: 5 }) // pretend it already reached the server
    await repo.trashNotes([id])
    await db.outbox.clear()

    await repo.deleteForever([{ entity: 'note', id }])
    const ops = await db.outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ entity: 'note', id, kind: 'purge' })
  })
})

describe('pin, move and tags', () => {
  it('pins and unpins notes and folders', async () => {
    const { db, repo } = setup()
    const note = await noteIn(repo, 'N')
    const folder = await repo.createFolder('F')
    await repo.setPinned([{ entity: 'note', id: note }, { entity: 'folder', id: folder }], true)
    expect(await db.notes.get(note)).toMatchObject({ pinned: true })
    expect((await db.notes.get(note))?.pinnedAt).toEqual(expect.any(Number))
    expect(await db.folders.get(folder)).toMatchObject({ pinned: true })

    await repo.setPinned([{ entity: 'note', id: note }], false)
    expect(await db.notes.get(note)).toMatchObject({ pinned: false, pinnedAt: null })
  })

  it('moves several notes into a folder and back out', async () => {
    const { db, repo } = setup()
    const folder = await repo.createFolder('F')
    const a = await noteIn(repo, 'A')
    const b = await noteIn(repo, 'B')
    await repo.moveNotes([a, b], folder)
    expect((await db.notes.bulkGet([a, b])).map((n) => n?.folderId)).toEqual([folder, folder])
    await repo.moveNotes([a], null)
    expect((await db.notes.get(a))?.folderId).toBeNull()
  })

  it('reuses a tag with the same name regardless of case', async () => {
    const { db, repo } = setup()
    const first = await repo.createTag('Urgent')
    expect(await repo.createTag('  urgent ')).toBe(first)
    expect(await db.tags.count()).toBe(1)
  })

  it('tags and untags several notes at once', async () => {
    const { db, repo } = setup()
    const tag = await repo.createTag('work')
    const a = await noteIn(repo, 'A')
    const b = await noteIn(repo, 'B')
    await repo.tagNotes([a, b], tag, true)
    expect((await db.notes.bulkGet([a, b])).map((n) => n?.tagIds)).toEqual([[tag], [tag]])
    await repo.tagNotes([a], tag, false)
    expect((await db.notes.get(a))?.tagIds).toEqual([])
    expect((await db.notes.get(b))?.tagIds).toEqual([tag])
  })

  it('deleting a tag removes it from every note', async () => {
    const { db, repo } = setup()
    const tag = await repo.createTag('temp')
    const keep = await repo.createTag('keep')
    const a = await noteIn(repo, 'A')
    await repo.setNoteTags(a, [tag, keep])

    await repo.deleteTag(tag)
    expect(await db.tags.get(tag)).toBeUndefined()
    expect((await db.notes.get(a))?.tagIds).toEqual([keep])
  })
})
