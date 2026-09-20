import { db } from './db.js'
import { pinMatchesHash } from './pinhash.js'

const MAX_FAILURES = 5

export type SecretCheck =
  | { ok: true; sessionVersion: number; hash: string }
  | { ok: false; lockedForSeconds?: number }

/** Kept for the callers that only deal with the PIN. */
export type PinCheck = SecretCheck

/**
 * Checks the PIN, or the recovery code, with brute-force protection. Both share ONE failure
 * counter, so guessing one cannot be swapped for guessing the other. Every attempt is
 * counted before the comparison (so parallel guesses can't sneak past the limit); after 5
 * failures sign-in locks for 1 minute, doubling with each further failure up to 24 hours.
 */
export async function checkSecret(kind: 'pin' | 'recovery', secret: string): Promise<SecretCheck> {
  const sql = await db()

  const [row] = await sql`
    UPDATE auth_pin SET
      failed_count = failed_count + 1,
      locked_until = CASE WHEN failed_count + 1 >= ${MAX_FAILURES}
        THEN now() + make_interval(mins => LEAST(power(2, failed_count + 1 - ${MAX_FAILURES}), 1440)::int)
        ELSE locked_until END
    WHERE id = 1 AND (locked_until IS NULL OR locked_until <= now())
    RETURNING pin_hash, recovery_hash, session_version`

  if (!row) {
    const [lock] = await sql`
      SELECT ceil(extract(epoch FROM locked_until - now()))::int AS seconds
      FROM auth_pin WHERE id = 1`
    return { ok: false, lockedForSeconds: Math.max(lock?.seconds ?? 60, 1) }
  }

  // No recovery code set counts as a wrong guess too, so probing reveals nothing.
  const stored: string | null = kind === 'pin' ? row.pin_hash : row.recovery_hash
  if (!stored || !(await pinMatchesHash(secret, stored))) return { ok: false }

  await sql`UPDATE auth_pin SET failed_count = 0, locked_until = NULL WHERE id = 1`
  return { ok: true, sessionVersion: row.session_version, hash: stored }
}

export const checkPin = (pin: string) => checkSecret('pin', pin)
