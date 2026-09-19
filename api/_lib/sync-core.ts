import {
  ENTITY_FIELDS,
  fieldsOf,
  type EntityName,
  type OpResult,
  type PullResponse,
  type ServerRecord,
  type SyncOp,
} from '../../shared/sync.js'
import type { Row, Store } from './store.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const isTimestamp = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0
const nullable = (check: (v: unknown) => boolean) => (v: unknown) => v === null || check(v)
const isDoc = (v: unknown) =>
  typeof v === 'object' && v !== null && (v as { type?: unknown }).type === 'doc' &&
  JSON.stringify(v).length <= 1_000_000

// Every accepted field, with the check its value must pass.
const FIELD_CHECKS: Record<string, (v: unknown) => boolean> = {
  folderId: nullable(isUuid),
  deleteBatch: nullable(isUuid),
  title: (v) => typeof v === 'string' && v.length <= 1000,
  contentText: (v) => typeof v === 'string' && v.length <= 500_000,
  content: isDoc,
  tagIds: (v) => Array.isArray(v) && v.length <= 200 && v.every(isUuid),
  name: (v) => typeof v === 'string' && v.length >= 1 && v.length <= 200,
  color: nullable((v) => typeof v === 'string' && v.length <= 32),
  pinned: (v) => typeof v === 'boolean',
  pinnedAt: nullable(isTimestamp),
  deletedAt: nullable(isTimestamp),
  createdAt: isTimestamp,
  updatedAt: isTimestamp,
}

const DEFAULTS: Record<EntityName, Record<string, unknown>> = {
  note: {
    folderId: null,
    title: '',
    content: { type: 'doc', content: [] },
    contentText: '',
    tagIds: [],
    pinned: false,
    pinnedAt: null,
    deletedAt: null,
    deleteBatch: null,
  },
  folder: { name: 'Untitled folder', color: null, pinned: false, pinnedAt: null, deletedAt: null, deleteBatch: null },
  tag: { name: 'Untitled tag', color: null },
}

function validateOp(op: SyncOp): string | null {
  if (!isUuid(op?.opId)) return 'bad opId'
  if (!(op.entity in ENTITY_FIELDS)) return 'unknown entity'
  if (!isUuid(op.id)) return 'bad id'
  if (op.kind !== 'upsert' && op.kind !== 'purge') return 'unknown kind'
  if (op.baseRev !== null && !(Number.isSafeInteger(op.baseRev) && op.baseRev >= 0)) return 'bad baseRev'
  return null
}

/** Keeps only known fields with valid values; returns a reason if anything is wrong. */
function sanitize(entity: EntityName, fields: unknown): { fields: Record<string, unknown> } | { error: string } {
  if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) return { error: 'bad fields' }
  const allowed = new Set(fieldsOf(entity))
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (!allowed.has(key)) return { error: `unknown field ${key}` }
    if (!FIELD_CHECKS[key](value)) return { error: `invalid value for ${key}` }
    clean[key] = value
  }
  return { fields: clean }
}

/** The record as sent to devices (drops internal bookkeeping). */
export function toServerRecord(row: Row): ServerRecord {
  const { bodyRev: _bodyRev, ...record } = row
  return record as unknown as ServerRecord
}

/**
 * Applies one queued change. The rule that protects your notes: a change to a note's
 * text is only accepted if nobody changed the text since the version it was based on.
 * Otherwise it is refused (the device keeps it as a "conflict copy"), while its
 * metadata (pin, folder, tags, delete) is still applied, last write wins.
 */
export async function processOp(store: Store, op: SyncOp): Promise<OpResult> {
  const invalid = validateOp(op)
  if (invalid) return { opId: String(op?.opId), status: 'rejected', reason: invalid }

  const prior = await store.appliedRev(op.opId)
  if (prior !== null) {
    // A retry: the answer is the original one, plus the row as it is now.
    const current = await store.get(op.entity, op.id)
    return { opId: op.opId, status: 'applied', rev: prior, ...(current ? { record: toServerRecord(current) } : {}) }
  }

  if (op.kind === 'purge') {
    const rev = await store.purge(op.entity, op.id)
    await store.recordApplied(op.opId, rev)
    return { opId: op.opId, status: 'applied', rev }
  }

  const clean = sanitize(op.entity, op.fields ?? {})
  if ('error' in clean) return { opId: op.opId, status: 'rejected', reason: clean.error }
  const fields = clean.fields
  const bodyFields = ENTITY_FIELDS[op.entity].body

  // Optimistic concurrency: if another write sneaks in between our read and write, retry.
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await store.get(op.entity, op.id)

    if (!existing) {
      const now = Date.now()
      const createdAt = (fields.createdAt as number | undefined) ?? now
      const inserted = await store.insert(op.entity, {
        ...DEFAULTS[op.entity],
        updatedAt: createdAt,
        ...fields,
        id: op.id,
        createdAt,
      })
      if (!inserted) continue
      await store.recordApplied(op.opId, inserted.rev)
      return { opId: op.opId, status: 'applied', rev: inserted.rev }
    }

    const changes: Record<string, unknown> = {}
    let bodyApplied = false
    let conflict = false
    let hasBodyChange = false
    for (const [key, value] of Object.entries(fields)) {
      if (key === 'createdAt') continue // fixed at creation
      if (bodyFields.includes(key)) hasBodyChange = true
      else changes[key] = value
    }
    if (hasBodyChange) {
      if (existing.bodyRev > (op.baseRev ?? 0)) conflict = true
      else {
        for (const key of bodyFields) if (key in fields) changes[key] = fields[key]
        bodyApplied = true
      }
    }

    let current = existing
    if (Object.keys(changes).length > 0) {
      const updated = await store.updateIfRev(op.entity, op.id, existing.rev, changes, bodyApplied)
      if (!updated) continue
      current = updated
    }

    if (conflict) return { opId: op.opId, status: 'conflict', record: toServerRecord(current) }
    await store.recordApplied(op.opId, current.rev)

    // If the row moved on since this change's base, it also holds someone else's changes.
    const exact = op.baseRev !== null && existing.rev === op.baseRev
    return {
      opId: op.opId,
      status: 'applied',
      rev: current.rev,
      ...(exact ? {} : { record: toServerRecord(current) }),
    }
  }
  throw new Error(`Too much write contention on ${op.entity} ${op.id}`)
}

/** Everything that changed after `since`, oldest first, at most `limit` items. */
export async function pullChanges(store: Store, since: number, limit: number): Promise<PullResponse> {
  // Ask for one extra row per kind: if anything beyond `limit` exists, we see it.
  const page = await store.changesSince(since, limit + 1)
  const items = [
    ...page.records.map((r) => ({ rev: r.row.rev, record: r })),
    ...page.purged.map((p) => ({ rev: p.rev, purged: p })),
  ].sort((a, b) => a.rev - b.rev)

  const included = items.slice(0, limit)
  const response: PullResponse = {
    cursor: included.length ? included[included.length - 1].rev : since,
    hasMore: items.length > limit,
    records: [],
    purged: [],
  }
  for (const item of included) {
    if ('record' in item) {
      response.records.push({ entity: item.record.entity, record: toServerRecord(item.record.row) })
    } else {
      response.purged.push({ entity: item.purged.entity, id: item.purged.id })
    }
  }
  return response
}
