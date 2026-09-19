import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { MemoryStore } from '../../api/_lib/memory-store.js'
import { processOp, pullChanges } from '../../api/_lib/sync-core.js'
import { PULL_PAGE_SIZE, type SyncOp } from '../../shared/sync'
import { NotesDB } from '../db/db'
import { Repo } from '../db/repo'
import { SyncEngine } from './engine'
import { NetworkError, type Transport } from './transport'

// Two "devices" (each with its own IndexedDB) sharing one in-memory server.
// The server side is the real sync core, so these tests exercise the actual rules.

class TestServer {
  store = new MemoryStore()
}

const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T // as if sent over HTTP

let counter = 0
function device(server: TestServer, hooks: { beforePush?: (ops: SyncOp[]) => Promise<void>; losePushResponseOnce?: boolean } = {}) {
  const state = { online: true, lostOnce: false }
  const transport: Transport = {
    async push(ops) {
      if (!state.online) throw new NetworkError('offline')
      await hooks.beforePush?.(ops)
      const results = []
      for (const op of wire(ops)) results.push(await processOp(server.store, op))
      if (hooks.losePushResponseOnce && !state.lostOnce) {
        state.lostOnce = true
        throw new NetworkError('response lost') // server applied it, device never heard back
      }
      return wire({ results })
    },
    async pull(since) {
      if (!state.online) throw new NetworkError('offline')
      return wire(await pullChanges(server.store, since, PULL_PAGE_SIZE))
    },
  }
  const db = new NotesDB(`test-${++counter}`)
  const repo = new Repo(db)
  const engine = new SyncEngine(db, repo, transport, { isOnline: () => state.online })
  return { db, repo, engine, state }
}

const texts = async (d: ReturnType<typeof device>) =>
  (await d.db.notes.toArray()).map((n) => `${n.title}|${n.contentText}`).sort()

describe('local writes', () => {
  it('merges repeated edits of one note into a single queued change', async () => {
    const a = device(new TestServer())
    const id = await a.repo.createNote()
    await a.repo.setNoteText(id, 'T', 'one')
    await a.repo.setNoteText(id, 'T', 'two')
    await a.repo.setNoteText(id, 'T', 'three')
    const ops = await a.db.outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0].fields).toMatchObject({ title: 'T', contentText: 'three' })
  })

  it('queues nothing when a save changes nothing', async () => {
    const a = device(new TestServer())
    const id = await a.repo.createNote()
    await a.repo.setNoteText(id, 'T', 'same')
    await a.engine.syncNow()
    expect(await a.repo.setNoteText(id, 'T', 'same')).toBe(false)
    expect(await a.db.outbox.count()).toBe(0)
  })

  it('never sends a note that was created and discarded before syncing', async () => {
    const server = new TestServer()
    const a = device(server)
    const id = await a.repo.createNote()
    await a.repo.discardIfEmpty(id)
    expect(await a.db.outbox.count()).toBe(0)
    await a.engine.syncNow()
    expect((await server.store.changesSince(0, 10)).records).toHaveLength(0)
  })
})

describe('syncing between devices', () => {
  it('delivers a new note to a second device', async () => {
    const server = new TestServer()
    const a = device(server)
    const b = device(server)
    const id = await a.repo.createNote()
    await a.repo.setNoteText(id, 'Groceries', 'milk\neggs')
    await a.engine.syncNow()
    await b.engine.syncNow()
    expect(await b.db.notes.get(id)).toMatchObject({ title: 'Groceries', contentText: 'milk\neggs' })
    expect(await a.db.outbox.count()).toBe(0)
    expect(a.engine.getSnapshot().state).toBe('idle')
  })

  it('keeps working offline and sends everything once back online', async () => {
    const server = new TestServer()
    const a = device(server)
    a.state.online = false
    const id = await a.repo.createNote()
    await a.repo.setNoteText(id, 'Offline note', 'written on the train')
    await a.engine.syncNow()
    expect(a.engine.getSnapshot().state).toBe('offline')
    expect(await a.db.outbox.count()).toBe(1) // safe on the device

    a.state.online = true
    await a.engine.syncNow()
    expect(await a.db.outbox.count()).toBe(0)
    expect(await server.store.get('note', id)).toMatchObject({ title: 'Offline note' })
  })

  it('saves both versions when two devices edit the same note offline', async () => {
    const server = new TestServer()
    const a = device(server)
    const b = device(server)
    const id = await a.repo.createNote()
    await a.repo.setNoteText(id, 'Plan', 'v0')
    await a.engine.syncNow()
    await b.engine.syncNow()

    await a.repo.setNoteText(id, 'Plan', 'edit from A')
    await b.repo.setNoteText(id, 'Plan', 'edit from B')
    await a.engine.syncNow() // A gets there first
    await b.engine.syncNow() // B's text is now stale
    await a.engine.syncNow()
    await b.engine.syncNow()

    const expected = ['Plan (conflict copy)|edit from B', 'Plan|edit from A']
    expect(await texts(a)).toEqual(expected)
    expect(await texts(b)).toEqual(expected)
    expect(await a.db.outbox.count()).toBe(0)
    expect(await b.db.outbox.count()).toBe(0)
  })

  it('merges a pin on one device with a text edit on another, no conflict copy', async () => {
    const server = new TestServer()
    const a = device(server)
    const b = device(server)
    const id = await a.repo.createNote()
    await a.repo.setNoteText(id, 'Todo', 'base')
    await a.engine.syncNow()
    await b.engine.syncNow()

    await a.repo.update('note', id, { pinned: true, pinnedAt: 5 })
    await b.repo.setNoteText(id, 'Todo', 'edited on B')
    await a.engine.syncNow()
    await b.engine.syncNow()
    await a.engine.syncNow()

    for (const d of [a, b]) {
      const notes = await d.db.notes.toArray()
      expect(notes).toHaveLength(1)
      expect(notes[0]).toMatchObject({ pinned: true, contentText: 'edited on B' })
    }
  })

  it('keeps edits made to a note that was moved to the bin elsewhere', async () => {
    const server = new TestServer()
    const a = device(server)
    const b = device(server)
    const id = await a.repo.createNote()
    await a.repo.setNoteText(id, 'Old', 'base')
    await a.engine.syncNow()
    await b.engine.syncNow()

    await a.repo.trashNotes([id])
    await b.repo.setNoteText(id, 'Old', 'last-minute edit')
    await a.engine.syncNow()
    await b.engine.syncNow()
    await a.engine.syncNow()

    for (const d of [a, b]) {
      const notes = await d.db.notes.toArray()
      expect(notes).toHaveLength(1)
      expect(notes[0].deletedAt).not.toBeNull()
      expect(notes[0].contentText).toBe('last-minute edit')
    }
  })

  it('spreads a permanent delete to the other device', async () => {
    const server = new TestServer()
    const a = device(server)
    const b = device(server)
    const id = await a.repo.createNote()
    await a.repo.setNoteText(id, 'Bye', 'x')
    await a.engine.syncNow()
    await b.engine.syncNow()
    expect(await b.db.notes.get(id)).toBeDefined()

    await a.repo.purge('note', id)
    await a.engine.syncNow()
    await b.engine.syncNow()
    expect(await b.db.notes.get(id)).toBeUndefined()
    expect(await server.store.get('note', id)).toBeNull()
  })

  it('does not lose text typed while a sync is in flight', async () => {
    const server = new TestServer()
    let a!: ReturnType<typeof device>
    let id = ''
    let typed = false
    a = device(server, {
      beforePush: async () => {
        if (typed || !id) return
        typed = true
        await a.repo.setNoteText(id, 'Live', 'typed during sync') // user keeps typing mid-sync
      },
    })
    id = await a.repo.createNote()
    await a.repo.setNoteText(id, 'Live', 'first')
    await a.engine.syncNow()
    await a.engine.syncNow()

    expect(await a.db.notes.count()).toBe(1) // no false conflict copy
    expect(await server.store.get('note', id)).toMatchObject({ contentText: 'typed during sync' })
    expect(await a.db.outbox.count()).toBe(0)
  })

  it('survives a lost response without duplicating or conflicting with itself', async () => {
    const server = new TestServer()
    const a = device(server, { losePushResponseOnce: true })
    const id = await a.repo.createNote()
    await a.repo.setNoteText(id, 'Flaky', 'body')
    await a.engine.syncNow() // server applied it, but the reply was lost
    expect(a.engine.getSnapshot().state).toBe('offline')
    expect(await a.db.outbox.count()).toBe(1) // still queued, so it gets re-sent

    await a.engine.syncNow()
    expect(await a.db.outbox.count()).toBe(0)
    expect(await a.db.notes.count()).toBe(1)
    expect(await server.store.get('note', id)).toMatchObject({ title: 'Flaky' })
  })
})
