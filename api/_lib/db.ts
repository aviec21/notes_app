import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { DEFAULT_PIN, hashPin } from './pinhash.js'

let ready: Promise<void> | undefined

async function prepare(sql: NeonQueryFunction<false, false>) {
  await sql`
    CREATE TABLE IF NOT EXISTS auth_pin (
      id              int PRIMARY KEY CHECK (id = 1),
      pin_hash        text        NOT NULL,
      is_default      boolean     NOT NULL DEFAULT false,
      session_version int         NOT NULL DEFAULT 1,
      failed_count    int         NOT NULL DEFAULT 0,
      locked_until    timestamptz,
      updated_at      timestamptz NOT NULL DEFAULT now()
    )`
  // Leftover from the abandoned emailed-code sign-in.
  await sql`DROP TABLE IF EXISTS login_codes`

  const existing = await sql`SELECT 1 FROM auth_pin WHERE id = 1`
  if (existing.length === 0) {
    const hash = await hashPin(DEFAULT_PIN)
    await sql`
      INSERT INTO auth_pin (id, pin_hash, is_default) VALUES (1, ${hash}, true)
      ON CONFLICT (id) DO NOTHING`
  }
}

/**
 * Returns a SQL tagged-template client for Neon, creating the PIN table on first use.
 * (The notes schema will get proper migrations when the sync phase starts.)
 */
export async function db() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL
  if (!url) throw new Error('DATABASE_URL is not set (add the Neon database in Vercel Storage)')
  const sql = neon(url)

  ready ??= prepare(sql)
  try {
    await ready
  } catch (err) {
    ready = undefined // retry on the next request instead of caching the failure
    throw err
  }
  return sql
}
