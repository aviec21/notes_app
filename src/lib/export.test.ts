// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, repo } from '../sync/runtime'
import { exportAllNotes, safeName } from './export'

async function entries(): Promise<JSZip> {
  const result = await exportAllNotes()
  return JSZip.loadAsync(result.blob)
}

/** File paths in the archive (folder entries are not files). */
const filesIn = (zip: JSZip) => Object.keys(zip.files).filter((path) => !zip.files[path].dir)

beforeEach(async () => {
  await Promise.all([db.notes.clear(), db.folders.clear(), db.tags.clear(), db.images.clear(), db.outbox.clear()])
})
afterEach(() => vi.restoreAllMocks())

describe('exporting everything as Markdown', () => {
  it('writes one file per note, arranged in folders, plus an index', async () => {
    const work = await repo.createFolder('Work / 2026')
    const planned = await repo.createNote(work)
    await repo.setNoteText(planned, 'Quarterly plan', 'roadmap')
    const loose = await repo.createNote()
    await repo.setNoteText(loose, 'Groceries', 'milk\neggs')

    const zip = await entries()
    const paths = filesIn(zip).sort()
    expect(paths).toContain('Work 2026/Quarterly plan.md') // the slash is not allowed in names
    expect(paths).toContain('Notes/Groceries.md')
    expect(paths).toContain('index.md')

    const body = await zip.file('Notes/Groceries.md')!.async('string')
    expect(body).toContain('title: "Groceries"')
    expect(body).toContain('# Groceries')
    expect(body).toContain('milk')
  })

  it('records tags, pins and the folder in each file', async () => {
    const id = await repo.createNote()
    await repo.setNoteText(id, 'Tagged', 'text')
    const tag = await repo.createTag('urgent')
    await repo.tagNotes([id], tag, true)
    await repo.setPinned([{ entity: 'note', id }], true)

    const zip = await entries()
    const body = await zip.file('Notes/Tagged.md')!.async('string')
    expect(body).toContain('tags: ["urgent"]')
    expect(body).toContain('pinned: true')
    expect(body).toContain('folder: "Notes"')
  })

  it('puts binned notes in their own folder', async () => {
    const id = await repo.createNote()
    await repo.setNoteText(id, 'Old thing', 'gone')
    await repo.trashNotes([id])
    const zip = await entries()
    expect(filesIn(zip)).toContain('Recycle bin/Old thing.md')
  })

  it('includes the pictures a note uses', async () => {
    const id = await repo.createNote()
    const imageId = crypto.randomUUID()
    // The test database cannot store real Blobs (browsers can), so serve one directly.
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/webp' })
    vi.spyOn(db.images, 'get').mockResolvedValue({
      id: imageId,
      noteId: id,
      blob,
      mime: 'image/webp',
      size: 4,
      uploaded: 1,
      createdAt: Date.now(),
    })
    await repo.update('note', id, {
      title: 'With picture',
      content: { type: 'doc', content: [{ type: 'noteImage', attrs: { imageId, alt: 'Chart photo', width: 100 } }] },
      contentText: 'Chart photo',
    })

    const result = await exportAllNotes()
    expect(result.images).toBe(1)
    expect(result.missingImages).toBe(0)
    const zip = await JSZip.loadAsync(result.blob)
    expect(filesIn(zip)).toContain(`images/${imageId}.webp`)
    const body = await zip.file('Notes/With picture.md')!.async('string')
    expect(body).toContain(`![Chart photo](images/${imageId}.webp)`)
  })

  it('reports pictures that are not on this device', async () => {
    const id = await repo.createNote()
    await repo.update('note', id, {
      title: 'Missing picture',
      content: { type: 'doc', content: [{ type: 'noteImage', attrs: { imageId: crypto.randomUUID(), alt: 'Gone', width: 100 } }] },
      contentText: 'Gone',
    })
    const result = await exportAllNotes() // offline: the fetch fails, nothing throws
    expect(result.missingImages).toBe(1)
    expect(result.images).toBe(0)
  })

  it('gives notes with the same title different file names', async () => {
    for (const _ of [1, 2, 3]) {
      const id = await repo.createNote()
      await repo.setNoteText(id, 'Same', 'x')
    }
    const zip = await entries()
    const names = filesIn(zip).filter((p) => p.startsWith('Notes/')).sort()
    expect(names).toEqual(['Notes/Same (2).md', 'Notes/Same (3).md', 'Notes/Same.md'])
  })

  it('makes file names safe on every system', () => {
    expect(safeName('a/b\\c:d*e?f"g<h>i|j')).toBe('a b c d e f g h i j')
    expect(safeName('   ')).toBe('Untitled')
    expect(safeName('trailing dot.')).toBe('trailing dot')
    expect(safeName('x'.repeat(200)).length).toBe(80)
  })

  it('names the file with the date and counts what it holds', async () => {
    const id = await repo.createNote()
    await repo.setNoteText(id, 'One', 'text')
    const result = await exportAllNotes()
    expect(result.filename).toMatch(/^notes-export-\d{4}-\d{2}-\d{2}\.zip$/)
    expect(result.notes).toBe(1)
  })
})
