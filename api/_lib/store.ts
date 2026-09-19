import { fieldsOf, type EntityName } from '../../shared/sync.js'
import type { Query } from './migrations.js'

/** A stored record: its fields plus revision bookkeeping. */
export type Row = Record<string, unknown> & { id: string; rev: number; bodyRev: number }

export interface ChangesPage {
  records: { entity: EntityName; row: Row }[]
  purged: { entity: EntityName; id: string; rev: number }[]
}

/** Everything sync needs from a database. Postgres in production, in-memory in tests. */
export interface Store {
  get(entity: EntityName, id: string): Promise<Row | null>
  /** Inserts a new record; resolves null if the id already exists. */
  insert(entity: EntityName, fields: Record<string, unknown>): Promise<Row | null>
  /** Applies changes only if the record is still at `expectedRev`; resolves null if not. */
  updateIfRev(
    entity: EntityName,
    id: string,
    expectedRev: number,
    changes: Record<string, unknown>,
    bumpBody: boolean,
  ): Promise<Row | null>
  /** Permanently deletes a record and leaves a tombstone. Returns the tombstone's rev. */
  purge(entity: EntityName, id: string): Promise<number>
  appliedRev(opId: string): Promise<number | null>
  recordApplied(opId: string, rev: number): Promise<void>
  /** Up to `limit` of each kind of change with rev > since, oldest first. */
  changesSince(since: number, limit: number): Promise<ChangesPage>
}

const TABLE: Record<EntityName, string> = { note: 'notes', folder: 'folders', tag: 'tags' }
const ENTITIES = Object.keys(TABLE) as EntityName[]

// Column types, used to cast parameters explicitly so Postgres never has to guess.
const SQL_TYPE: Record<string, string> = {
  id: 'uuid',
  folderId: 'uuid',
  deleteBatch: 'uuid',
  title: 'text',
  contentText: 'text',
  name: 'text',
  color: 'text',
  content: 'jsonb',
  tagIds: 'jsonb',
  pinned: 'boolean',
  pinnedAt: 'bigint',
  deletedAt: 'bigint',
  createdAt: 'bigint',
  updatedAt: 'bigint',
}
const JSON_FIELDS = new Set(['content', 'tagIds'])
const NUMBER_FIELDS = new Set(['pinnedAt', 'deletedAt', 'createdAt', 'updatedAt'])

const snake = (field: string) => field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

function toParam(field: string, value: unknown): unknown {
  return JSON_FIELDS.has(field) ? JSON.stringify(value) : value
}

function toRow(entity: EntityName, dbRow: Record<string, unknown>): Row {
  const row: Row = {
    id: String(dbRow.id),
    rev: Number(dbRow.rev),
    bodyRev: entity === 'note' ? Number(dbRow.body_rev) : 0,
  }
  for (const field of fieldsOf(entity)) {
    const value = dbRow[snake(field)]
    // bigint columns can arrive as strings or bigints; timestamps and revs fit in a double.
    row[field] = value == null ? null : NUMBER_FIELDS.has(field) ? Number(value) : value
  }
  return row
}

/** Only ever interpolates names from the entity's fixed field list. */
function knownFields(entity: EntityName, fields: Record<string, unknown>): string[] {
  const allowed = new Set(fieldsOf(entity))
  return Object.keys(fields).filter((f) => allowed.has(f))
}

export class PgStore implements Store {
  private readonly query: Query

  constructor(query: Query) {
    this.query = query
  }

  async get(entity: EntityName, id: string) {
    const rows = await this.query(`SELECT * FROM ${TABLE[entity]} WHERE id = $1::uuid`, [id])
    return rows[0] ? toRow(entity, rows[0]) : null
  }

  async insert(entity: EntityName, fields: Record<string, unknown> & { id: string }) {
    const names = knownFields(entity, fields)
    const columns = ['id', ...names.map(snake)]
    const params = [fields.id, ...names.map((f) => toParam(f, fields[f]))]
    const values = ['id', ...names].map((f, i) => `$${i + 1}::${SQL_TYPE[f]}`)
    const noteExtra = entity === 'note'
    const rows = await this.query(
      // Re-creating a purged id clears its tombstone, or devices would delete it again.
      `WITH n AS (SELECT nextval('sync_rev_seq') AS r),
            t AS (DELETE FROM purged WHERE id = $1::uuid)
       INSERT INTO ${TABLE[entity]} (${columns.join(', ')}, rev${noteExtra ? ', body_rev' : ''})
       SELECT ${values.join(', ')}, n.r${noteExtra ? ', n.r' : ''} FROM n
       ON CONFLICT (id) DO NOTHING
       RETURNING *`,
      params,
    )
    return rows[0] ? toRow(entity, rows[0]) : null
  }

  async updateIfRev(
    entity: EntityName,
    id: string,
    expectedRev: number,
    changes: Record<string, unknown>,
    bumpBody: boolean,
  ) {
    const names = knownFields(entity, changes)
    if (names.length === 0) return this.get(entity, id)
    const assignments = names.map((f, i) => `${snake(f)} = $${i + 3}::${SQL_TYPE[f]}`)
    assignments.push('rev = n.r')
    if (bumpBody && entity === 'note') assignments.push('body_rev = n.r')
    const rows = await this.query(
      `WITH n AS (SELECT nextval('sync_rev_seq') AS r)
       UPDATE ${TABLE[entity]} AS t SET ${assignments.join(', ')}
       FROM n WHERE t.id = $1::uuid AND t.rev = $2::bigint
       RETURNING t.*`,
      [id, expectedRev, ...names.map((f) => toParam(f, changes[f]))],
    )
    return rows[0] ? toRow(entity, rows[0]) : null
  }

  async purge(entity: EntityName, id: string) {
    const rows = await this.query(
      `WITH n AS (SELECT nextval('sync_rev_seq') AS r),
            d AS (DELETE FROM ${TABLE[entity]} WHERE id = $1::uuid)
       INSERT INTO purged (id, entity, rev) SELECT $1::uuid, $2::text, n.r FROM n
       ON CONFLICT (id) DO UPDATE SET rev = EXCLUDED.rev
       RETURNING rev`,
      [id, entity],
    )
    return Number(rows[0].rev)
  }

  async appliedRev(opId: string) {
    const rows = await this.query(`SELECT rev FROM applied_ops WHERE op_id = $1::uuid`, [opId])
    return rows[0] ? Number(rows[0].rev) : null
  }

  async recordApplied(opId: string, rev: number) {
    await this.query(
      `INSERT INTO applied_ops (op_id, rev) VALUES ($1::uuid, $2::bigint) ON CONFLICT DO NOTHING`,
      [opId, rev],
    )
  }

  async pruneApplied() {
    await this.query(`DELETE FROM applied_ops WHERE created_at < now() - interval '30 days'`)
  }

  async changesSince(since: number, limit: number): Promise<ChangesPage> {
    const records: ChangesPage['records'] = []
    for (const entity of ENTITIES) {
      const rows = await this.query(
        `SELECT * FROM ${TABLE[entity]} WHERE rev > $1::bigint ORDER BY rev LIMIT $2::int`,
        [since, limit],
      )
      for (const row of rows) records.push({ entity, row: toRow(entity, row) })
    }
    const tombstones = await this.query(
      `SELECT id, entity, rev FROM purged WHERE rev > $1::bigint ORDER BY rev LIMIT $2::int`,
      [since, limit],
    )
    return {
      records,
      purged: tombstones.map((t) => ({
        entity: t.entity as EntityName,
        id: String(t.id),
        rev: Number(t.rev),
      })),
    }
  }
}
