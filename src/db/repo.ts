import { fieldsOf, type EntityName, type NoteRecord, type RecordByEntity } from '../../shared/sync'
import { textToDoc } from '../lib/doc'
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

  /** Saves a note's title and plain text (phase 3 editor; rich text arrives later). */
  setNoteText(id: string, title: string, text: string) {
    return this.update('note', id, { title, content: textToDoc(text), contentText: text })
  }

  /** Moves a note to the recycle bin (restore/empty arrive with the bin screen). */
  trashNote(id: string) {
    return this.update('note', id, { deletedAt: Date.now(), deleteBatch: crypto.randomUUID() })
  }

  /** Removes a note that was created but never given any content. */
  async discardIfEmpty(id: string): Promise<void> {
    const note = await this.db.notes.get(id)
    if (note && !note.title.trim() && !note.contentText.trim()) await this.purge('note', id)
  }
}
