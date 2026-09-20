/** Runs one parameterised SQL statement and returns its rows. */
export type Query = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>

interface Migration {
  id: number
  statements: string[]
}

// Append-only: never edit a migration that has shipped, add a new one instead.
// Every statement is idempotent, so a half-finished run can safely be repeated.
const MIGRATIONS: Migration[] = [
  {
    id: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS auth_pin (
         id              int PRIMARY KEY CHECK (id = 1),
         pin_hash        text        NOT NULL,
         is_default      boolean     NOT NULL DEFAULT false,
         session_version int         NOT NULL DEFAULT 1,
         failed_count    int         NOT NULL DEFAULT 0,
         locked_until    timestamptz,
         updated_at      timestamptz NOT NULL DEFAULT now()
       )`,
      // Leftover from the abandoned emailed-code sign-in.
      `DROP TABLE IF EXISTS login_codes`,
    ],
  },
  {
    id: 2,
    statements: [
      // One global counter orders every change; devices pull "everything after rev N".
      `CREATE SEQUENCE IF NOT EXISTS sync_rev_seq`,
      `CREATE TABLE IF NOT EXISTS folders (
         id           uuid PRIMARY KEY,
         name         text    NOT NULL,
         color        text,
         pinned       boolean NOT NULL DEFAULT false,
         pinned_at    bigint,
         created_at   bigint  NOT NULL,
         updated_at   bigint  NOT NULL,
         deleted_at   bigint,
         delete_batch uuid,
         rev          bigint  NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS notes (
         id           uuid PRIMARY KEY,
         folder_id    uuid,
         title        text    NOT NULL DEFAULT '',
         content      jsonb   NOT NULL,
         content_text text    NOT NULL DEFAULT '',
         tag_ids      jsonb   NOT NULL DEFAULT '[]',
         pinned       boolean NOT NULL DEFAULT false,
         pinned_at    bigint,
         created_at   bigint  NOT NULL,
         updated_at   bigint  NOT NULL,
         deleted_at   bigint,
         delete_batch uuid,
         rev          bigint  NOT NULL,
         body_rev     bigint  NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS tags (
         id         uuid PRIMARY KEY,
         name       text   NOT NULL,
         color      text,
         created_at bigint NOT NULL,
         updated_at bigint NOT NULL,
         rev        bigint NOT NULL
       )`,
      // Tombstones: tell other devices a record was permanently deleted.
      `CREATE TABLE IF NOT EXISTS purged (
         id     uuid PRIMARY KEY,
         entity text   NOT NULL,
         rev    bigint NOT NULL
       )`,
      // Remembers which pushed changes were applied, so a retried push is harmless.
      `CREATE TABLE IF NOT EXISTS applied_ops (
         op_id      uuid PRIMARY KEY,
         rev        bigint      NOT NULL,
         created_at timestamptz NOT NULL DEFAULT now()
       )`,
      `CREATE INDEX IF NOT EXISTS notes_rev_idx   ON notes (rev)`,
      `CREATE INDEX IF NOT EXISTS folders_rev_idx ON folders (rev)`,
      `CREATE INDEX IF NOT EXISTS tags_rev_idx    ON tags (rev)`,
      `CREATE INDEX IF NOT EXISTS purged_rev_idx  ON purged (rev)`,
    ],
  },
  {
    id: 3,
    statements: [
      // Pictures live in the database, so they are private behind the same sign-in.
      `CREATE TABLE IF NOT EXISTS images (
         id         uuid PRIMARY KEY,
         note_id    uuid,
         mime       text        NOT NULL,
         size       int         NOT NULL,
         data       bytea       NOT NULL,
         created_at timestamptz NOT NULL DEFAULT now()
       )`,
    ],
  },
  {
    id: 4,
    statements: [
      // A backup way in if the PIN is forgotten: only a salted hash of the code is kept.
      `ALTER TABLE auth_pin ADD COLUMN IF NOT EXISTS recovery_hash text`,
      `ALTER TABLE auth_pin ADD COLUMN IF NOT EXISTS recovery_set_at timestamptz`,
    ],
  },
]

export async function runMigrations(query: Query): Promise<void> {
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id         int PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`)
  const done = new Set((await query(`SELECT id FROM schema_migrations`)).map((r) => Number(r.id)))
  for (const migration of MIGRATIONS) {
    if (done.has(migration.id)) continue
    for (const statement of migration.statements) await query(statement)
    await query(`INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING`, [migration.id])
  }
}
