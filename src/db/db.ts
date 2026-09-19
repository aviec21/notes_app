import Dexie, { type Table } from 'dexie'
import type { EntityName, RecordByEntity, SyncOp } from '../../shared/sync'

/** A record as stored on this device: the fields plus the server revision it is based on. */
export type LocalRecord<E extends EntityName = EntityName> = RecordByEntity[E] & {
  /** Server revision this copy is based on; 0 means it has never reached the server. */
  rev: number
}

/** A queued change waiting to be sent. */
export interface OutboxOp extends SyncOp {
  seq?: number // auto-increment; defines send order
  sending: 0 | 1 // 1 while a request carrying it is in flight
}

export interface MetaRow {
  key: string
  value: unknown
}

/** A picture kept on this device. `uploaded`: 0 waiting, 1 on the server, 2 refused (too big). */
export interface ImageRow {
  id: string
  noteId: string
  blob: Blob
  mime: string
  size: number
  uploaded: 0 | 1 | 2
  createdAt: number
}

export class NotesDB extends Dexie {
  notes!: Table<LocalRecord<'note'>, string>
  folders!: Table<LocalRecord<'folder'>, string>
  tags!: Table<LocalRecord<'tag'>, string>
  outbox!: Table<OutboxOp, number>
  meta!: Table<MetaRow, string>
  images!: Table<ImageRow, string>

  constructor(name = 'notes-app') {
    super(name)
    this.version(1).stores({
      notes: 'id, folderId, deletedAt, updatedAt',
      folders: 'id, deletedAt',
      tags: 'id',
      outbox: '++seq, [entity+id], sending',
      meta: 'key',
    })
    this.version(2).stores({ images: 'id, noteId, uploaded' })
  }

  /** The table holding an entity's records. */
  recordTable(entity: EntityName): Table<LocalRecord, string> {
    const table = { note: this.notes, folder: this.folders, tag: this.tags }[entity]
    return table as unknown as Table<LocalRecord, string>
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.meta.get(key))?.value as T | undefined
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.meta.put({ key, value })
  }
}
