// Types and rules shared by the browser and the API for syncing records.
// Nothing secret belongs here.

export type EntityName = 'note' | 'folder' | 'tag'

/** A rich-text document (Tiptap/ProseMirror JSON). Phase 3 only writes plain paragraphs. */
export type DocJson = { type: 'doc'; content?: unknown[] }

export interface NoteRecord {
  id: string
  folderId: string | null
  title: string
  content: DocJson
  contentText: string // plain text of `content`, used for search
  tagIds: string[]
  pinned: boolean
  pinnedAt: number | null
  createdAt: number // epoch ms
  updatedAt: number
  deletedAt: number | null // set = in the recycle bin
  deleteBatch: string | null // groups a folder with the notes deleted along with it
}

export interface FolderRecord {
  id: string
  name: string
  color: string | null
  pinned: boolean
  pinnedAt: number | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
  deleteBatch: string | null
}

export interface TagRecord {
  id: string
  name: string
  color: string | null
  createdAt: number
  updatedAt: number
}

export interface RecordByEntity {
  note: NoteRecord
  folder: FolderRecord
  tag: TagRecord
}

/** Server copy of a record: the same fields plus the revision it was last written at. */
export type ServerRecord<E extends EntityName = EntityName> = RecordByEntity[E] & { rev: number }

/**
 * Which fields each entity has. "body" fields are the parts two devices can genuinely
 * conflict over (a note's text); everything else is "meta" and simply last-write-wins.
 */
export const ENTITY_FIELDS: Record<
  EntityName,
  { body: readonly string[]; meta: readonly string[]; immutable: readonly string[] }
> = {
  note: {
    body: ['title', 'content', 'contentText'],
    meta: ['folderId', 'tagIds', 'pinned', 'pinnedAt', 'deletedAt', 'deleteBatch', 'updatedAt'],
    immutable: ['createdAt'],
  },
  folder: {
    body: [],
    meta: ['name', 'color', 'pinned', 'pinnedAt', 'deletedAt', 'deleteBatch', 'updatedAt'],
    immutable: ['createdAt'],
  },
  tag: {
    body: [],
    meta: ['name', 'color', 'updatedAt'],
    immutable: ['createdAt'],
  },
}

export function fieldsOf(entity: EntityName): string[] {
  const { body, meta, immutable } = ENTITY_FIELDS[entity]
  return [...body, ...meta, ...immutable]
}

/** One queued change. `fields` holds only what the user changed (a patch). */
export interface SyncOp {
  opId: string // idempotency key: re-sending the same op is safe
  entity: EntityName
  id: string
  kind: 'upsert' | 'purge'
  /** Server revision this change was based on; null for a brand-new record. */
  baseRev: number | null
  fields?: Record<string, unknown>
}

export type OpResult =
  /**
   * `record` is included when the server row now holds more than this change alone
   * (another device changed it in between), so this device can adopt the merged result.
   */
  | { opId: string; status: 'applied'; rev: number; record?: ServerRecord }
  /** The note's text changed elsewhere first. Metadata was still applied. */
  | { opId: string; status: 'conflict'; record: ServerRecord }
  | { opId: string; status: 'rejected'; reason: string }

export interface PushResponse {
  results: OpResult[]
}

export interface PullResponse {
  cursor: number // pass back as `since` next time
  hasMore: boolean
  records: { entity: EntityName; record: ServerRecord }[]
  purged: { entity: EntityName; id: string }[]
}

export const MAX_OPS_PER_PUSH = 25
export const PULL_PAGE_SIZE = 100
