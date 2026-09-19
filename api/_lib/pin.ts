import { db } from './db.js'
import { pinMatchesHash } from './pinhash.js'

const MAX_FAILURES = 5

export type PinCheck =
  | { ok: true; sessionVersion: number }
  | { ok: false; lockedForSeconds?: number }

/**
 * Checks a PIN with brute-force protection. Every attempt is counted before the
 * comparison (so parallel guesses can't sneak past the limit); after 5 failures the
 * PIN is locked for 1 minute, doubling with each further failure up to 24 hours.
 */
export async function checkPin(pin: string): Promise<PinCheck> {
  const sql = await db()

  const [row] = await sql`
    UPDATE auth_pin SET
      failed_count = failed_count + 1,
      locked_until = CASE WHEN failed_count + 1 >= ${MAX_FAILURES}
        THEN now() + make_interval(mins => LEAST(power(2, failed_count + 1 - ${MAX_FAILURES}), 1440)::int)
        ELSE locked_until END
    WHERE id = 1 AND (locked_until IS NULL OR locked_until <= now())
    RETURNING pin_hash, session_version`

  if (!row) {
    const [lock] = await sql`
      SELECT ceil(extract(epoch FROM locked_until - now()))::int AS seconds
      FROM auth_pin WHERE id = 1`
    return { ok: false, lockedForSeconds: Math.max(lock?.seconds ?? 60, 1) }
  }

  if (!(await pinMatchesHash(pin, row.pin_hash))) return { ok: false }

  await sql`UPDATE auth_pin SET failed_count = 0, locked_until = NULL WHERE id = 1`
  return { ok: true, sessionVersion: row.session_version }
}
