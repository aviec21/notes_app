import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { runMigrations, type Query } from './migrations.js'
import { DEFAULT_PIN, hashPin } from './pinhash.js'
import { PgStore } from './store.js'

let ready: Promise<void> | undefined

async function prepare(sql: NeonQueryFunction<false, false>) {
  await runMigrations((text, params) => sql.query(text, params))

  const existing = await sql`SELECT 1 FROM auth_pin WHERE id = 1`
  if (existing.length === 0) {
    const hash = await hashPin(DEFAULT_PIN)
    await sql`
      INSERT INTO auth_pin (id, pin_hash, is_default) VALUES (1, ${hash}, true)
      ON CONFLICT (id) DO NOTHING`
  }
}

/**
 * Returns a SQL tagged-template client for Neon. The first call in each server instance
 * also applies any pending schema migrations.
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

export async function getStore(): Promise<PgStore> {
  const sql = await db()
  const query: Query = (text, params) => sql.query(text, params)
  return new PgStore(query)
}
