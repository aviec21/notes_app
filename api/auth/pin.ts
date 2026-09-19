import { isValidPin } from '../../shared/config.js'
import { db } from '../_lib/db.js'
import { json, readJson } from '../_lib/http.js'
import { checkPin } from '../_lib/pin.js'
import { DEFAULT_PIN, hashPin } from '../_lib/pinhash.js'
import { createSessionToken, readSession, sessionCookie } from '../_lib/session.js'

// Change the PIN. Requires being signed in AND knowing the current PIN.
export async function POST(request: Request) {
  try {
    if (!(await readSession(request))) return json({ error: 'unauthorized' }, 401)

    const { currentPin, newPin } = await readJson(request)
    if (!isValidPin(currentPin) || !isValidPin(newPin)) return json({ error: 'invalid_format' }, 400)
    if (newPin === DEFAULT_PIN) return json({ error: 'same_as_default' }, 400)

    const check = await checkPin(currentPin)
    if (!check.ok) {
      if (check.lockedForSeconds) {
        return json({ error: 'locked', retryAfter: check.lockedForSeconds }, 429)
      }
      return json({ error: 'wrong_pin' }, 401)
    }

    const sql = await db()
    // Bumping session_version signs out every other device; this one gets a fresh cookie.
    const [row] = await sql`
      UPDATE auth_pin SET
        pin_hash = ${await hashPin(newPin)},
        is_default = false,
        session_version = session_version + 1,
        failed_count = 0,
        locked_until = NULL,
        updated_at = now()
      WHERE id = 1
      RETURNING session_version`

    const token = await createSessionToken(row.session_version)
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(token, request) })
  } catch (err) {
    console.error('PIN change failed:', err instanceof Error ? err.message : err)
    return json({ error: 'server' }, 500)
  }
}
