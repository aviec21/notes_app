import {
  ENTITY_FIELDS,
  MAX_OPS_PER_PUSH,
  type EntityName,
  type NoteRecord,
  type OpResult,
  type PullResponse,
  type ServerRecord,
  type SyncOp,
} from '../../shared/sync'
import type { LocalRecord, NotesDB, OutboxOp } from '../db/db'
import type { Repo } from '../db/repo'
import { AuthError, NetworkError, type Transport } from './transport'

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error'

export interface SyncSnapshot {
  state: SyncState
  lastSyncedAt: number | null
  /** Changes the server refused (this session). They stay on this device but are not synced. */
  refused: number
}

interface EngineOptions {
  isOnline?: () => boolean
  onUnauthorized?: () => void
  /** Runs before each push (used to upload pictures the notes refer to). */
  beforePush?: () => Promise<void>
}

const CURSOR_KEY = 'cursor'
const MAX_BATCH_BYTES = 1_500_000
// On the first sync after opening the app, re-read a little history in case a change
// committed out of order on the server. Re-applying a record is harmless.
const STARTUP_OVERLAP = 200

/** Sends queued local changes to the server and applies what changed elsewhere. */
export class SyncEngine {
  private snapshot: SyncSnapshot = { state: 'idle', lastSyncedAt: null, refused: 0 }
  private listeners = new Set<() => void>()
  private running: Promise<void> | null = null
  private again = false
  private firstCycle = true

  private readonly db: NotesDB
  private readonly repo: Repo
  private readonly transport: Transport
  private readonly options: EngineOptions

  constructor(db: NotesDB, repo: Repo, transport: Transport, options: EngineOptions = {}) {
    this.db = db
    this.repo = repo
    this.transport = transport
    this.options = options
  }

  // --- status (for the UI) ------------------------------------------------------------

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): SyncSnapshot => this.snapshot

  private setSnapshot(patch: Partial<SyncSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener()
  }

  setUnauthorizedHandler(handler: (() => void) | undefined) {
    this.options.onUnauthorized = handler
  }

  // --- running a sync -------------------------------------------------------------------

  /** Syncs now. If a sync is already running, one more runs right after it. */
  syncNow(): Promise<void> {
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = this.loop().finally(() => {
      this.running = null
    })
    return this.running
  }

  private async loop() {
    // A crash mid-send can leave changes marked "in flight"; sending them again is safe.
    await this.db.outbox.where('sending').equals(1).modify({ sending: 0 })
    do {
      this.again = false
      const ok = await this.cycle()
      if (!ok) return
    } while (this.again)
  }

  /** One push-then-pull. Returns false if it stopped early (offline, error, signed out). */
  private async cycle(): Promise<boolean> {
    if (!(this.options.isOnline?.() ?? navigator.onLine !== false)) {
      this.setSnapshot({ state: 'offline' })
      return false
    }
    this.setSnapshot({ state: 'syncing' })
    try {
      // Pictures go first, so a note never arrives elsewhere pointing at a missing picture.
      await this.options.beforePush?.()
      await this.push()
      await this.pull()
      this.setSnapshot({ state: 'idle', lastSyncedAt: Date.now() })
      return true
    } catch (err) {
      await this.db.outbox.where('sending').equals(1).modify({ sending: 0 })
      if (err instanceof AuthError) {
        this.setSnapshot({ state: 'idle' })
        this.options.onUnauthorized?.()
      } else if (err instanceof NetworkError) {
        this.setSnapshot({ state: 'offline' })
      } else {
        console.error('Sync failed:', err)
        this.setSnapshot({ state: 'error' })
      }
      return false
    }
  }

  // --- push -------------------------------------------------------------------------------

  private async push() {
    for (;;) {
      const batch = await this.claimBatch()
      if (batch.length === 0) return

      const { results } = await this.transport.push(batch.map(toWireOp))
      const byId = new Map<string, OpResult>(results.map((r) => [r.opId, r]))
      let unresolved = 0
      for (const op of batch) {
        const result = byId.get(op.opId)
        if (!result) unresolved++
        else await this.handleResult(op, result)
      }
      if (unresolved > 0) throw new Error('Server did not answer every change')
    }
  }

  /** Takes the oldest waiting changes and marks them in flight. */
  private async claimBatch(): Promise<OutboxOp[]> {
    return this.db.transaction('rw', this.db.outbox, async () => {
      const waiting = await this.db.outbox.where('sending').equals(0).sortBy('seq')
      const batch: OutboxOp[] = []
      let bytes = 0
      for (const op of waiting) {
        bytes += JSON.stringify(op).length
        if (batch.length > 0 && (batch.length >= MAX_OPS_PER_PUSH || bytes > MAX_BATCH_BYTES)) break
        batch.push(op)
      }
      for (const op of batch) await this.db.outbox.update(op.seq!, { sending: 1 })
      return batch
    })
  }

  private async handleResult(op: OutboxOp, result: OpResult) {
    if (result.status === 'applied') return this.onApplied(op, result.rev, result.record)
    if (result.status === 'conflict') return this.onConflict(op, result.record)
    // The server will never accept this change as it is (for example, a value that is too
    // large), so retrying would loop forever. It is dropped from the queue, but the copy on
    // this device is kept, and the person is told rather than left thinking it synced.
    console.error('Server rejected a change and it was dropped:', op.entity, result.reason)
    await this.db.setMeta('lastRejected', { opId: op.opId, reason: result.reason, at: Date.now() })
    await this.db.outbox.delete(op.seq!)
    this.setSnapshot({ refused: this.snapshot.refused + 1 })
  }

  private async onApplied(op: OutboxOp, rev: number, merged?: ServerRecord) {
    const records = this.db.recordTable(op.entity)
    await this.db.transaction('rw', [records, this.db.outbox], async () => {
      await this.db.outbox.delete(op.seq!)

      if (merged) {
        // Another device changed the record too; adopt the server's merged result
        // (any changes still queued here are laid back on top of it).
        await this.applyServerRecord(op.entity, merged)
      } else if (op.kind === 'upsert') {
        const local = await records.get(op.id)
        if (local) await records.put({ ...local, rev: Math.max(local.rev, rev) })
      }

      // A change queued after this one was made on top of it. If this one carried the
      // text, the server's text is now exactly ours, so later edits are based on `rev`
      // (otherwise text typed while this was in flight would look like a conflict).
      // If it did not carry text, later text edits keep their older base, so a genuine
      // conflict with another device's text is still caught.
      const carriedText = Object.keys(op.fields ?? {}).some((key) => ENTITY_FIELDS[op.entity].body.includes(key))
      if (op.kind === 'upsert' && carriedText) {
        const later = await this.db.outbox.where('[entity+id]').equals([op.entity, op.id]).toArray()
        for (const next of later) {
          if (next.seq! > op.seq! && next.kind === 'upsert') await this.db.outbox.update(next.seq!, { baseRev: rev })
        }
      }
    })
  }

  /**
   * The note's text changed elsewhere first. Nothing is lost: this device's version is
   * saved as a new "conflict copy" note, and the original takes the server's version.
   */
  private async onConflict(op: OutboxOp, server: ServerRecord) {
    const records = this.db.recordTable(op.entity)
    await this.db.transaction('rw', [records, this.db.outbox], async () => {
      const local = (await records.get(op.id)) as LocalRecord<'note'> | undefined
      if (local && op.entity === 'note') {
        const now = Date.now()
        const copy: NoteRecord = {
          id: crypto.randomUUID(),
          folderId: local.folderId,
          title: `${local.title.trim() || 'Untitled'} (conflict copy)`,
          content: local.content,
          contentText: local.contentText,
          tagIds: local.tagIds,
          pinned: false,
          pinnedAt: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          deleteBatch: null,
        }
        await this.repo.insertInTx('note', copy)
      }

      // Later queued changes keep their metadata but lose their (now conflicting) text.
      const later = (await this.db.outbox.where('[entity+id]').equals([op.entity, op.id]).toArray()).filter(
        (next) => next.seq! > op.seq! && next.kind === 'upsert',
      )
      let merged: Record<string, unknown> = { ...server }
      for (const next of later) {
        const metaOnly = omit(next.fields ?? {}, ['title', 'content', 'contentText'])
        if (Object.keys(metaOnly).length === 0) await this.db.outbox.delete(next.seq!)
        else await this.db.outbox.update(next.seq!, { fields: metaOnly, baseRev: server.rev })
        merged = { ...merged, ...metaOnly }
      }
      await records.put(merged as unknown as LocalRecord)
      await this.db.outbox.delete(op.seq!)
    })
  }

  // --- pull ---------------------------------------------------------------------------------

  private async pull() {
    const stored = (await this.db.getMeta<number>(CURSOR_KEY)) ?? 0
    let cursor = stored
    let since = this.firstCycle ? Math.max(0, stored - STARTUP_OVERLAP) : stored
    for (;;) {
      const page = await this.transport.pull(since)
      await this.applyPage(page)
      since = page.cursor
      cursor = Math.max(cursor, page.cursor)
      await this.db.setMeta(CURSOR_KEY, cursor)
      if (!page.hasMore) break
    }
    this.firstCycle = false
  }

  // A page is applied with a few bulk database operations rather than several per record:
  // some browsers' on-device databases are much slower per operation, and a first sync of a
  // large library would otherwise take minutes there.
  private async applyPage(page: PullResponse) {
    const tables = [this.db.notes, this.db.folders, this.db.tags, this.db.outbox]
    await this.db.transaction('rw', tables, async () => {
      const upserts = new Map<EntityName, ServerRecord[]>()
      for (const { entity, record } of page.records) upserts.set(entity, [...(upserts.get(entity) ?? []), record])
      for (const [entity, records] of upserts) await this.applyServerRecords(entity, records)

      const removals = new Map<EntityName, string[]>()
      for (const { entity, id } of page.purged) removals.set(entity, [...(removals.get(entity) ?? []), id])
      for (const [entity, ids] of removals) await this.applyTombstones(entity, ids)
    })
  }

  /** Waiting local changes for some records, oldest first, grouped by record id. */
  private async pendingFor(entity: EntityName, ids: string[]): Promise<Map<string, OutboxOp[]>> {
    const ops = await this.db.outbox
      .where('[entity+id]')
      .anyOf(ids.map((id) => [entity, id]))
      .toArray()
    const byId = new Map<string, OutboxOp[]>()
    for (const op of ops.sort((a, b) => a.seq! - b.seq!)) byId.set(op.id, [...(byId.get(op.id) ?? []), op])
    return byId
  }

  private async applyServerRecords(entity: EntityName, servers: ServerRecord[]) {
    if (servers.length === 0) return
    const records = this.db.recordTable(entity)
    const locals = await records.bulkGet(servers.map((s) => s.id))
    const pending = await this.pendingFor(entity, servers.map((s) => s.id))

    const toWrite: LocalRecord[] = []
    servers.forEach((server, index) => {
      const local = locals[index]
      if (local && local.rev >= server.rev) return // already have this (or newer)
      const waiting = pending.get(server.id) ?? []
      if (waiting.some((op) => op.kind === 'purge')) return // being deleted here; leave it

      // Unsent local changes stay on top of the server's version until they are sent.
      let merged: Record<string, unknown> = { ...server }
      for (const op of waiting) if (op.kind === 'upsert') merged = { ...merged, ...op.fields }
      toWrite.push(merged as unknown as LocalRecord)
    })
    if (toWrite.length > 0) await records.bulkPut(toWrite)
  }

  private applyServerRecord(entity: EntityName, server: ServerRecord) {
    return this.applyServerRecords(entity, [server])
  }

  private async applyTombstones(entity: EntityName, ids: string[]) {
    if (ids.length === 0) return
    const pending = await this.pendingFor(entity, ids)
    // Unsent edits win over a deletion elsewhere: they will recreate the record.
    const removable = ids.filter((id) => !(pending.get(id) ?? []).some((op) => op.kind === 'upsert'))
    if (removable.length > 0) await this.db.recordTable(entity).bulkDelete(removable)
  }
}

function toWireOp(op: OutboxOp): SyncOp {
  return {
    opId: op.opId,
    entity: op.entity,
    id: op.id,
    kind: op.kind,
    baseRev: op.baseRev,
    ...(op.fields ? { fields: op.fields } : {}),
  }
}

function omit(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(source).filter(([key]) => !keys.includes(key)))
}
