import type { FolderRecord, NoteRecord, TagRecord } from '../../shared/sync'
import { bytesOf, imageBlobOf, imageDataUrl, imageUrl } from '../images'
import { db } from '../sync/runtime'
import { imageIdsIn, noteToMarkdown, selectionToMarkdown } from './markdown'

export interface ExportResult {
  filename: string
  blob: Blob
  notes: number
  images: number
  /** Pictures that could not be included (not downloaded, and no connection). */
  missingImages: number
}

const UNFILED = 'Notes'
const BIN = 'Recycle bin'

/** Turns a title into a safe file name that every operating system accepts. */
export function safeName(name: string, fallback = 'Untitled'): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, ' ') // characters Windows forbids
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '') // Windows also dislikes trailing dots and spaces
  return cleaned.slice(0, 80) || fallback
}

function uniqueName(used: Set<string>, base: string, extension: string): string {
  let candidate = `${base}${extension}`
  let n = 2
  while (used.has(candidate.toLowerCase())) candidate = `${base} (${n++})${extension}`
  used.add(candidate.toLowerCase())
  return candidate
}

const isoDate = (ms: number) => new Date(ms).toISOString()

function frontMatter(note: NoteRecord, folder: string, tags: string[]): string {
  const lines = [
    '---',
    `title: ${JSON.stringify(note.title.trim() || 'Untitled')}`,
    `folder: ${JSON.stringify(folder)}`,
    `created: ${isoDate(note.createdAt)}`,
    `updated: ${isoDate(note.updatedAt)}`,
  ]
  if (tags.length) lines.push(`tags: [${tags.map((t) => JSON.stringify(t)).join(', ')}]`)
  if (note.pinned) lines.push('pinned: true')
  if (note.deletedAt) lines.push(`deleted: ${isoDate(note.deletedAt)}`)
  lines.push('---')
  return lines.join('\n')
}

/**
 * Packs every note into a .zip of Markdown files, arranged in folders, with the pictures
 * they use. Notes in the recycle bin go into their own folder.
 */
export async function exportAllNotes(options: { includeBin?: boolean } = {}): Promise<ExportResult> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()

  const [notes, folders, tags] = (await Promise.all([db.notes.toArray(), db.folders.toArray(), db.tags.toArray()])) as [
    NoteRecord[],
    FolderRecord[],
    TagRecord[],
  ]
  const folderName = new Map(folders.map((f) => [f.id, safeName(f.name, 'Folder')]))
  const tagName = new Map(tags.map((t) => [t.id, t.name]))
  const wanted = notes.filter((n) => (options.includeBin ?? true) || n.deletedAt === null)

  const usedPerFolder = new Map<string, Set<string>>()
  const imageIds = new Set<string>()
  const index: string[] = ['# Notes export', '', `Exported ${new Date().toLocaleString()}`, '']

  for (const note of [...wanted].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const directory = note.deletedAt ? BIN : (note.folderId && folderName.get(note.folderId)) || UNFILED
    const used = usedPerFolder.get(directory) ?? new Set<string>()
    usedPerFolder.set(directory, used)

    const file = uniqueName(used, safeName(note.title), '.md')
    const path = `${directory}/${file}`
    const noteTags = note.tagIds.map((id) => tagName.get(id)).filter((t): t is string => !!t)
    zip.file(path, `${frontMatter(note, directory, noteTags)}\n\n${noteToMarkdown(note.title, note.content)}\n`)

    for (const id of imageIdsIn(note.content)) imageIds.add(id)
    index.push(`- [${note.title.trim() || 'Untitled'}](${encodeURI(path)})`)
  }

  let included = 0
  let missing = 0
  for (const id of imageIds) {
    let row = await db.images.get(id)
    if (!row) {
      // Not on this device: fetch it once (only possible while online).
      if (await imageUrl(id)) row = await db.images.get(id)
    }
    const blob = row ? imageBlobOf(row) : undefined
    if (blob) {
      // Raw bytes rather than the Blob itself: every environment can write those.
      zip.file(`images/${id}.webp`, await bytesOf(blob))
      included++
    } else {
      missing++
    }
  }

  index.push('', `${wanted.length} notes · ${included} pictures`)
  if (missing > 0) index.push(`${missing} pictures could not be included (not downloaded to this device).`)
  zip.file('index.md', index.join('\n'))

  const stamp = new Date().toISOString().slice(0, 10)
  return {
    filename: `notes-export-${stamp}.zip`,
    blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }),
    notes: wanted.length,
    images: included,
    missingImages: missing,
  }
}

export interface SelectionExport {
  filename: string
  text: string
  notes: number
  folders: number
  /** Pictures that could not be embedded (not on this device and no connection). */
  missingImages: number
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })

/**
 * Builds a single Markdown file from the chosen notes and folders. A folder brings its
 * notes; a note that is also inside a chosen folder appears once, under the folder.
 */
export async function exportSelection(items: { entity: 'note' | 'folder'; id: string }[]): Promise<SelectionExport> {
  const [notes, folders, tags] = (await Promise.all([db.notes.toArray(), db.folders.toArray(), db.tags.toArray()])) as [
    NoteRecord[],
    FolderRecord[],
    TagRecord[],
  ]
  const tagName = new Map(tags.map((t) => [t.id, t.name]))
  const folderById = new Map(folders.map((f) => [f.id, f]))

  const chosenFolders = folders.filter((f) => items.some((i) => i.entity === 'folder' && i.id === f.id))
  const chosenNoteIds = new Set(items.filter((i) => i.entity === 'note').map((i) => i.id))

  // Notes that belong to a chosen folder: those in it now, or binned together with it.
  const inFolder = (folder: FolderRecord) =>
    notes.filter((n) =>
      folder.deletedAt === null
        ? n.deletedAt === null && n.folderId === folder.id
        : n.deletedAt !== null && n.deleteBatch === folder.deleteBatch && n.folderId === folder.id,
    )

  const covered = new Set<string>()
  const toExport = (note: NoteRecord, showFolder: boolean) => ({
    note,
    exported: {
      title: note.title,
      content: note.content,
      updatedAt: note.updatedAt,
      tags: note.tagIds.map((id) => tagName.get(id)).filter((t): t is string => !!t),
      folderName: showFolder && note.folderId ? folderById.get(note.folderId)?.name : undefined,
    },
  })

  const groups = [...chosenFolders]
    .sort((a, b) => byName(a.name, b.name))
    .map((folder) => {
      const members = inFolder(folder).sort((a, b) => byName(a.title, b.title))
      for (const n of members) covered.add(n.id)
      return { folder, members: members.map((n) => toExport(n, false)) }
    })
  const loose = notes
    .filter((n) => chosenNoteIds.has(n.id) && !covered.has(n.id))
    .sort((a, b) => byName(a.title, b.title))
    .map((n) => toExport(n, true))

  // Embed each picture once, so the single file is complete on its own.
  const wanted = new Set<string>()
  for (const { note } of [...groups.flatMap((g) => g.members), ...loose]) for (const id of imageIdsIn(note.content)) wanted.add(id)
  const sources = new Map<string, string | null>()
  await Promise.all([...wanted].map(async (id) => sources.set(id, await imageDataUrl(id))))

  const text = selectionToMarkdown(
    {
      groups: groups.map((g) => ({ name: g.folder.name, notes: g.members.map((m) => m.exported) })),
      loose: loose.map((l) => l.exported),
      exportedOn: new Date(),
    },
    { imageSrc: (id) => sources.get(id) ?? null },
  )

  const noteCount = groups.reduce((sum, g) => sum + g.members.length, 0) + loose.length
  const stamp = new Date().toISOString().slice(0, 10)
  const single = groups.length + loose.length === 1
  const filename = single
    ? `${safeName(groups.length === 1 ? groups[0].folder.name : loose[0].note.title, 'Notes')}.md`
    : `notes-export-${stamp}.md`

  return {
    filename,
    text,
    notes: noteCount,
    folders: groups.length,
    missingImages: [...sources.values()].filter((v) => v === null).length,
  }
}

/** Saves a blob to the person's downloads. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Give the browser a moment to start the download before releasing the data.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
