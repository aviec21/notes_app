import { neon } from '@neondatabase/serverless'

let ready: Promise<void> | undefined

/**
 * Returns a SQL tagged-template client for Neon, creating the auth table on first use.
 * (The notes schema will get proper migrations when the sync phase starts.)
 */
export async function db() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL
  if (!url) throw new Error('DATABASE_URL is not set (add the Neon database in Vercel Storage)')
  const sql = neon(url)

  ready ??= sql`
    CREATE TABLE IF NOT EXISTS login_codes (
      id         bigserial PRIMARY KEY,
      code_hash  text        NOT NULL,
      expires_at timestamptz NOT NULL,
      attempts   int         NOT NULL DEFAULT 0,
      consumed   boolean     NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `.then(() => undefined)

  try {
    await ready
  } catch (err) {
    ready = undefined // retry on the next request instead of caching the failure
    throw err
  }
  return sql
}
