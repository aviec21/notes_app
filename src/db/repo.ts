import {
  BIN_RETENTION_DAYS,
  fieldsOf,
  type DocJson,
  type EntityName,
  type FolderRecord,
  type NoteRecord,
  type RecordByEntity,
  type TagRecord,
} from '../../shared/sync'
import { docToText, textToDoc } from '../lib/doc'
import { isFolderColor } from '../lib/folderColors'
import type { LocalRecord, NotesDB } from './db'

const sameValue = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

/**
 * All local writes go through here: each one updates this device's copy immediately and
 * queues a change for the server. Nothing here needs a network connection.
 */
export class Repo {
  private listeners = new Set<() => void>()
  readonly db: NotesDB

  constructor(db: NotesDB) {
    this.db = db
  }

  /** Called after every local write (the sync runtime uses it to schedule a push). */
  onLocalChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private changed() {
    for (const listener of this.listeners) listener()
  }

  /** Inserts a record and queues it. Must run inside a transaction on the tables involved. */
  async insertInTx<E extends EntityName>(entity: E, record: RecordByEntity[E]): Promise<void> {
    await this.db.recordTable(entity).put({ ...record, rev: 0 })
    const { id, ...fields } = record as unknown as { id: string } & Record<string, unknown>
    await this.db.outbox.add({
      opId: crypto.randomUUID(),
      entity,
      id,
      kind: 'upsert',
      baseRev: null,
      fields,
      sending: 0,
    })
  }

  async create<E extends EntityName>(entity: E, record: RecordByEntity[E]): Promise<void> {
    await this.db.transaction('rw', [this.db.recordTable(entity), this.db.outbox], () =>
      this.insertInTx(entity, record),
    )
    this.changed()
  }

  /**
   * Changes some fields of a record. Only fields whose value actually differs are kept,
   * so re-saving unchanged text queues nothing. Returns whether anything changed.
   */
  async update<E extends EntityName>(
    entity: E,
    id: string,
    patch: Partial<RecordByEntity[E]>,
  ): Promise<boolean> {
    const allowed = new Set(fieldsOf(entity))
    const didChange = await this.db.transaction(
      'rw',
      [this.db.recordTable(entity), this.db.outbox],
      async () => {
        const local = await this.db.recordTable(entity).get(id)
        if (!local) return false

        const fields: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(patch)) {
          if (allowed.has(key) && !sameValue((local as unknown as Record<string, unknown>)[key], value)) {
            fields[key] = value
          }
        }
        if (Object.keys(fields).length === 0) return false
        if (!('updatedAt' in fields)) fields.updatedAt = Date.now()

        await this.db.recordTable(entity).put({ ...local, ...fields } as LocalRecord)
        await this.enqueue(entity, id, fields, local.rev === 0 ? null : local.rev)
        return true
      },
    )
    if (didChange) this.changed()
    return didChange
  }

  /** Queues a patch, merging it into a waiting (not yet sent) change for the same record. */
  private async enqueue(entity: EntityName, id: string, fields: Record<string, unknown>, baseRev: number | null) {
    const waiting = (await this.db.outbox.where('[entity+id]').equals([entity, id]).toArray())
      .filter((op) => op.sending === 0 && op.kind === 'upsert')
      .at(-1)
    if (waiting?.seq !== undefined) {
      // The base revision stays that of the first edit, which is what conflict detection needs.
      await this.db.outbox.update(waiting.seq, { fields: { ...waiting.fields, ...fields } })
      return
    }
    await this.db.outbox.add({
      opId: crypto.randomUUID(),
      entity,
      id,
      kind: 'upsert',
      baseRev,
      fields,
      sending: 0,
    })
  }

  /** Permanently deletes a record here and on the server. */
  async purge(entity: EntityName, id: string): Promise<void> {
    await this.db.transaction('rw', [this.db.recordTable(entity), this.db.outbox], async () => {
      const local = await this.db.recordTable(entity).get(id)
      await this.db.recordTable(entity).delete(id)
      const ops = await this.db.outbox.where('[entity+id]').equals([entity, id]).toArray()
      const inFlight = ops.some((op) => op.sending === 1)
      for (const op of ops) if (op.sending === 0 && op.seq !== undefined) await this.db.outbox.delete(op.seq)
      // Never reached the server and nothing is on its way there: nothing to tell it.
      if (local && local.rev === 0 && !inFlight) return
      await this.db.outbox.add({
        opId: crypto.randomUUID(),
        entity,
        id,
        kind: 'purge',
        baseRev: null,
        sending: 0,
      })
    })
    this.changed()
  }

  // --- notes -------------------------------------------------------------------------

  async createNote(folderId: string | null = null): Promise<string> {
    const now = Date.now()
    const note: NoteRecord = {
      id: crypto.randomUUID(),
      folderId,
      title: '',
      content: textToDoc(''),
      contentText: '',
      tagIds: [],
      pinned: false,
      pinnedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deleteBatch: null,
    }
    await this.create('note', note)
    return note.id
  }

  /** Saves a note's title and plain text (used by tests and imports). */
  setNoteText(id: string, title: string, text: string) {
    return this.update('note', id, { title, content: textToDoc(text), contentText: text })
  }

  /** Saves a note's title and rich-text document; the searchable text is derived from it. */
  setNoteContent(id: string, title: string, content: DocJson) {
    return this.update('note', id, { title, content, contentText: docToText(content) })
  }

  renameNote(id: string, title: string) {
    return this.update('note', id, { title: title.trim() })
  }

  /** Removes a note that was created but never given any content. */
  async discardIfEmpty(id: string): Promise<void> {
    const note = await this.db.notes.get(id)
    if (note && !note.title.trim() && !note.contentText.trim()) await this.purge('note', id)
  }

  moveNotes(ids: string[], folderId: string | null) {
    return this.each(ids, (id) => this.update('note', id, { folderId }))
  }

  setNoteTags(id: string, tagIds: string[]) {
    return this.update('note', id, { tagIds })
  }

  /** Adds (or removes) one tag on several notes at once. */
  async tagNotes(ids: string[], tagId: string, on: boolean): Promise<void> {
    await this.each(ids, async (id) => {
      const note = await this.db.notes.get(id)
      if (!note) return
      const has = note.tagIds.includes(tagId)
      if (on && !has) await this.update('note', id, { tagIds: [...note.tagIds, tagId] })
      if (!on && has) await this.update('note', id, { tagIds: note.tagIds.filter((t) => t !== tagId) })
    })
  }

  // --- folders -----------------------------------------------------------------------

  async createFolder(name: string): Promise<string> {
    const now = Date.now()
    const folder: FolderRecord = {
      id: crypto.randomUUID(),
      name: name.trim(),
      color: null,
      pinned: false,
      pinnedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deleteBatch: null,
    }
    await this.create('folder', folder)
    return folder.id
  }

  renameFolder(id: string, name: string) {
    return this.update('folder', id, { name: name.trim() })
  }

  /** Sets a folder's colour by name (see lib/folderColors), or clears it with null. */
  async setFolderColor(id: string, color: string | null) {
    if (color !== null && !isFolderColor(color)) throw new Error(`Unknown folder colour: ${color}`)
    return this.update('folder', id, { color })
  }

  // --- pin ---------------------------------------------------------------------------

  setPinned(items: ItemRef[], pinned: boolean): Promise<void> {
    const pinnedAt = pinned ? Date.now() : null
    return this.each(items, async ({ entity, id }) => {
      await this.update(entity, id, { pinned, pinnedAt })
    })
  }

  // --- tags --------------------------------------------------------------------------

  /** Creates a tag, or returns the existing one with the same name (ignoring case). */
  async createTag(name: string): Promise<string> {
    const wanted = name.trim()
    const existing = await this.db.tags.filter((t) => t.name.toLowerCase() === wanted.toLowerCase()).first()
    if (existing) return existing.id
    const now = Date.now()
    const tag: TagRecord = { id: crypto.randomUUID(), name: wanted, color: null, createdAt: now, updatedAt: now }
    await this.create('tag', tag)
    return tag.id
  }

  renameTag(id: string, name: string) {
    return this.update('tag', id, { name: name.trim() })
  }

  /** Deletes a tag for good and takes it off every note. (Tags do not go to the bin.) */
  async deleteTag(id: string): Promise<void> {
    const tagged = await this.db.notes.filter((n) => n.tagIds.includes(id)).toArray()
    await this.each(tagged, (n) => this.update('note', n.id, { tagIds: n.tagIds.filter((t) => t !== id) }))
    await this.purge('tag', id)
  }

  // --- recycle bin -------------------------------------------------------------------

  trashNotes(ids: string[]) {
    const deletedAt = Date.now()
    return this.each(ids, (id) => this.update('note', id, { deletedAt, deleteBatch: crypto.randomUUID() }))
  }

  /** Bins folders together with the notes inside them, as one group that restores together. */
  async trashFolders(ids: string[]): Promise<void> {
    const deletedAt = Date.now()
    await this.each(ids, async (id) => {
      const deleteBatch = crypto.randomUUID()
      const inside = await this.db.notes.where('folderId').equals(id).filter((n) => n.deletedAt === null).toArray()
      await this.update('folder', id, { deletedAt, deleteBatch })
      await this.each(inside, (n) => this.update('note', n.id, { deletedAt, deleteBatch }))
    })
  }

  /** Trashes a mixed selection of notes and folders. */
  async trash(items: ItemRef[]): Promise<void> {
    await this.trashFolders(items.filter((i) => i.entity === 'folder').map((i) => i.id))
    await this.trashNotes(items.filter((i) => i.entity === 'note').map((i) => i.id))
  }

  /**
   * Brings items back. A folder returns with the notes that were binned with it; a note
   * whose folder is still binned (or gone) comes back as a note not in any folder.
   */
  async restore(items: ItemRef[]): Promise<void> {
    for (const { id } of items.filter((i) => i.entity === 'folder')) {
      const folder = await this.db.folders.get(id)
      if (!folder) continue
      const batch = folder.deleteBatch
      await this.update('folder', id, { deletedAt: null, deleteBatch: null })
      if (!batch) continue
      const together = await this.db.notes
        .filter((n) => n.deletedAt !== null && n.deleteBatch === batch && n.folderId === id)
        .toArray()
      await this.each(together, (n) => this.update('note', n.id, { deletedAt: null, deleteBatch: null }))
    }
    for (const { id } of items.filter((i) => i.entity === 'note')) {
      const note = await this.db.notes.get(id)
      if (!note) continue
      const home = note.folderId ? await this.db.folders.get(note.folderId) : undefined
      const homeIsLive = !!home && home.deletedAt === null
      await this.update('note', id, {
        deletedAt: null,
        deleteBatch: null,
        ...(homeIsLive ? {} : { folderId: null }),
      })
    }
  }

  /** Deletes items for good (a folder takes the notes that were binned with it). */
  async deleteForever(items: ItemRef[]): Promise<void> {
    for (const { entity, id } of items) {
      if (entity === 'folder') {
        const folder = await this.db.folders.get(id)
        const batch = folder?.deleteBatch
        if (batch) {
          const together = await this.db.notes
            .filter((n) => n.deletedAt !== null && n.deleteBatch === batch && n.folderId === id)
            .toArray()
          await this.each(together, (n) => this.purge('note', n.id))
        }
      }
      await this.purge(entity, id)
    }
  }

  /**
   * Deletes for good anything that has been in the bin longer than the retention period.
   * The server does this daily too; this is the safety net for when that job is not set up,
   * and it keeps a device that has been offline for a long time tidy.
   */
  async purgeExpired(now = Date.now()): Promise<number> {
    const cutoff = now - BIN_RETENTION_DAYS * 24 * 60 * 60 * 1000
    const expired = (item: { deletedAt: number | null }) => item.deletedAt !== null && item.deletedAt < cutoff
    const folders = await this.db.folders.filter(expired).toArray()
    // Notes binned together with one of those folders go when the folder does.
    const batches = new Set(folders.map((f) => f.deleteBatch).filter((b): b is string => b !== null))
    const notes = (await this.db.notes.filter(expired).toArray()).filter(
      (n) => !(n.deleteBatch && batches.has(n.deleteBatch)),
    )
    if (folders.length + notes.length === 0) return 0
    await this.deleteForever([
      ...folders.map((f) => ({ entity: 'folder' as const, id: f.id })),
      ...notes.map((n) => ({ entity: 'note' as const, id: n.id })),
    ])
    return folders.length + notes.length
  }

  async emptyBin(): Promise<void> {
    const notes = await this.db.notes.filter((n) => n.deletedAt !== null).toArray()
    const folders = await this.db.folders.filter((f) => f.deletedAt !== null).toArray()
    await this.each(notes, (n) => this.purge('note', n.id))
    await this.each(folders, (f) => this.purge('folder', f.id))
  }

  private async each<T>(list: T[], run: (item: T) => Promise<unknown>): Promise<void> {
    for (const item of list) await run(item)
  }
}

/** A note or folder, by id. */
export interface ItemRef {
  entity: 'note' | 'folder'
  id: string
}
