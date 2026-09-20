// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, repo } from '../sync/runtime'
import { exportAllNotes, exportSelection, safeName } from './export'

// Pictures are embedded as data; the test database cannot hold real image blobs.
vi.mock('../images', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../images')>()),
  imageDataUrl: async (id: string) => (id.startsWith('gone') ? null : 'data:image/webp;base64,QUJD'),
}))

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

describe('exporting a chosen selection as one Markdown file', () => {
  const note = (id: string) => ({ entity: 'note' as const, id })
  const folder = (id: string) => ({ entity: 'folder' as const, id })

  it('a single note becomes a file named after it, with its own headings nested', async () => {
    const id = await repo.createNote()
    await repo.update('note', id, {
      title: 'Trip plan',
      content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Flights' }] }] },
      contentText: 'Flights',
    })
    const result = await exportSelection([note(id)])
    expect(result.filename).toBe('Trip plan.md')
    expect(result.text).toContain('# Trip plan')
    expect(result.text).toContain('## Flights')
    expect(result.notes).toBe(1)
  })

  it('a folder brings its notes, sorted by title, under the folder heading', async () => {
    const work = await repo.createFolder('Work')
    for (const title of ['Zebra', 'Apple']) {
      const id = await repo.createNote(work)
      await repo.setNoteText(id, title, `${title} text`)
    }
    const elsewhere = await repo.createNote()
    await repo.setNoteText(elsewhere, 'Unrelated', 'not exported')

    const result = await exportSelection([folder(work)])
    expect(result.filename).toBe('Work.md')
    expect(result.text.indexOf('## Apple')).toBeGreaterThan(result.text.indexOf('# Work'))
    expect(result.text.indexOf('## Apple')).toBeLessThan(result.text.indexOf('## Zebra'))
    expect(result.text).not.toContain('Unrelated')
    expect(result.folders).toBe(1)
  })

  it('lists a note once even when it and its folder are both selected', async () => {
    const work = await repo.createFolder('Work')
    const id = await repo.createNote(work)
    await repo.setNoteText(id, 'Plan', 'plan text')
    const other = await repo.createNote()
    await repo.setNoteText(other, 'Loose', 'loose text')

    const result = await exportSelection([folder(work), note(id), note(other)])
    expect(result.filename).toMatch(/^notes-export-\d{4}-\d{2}-\d{2}\.md$/)
    expect(result.text.match(/### Plan/g)).toHaveLength(1) // under the folder only
    expect(result.text).toContain('## Loose') // beside the folder
    expect(result.notes).toBe(2)
  })

  it('shows the folder name and tags on a loose note that lives in a folder', async () => {
    const work = await repo.createFolder('Work')
    const id = await repo.createNote(work)
    await repo.setNoteText(id, 'Idea', 'text')
    await repo.tagNotes([id], await repo.createTag('urgent'), true)
    const other = await repo.createNote()
    await repo.setNoteText(other, 'Second', 'text')

    const result = await exportSelection([note(id), note(other)])
    expect(result.text).toContain('Folder: Work')
    expect(result.text).toContain('Tags: #urgent')
  })

  it('exports a folder that is in the recycle bin with the notes deleted along with it', async () => {
    const old = await repo.createFolder('Old')
    const inside = await repo.createNote(old)
    await repo.setNoteText(inside, 'Kept inside', 'text')
    const stray = await repo.createNote(old)
    await repo.setNoteText(stray, 'Deleted earlier', 'text')
    await repo.trashNotes([stray])
    await repo.trashFolders([old])

    const result = await exportSelection([folder(old)])
    expect(result.text).toContain('## Kept inside')
    expect(result.text).not.toContain('Deleted earlier') // it was binned on its own
  })

  it('embeds pictures in the file and counts the ones it could not include', async () => {
    const id = await repo.createNote()
    await repo.update('note', id, {
      title: 'Pictures',
      content: {
        type: 'doc',
        content: [
          { type: 'noteImage', attrs: { imageId: 'here-1', alt: 'Map' } },
          { type: 'noteImage', attrs: { imageId: 'gone-1', alt: 'Lost' } },
        ],
      },
      contentText: 'Map Lost',
    })
    const result = await exportSelection([note(id)])
    expect(result.text).toContain('![Map](data:image/webp;base64,QUJD)')
    expect(result.text).toContain('could not be included')
    expect(result.missingImages).toBe(1)
  })
})
