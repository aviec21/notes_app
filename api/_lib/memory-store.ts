import { fieldsOf, type EntityName } from '../../shared/sync.js'
import type { ChangesPage, Row, Store } from './store.js'

/** In-memory Store used by tests and by client/server integration tests. */
export class MemoryStore implements Store {
  private rev = 0
  private tables: Record<EntityName, Map<string, Row>> = {
    note: new Map(),
    folder: new Map(),
    tag: new Map(),
  }
  private tombstones = new Map<string, { entity: EntityName; rev: number }>()
  private applied = new Map<string, number>()

  private nextRev() {
    return ++this.rev
  }

  async get(entity: EntityName, id: string) {
    const row = this.tables[entity].get(id)
    return row ? structuredClone(row) : null
  }

  async insert(entity: EntityName, fields: Record<string, unknown> & { id: string }) {
    if (this.tables[entity].has(fields.id)) return null
    this.tombstones.delete(fields.id)
    const rev = this.nextRev()
    const row: Row = { id: fields.id, rev, bodyRev: entity === 'note' ? rev : 0 }
    for (const f of fieldsOf(entity)) row[f] = structuredClone(fields[f] ?? null)
    this.tables[entity].set(row.id, row)
    return structuredClone(row)
  }

  async updateIfRev(
    entity: EntityName,
    id: string,
    expectedRev: number,
    changes: Record<string, unknown>,
    bumpBody: boolean,
  ) {
    const row = this.tables[entity].get(id)
    if (!row || row.rev !== expectedRev) return null
    Object.assign(row, structuredClone(changes))
    row.rev = this.nextRev()
    if (bumpBody && entity === 'note') row.bodyRev = row.rev
    return structuredClone(row)
  }

  async purge(entity: EntityName, id: string) {
    this.tables[entity].delete(id)
    const rev = this.nextRev()
    this.tombstones.set(id, { entity, rev })
    return rev
  }

  async appliedRev(opId: string) {
    return this.applied.get(opId) ?? null
  }

  async recordApplied(opId: string, rev: number) {
    this.applied.set(opId, rev)
  }

  async purgeExpired(cutoff: number) {
    let total = 0
    for (const entity of ['note', 'folder'] as const) {
      for (const row of [...this.tables[entity].values()]) {
        if (typeof row.deletedAt === 'number' && row.deletedAt < cutoff) {
          await this.purge(entity, row.id)
          total++
        }
      }
    }
    return total
  }

  async changesSince(since: number, limit: number): Promise<ChangesPage> {
    const records: ChangesPage['records'] = []
    for (const entity of Object.keys(this.tables) as EntityName[]) {
      const rows = [...this.tables[entity].values()]
        .filter((r) => r.rev > since)
        .sort((a, b) => a.rev - b.rev)
        .slice(0, limit)
      for (const row of rows) records.push({ entity, row: structuredClone(row) })
    }
    const purged = [...this.tombstones.entries()]
      .filter(([, t]) => t.rev > since)
      .sort((a, b) => a[1].rev - b[1].rev)
      .slice(0, limit)
      .map(([id, t]) => ({ entity: t.entity, id, rev: t.rev }))
    return { records, purged }
  }
}
