import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'
import type { EntityName, OpResult, SyncOp } from '../../shared/sync.js'
import { MemoryStore } from './memory-store.js'
import { runMigrations } from './migrations.js'
import { PgStore, type Store } from './store.js'
import { processOp, pullChanges } from './sync-core.js'

const uuid = () => crypto.randomUUID()
const doc = (text: string) => ({
  type: 'doc' as const,
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

async function memoryStore(): Promise<Store> {
  return new MemoryStore()
}

async function postgresStore(): Promise<Store> {
  const pg = new PGlite()
  await runMigrations(async (text, params) => (await pg.query(text, params)).rows as Record<string, unknown>[])
  return new PgStore(async (text, params) => (await pg.query(text, params)).rows as Record<string, unknown>[])
}

function op(entity: EntityName, id: string, fields: Record<string, unknown>, baseRev: number | null): SyncOp {
  return { opId: uuid(), entity, id, kind: 'upsert', baseRev, fields }
}

const noteFields = (text: string, extra: Record<string, unknown> = {}) => ({
  title: text,
  content: doc(text),
  contentText: text,
  ...extra,
})

function applied(result: OpResult) {
  if (result.status !== 'applied') throw new Error(`expected applied, got ${JSON.stringify(result)}`)
  return result.rev
}

describe.each([
  ['in-memory store', memoryStore],
  ['real Postgres (PGlite)', postgresStore],
])('sync core on %s', (_name, makeStore) => {
  it('creates a note with defaults and returns its revision', async () => {
    const store = await makeStore()
    const id = uuid()
    const rev = applied(await processOp(store, op('note', id, noteFields('hello', { createdAt: 1000, updatedAt: 1000 }), null)))
    const row = await store.get('note', id)
    expect(row).toMatchObject({ id, rev, title: 'hello', contentText: 'hello', pinned: false, folderId: null, tagIds: [], deletedAt: null, createdAt: 1000 })
    expect(row?.content).toEqual(doc('hello'))
  })

  it('applies an edit based on the latest revision', async () => {
    const store = await makeStore()
    const id = uuid()
    const rev1 = applied(await processOp(store, op('note', id, noteFields('v1'), null)))
    const rev2 = applied(await processOp(store, op('note', id, noteFields('v2'), rev1)))
    expect(rev2).toBeGreaterThan(rev1)
    expect((await store.get('note', id))?.title).toBe('v2')
  })

  it('refuses a stale text edit as a conflict and keeps the server text', async () => {
    const store = await makeStore()
    const id = uuid()
    const rev1 = applied(await processOp(store, op('note', id, noteFields('original'), null)))
    applied(await processOp(store, op('note', id, noteFields('phone edit'), rev1)))

    const result = await processOp(store, op('note', id, noteFields('laptop edit'), rev1))
    expect(result.status).toBe('conflict')
    if (result.status === 'conflict') expect(result.record).toMatchObject({ title: 'phone edit' })
    expect((await store.get('note', id))?.title).toBe('phone edit')
  })

  it('applies a stale metadata change (pin) without touching the text', async () => {
    const store = await makeStore()
    const id = uuid()
    const rev1 = applied(await processOp(store, op('note', id, noteFields('text'), null)))
    applied(await processOp(store, op('note', id, noteFields('newer text'), rev1)))

    const result = await processOp(store, op('note', id, { pinned: true, pinnedAt: 5, updatedAt: 9 }, rev1))
    expect(result.status).toBe('applied')
    expect(await store.get('note', id)).toMatchObject({ pinned: true, pinnedAt: 5, title: 'newer text' })
  })

  it('still accepts a text edit after only metadata changed elsewhere', async () => {
    const store = await makeStore()
    const id = uuid()
    const rev1 = applied(await processOp(store, op('note', id, noteFields('text'), null)))
    applied(await processOp(store, op('note', id, { pinned: true, pinnedAt: 5 }, rev1)))

    // Edit was made against rev1; the pin changed the revision but not the text.
    const result = await processOp(store, op('note', id, noteFields('edited'), rev1))
    expect(result.status).toBe('applied')
    expect((await store.get('note', id))?.title).toBe('edited')
  })

  it('applies metadata from a conflicting op while refusing its text', async () => {
    const store = await makeStore()
    const id = uuid()
    const rev1 = applied(await processOp(store, op('note', id, noteFields('a'), null)))
    applied(await processOp(store, op('note', id, noteFields('b'), rev1)))

    const result = await processOp(store, op('note', id, noteFields('c', { pinned: true }), rev1))
    expect(result.status).toBe('conflict')
    expect(await store.get('note', id)).toMatchObject({ title: 'b', pinned: true })
  })

  it('answers a retried op with the original result instead of a false conflict', async () => {
    const store = await makeStore()
    const id = uuid()
    const rev1 = applied(await processOp(store, op('note', id, noteFields('a'), null)))
    const edit = op('note', id, noteFields('b'), rev1)
    const first = await processOp(store, edit)
    const retry = await processOp(store, edit) // e.g. the response was lost
    expect(retry).toMatchObject({ status: 'applied', rev: applied(first) })
  })

  it('hands back the merged record when the change landed on a row that had moved on', async () => {
    const store = await makeStore()
    const id = uuid()
    const rev1 = applied(await processOp(store, op('note', id, noteFields('text'), null)))
    // Another device pins the note...
    applied(await processOp(store, op('note', id, { pinned: true, pinnedAt: 5 }, rev1)))
    // ...then this device saves text based on the older revision.
    const result = await processOp(store, op('note', id, noteFields('edited'), rev1))
    expect(result).toMatchObject({ status: 'applied', record: { pinned: true, title: 'edited' } })

    // A clean update needs no record: the sender already has the full picture.
    const clean = await processOp(store, op('note', id, noteFields('again'), applied(result)))
    expect(clean.status === 'applied' && clean.record).toBeFalsy()
  })

  it('purges a record, leaves a tombstone, and reports it on pull', async () => {
    const store = await makeStore()
    const id = uuid()
    applied(await processOp(store, op('note', id, noteFields('gone'), null)))
    applied(await processOp(store, { opId: uuid(), entity: 'note', id, kind: 'purge', baseRev: null }))

    expect(await store.get('note', id)).toBeNull()
    const pulled = await pullChanges(store, 0, 100)
    expect(pulled.records).toHaveLength(0)
    expect(pulled.purged).toEqual([{ entity: 'note', id }])
  })

  it('purges only items binned before the cutoff and tells devices via tombstones', async () => {
    const store = await makeStore()
    const [oldNote, recentNote, liveNote, oldFolder] = [uuid(), uuid(), uuid(), uuid()]
    applied(await processOp(store, op('note', oldNote, noteFields('old', { deletedAt: 1_000 }), null)))
    applied(await processOp(store, op('note', recentNote, noteFields('recent', { deletedAt: 9_000 }), null)))
    applied(await processOp(store, op('note', liveNote, noteFields('live'), null)))
    applied(await processOp(store, op('folder', oldFolder, { name: 'Old folder', deletedAt: 2_000 }, null)))

    expect(await store.purgeExpired(5_000)).toBe(2)

    expect(await store.get('note', oldNote)).toBeNull()
    expect(await store.get('folder', oldFolder)).toBeNull()
    expect(await store.get('note', recentNote)).not.toBeNull()
    expect(await store.get('note', liveNote)).not.toBeNull()
    const pulled = await pullChanges(store, 0, 100)
    expect(pulled.purged.map((p) => p.id).sort()).toEqual([oldNote, oldFolder].sort())
    expect(await store.purgeExpired(5_000)).toBe(0) // nothing left to purge
  })

  it('rejects malformed changes instead of storing them', async () => {
    const store = await makeStore()
    const id = uuid()
    const cases: SyncOp[] = [
      op('note', id, { nope: 1 }, null), // unknown field
      op('note', 'not-a-uuid', noteFields('x'), null), // bad id
      op('note', id, { pinned: 'yes' }, null), // wrong type
      op('note', id, { tagIds: ['x'] }, null), // bad tag id
      op('folder', id, { name: '' }, null), // empty name
    ]
    for (const c of cases) expect((await processOp(store, c)).status).toBe('rejected')
    expect(await store.get('note', id)).toBeNull()
  })

  it('treats folders and tags as last-write-wins', async () => {
    const store = await makeStore()
    const folderId = uuid()
    const tagId = uuid()
    const f1 = applied(await processOp(store, op('folder', folderId, { name: 'Work', color: null }, null)))
    applied(await processOp(store, op('folder', folderId, { name: 'Work 2' }, f1)))
    applied(await processOp(store, op('folder', folderId, { name: 'Renamed offline' }, f1))) // stale, still applies
    applied(await processOp(store, op('tag', tagId, { name: 'urgent', color: '#f00' }, null)))

    expect((await store.get('folder', folderId))?.name).toBe('Renamed offline')
    expect(await store.get('tag', tagId)).toMatchObject({ name: 'urgent', color: '#f00' })
  })

  it('pages through changes in revision order without skipping or repeating', async () => {
    const store = await makeStore()
    const ids = Array.from({ length: 7 }, uuid)
    for (const id of ids) applied(await processOp(store, op('note', id, noteFields(id), null)))

    const seen: string[] = []
    let cursor = 0
    let pages = 0
    for (;;) {
      const page = await pullChanges(store, cursor, 3)
      pages++
      seen.push(...page.records.map((r) => r.record.id))
      cursor = page.cursor
      if (!page.hasMore) break
    }
    expect(seen).toEqual(ids)
    expect(pages).toBe(3)
  })

  it('reports no more changes when exactly one full page remains', async () => {
    const store = await makeStore()
    for (let i = 0; i < 3; i++) applied(await processOp(store, op('note', uuid(), noteFields(`n${i}`), null)))
    const page = await pullChanges(store, 0, 3)
    expect(page.records).toHaveLength(3)
    expect(page.hasMore).toBe(false)
  })

  it('returns an unchanged cursor when nothing is new', async () => {
    const store = await makeStore()
    const rev = applied(await processOp(store, op('note', uuid(), noteFields('x'), null)))
    const page = await pullChanges(store, rev, 100)
    expect(page).toMatchObject({ cursor: rev, hasMore: false, records: [], purged: [] })
  })
})
