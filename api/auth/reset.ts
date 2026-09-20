import { formatRecoveryCode, isValidPin, normalizeRecoveryCode } from '../../shared/config.js'
import { db } from '../_lib/db.js'
import { json, readJson } from '../_lib/http.js'
import { checkSecret } from '../_lib/pin.js'
import { DEFAULT_PIN, hashPin } from '../_lib/pinhash.js'
import { generateRecoveryCode } from '../_lib/recovery.js'
import { createSessionToken, sessionCookie } from '../_lib/session.js'

// Forgotten PIN: a valid recovery code sets a new PIN. The code works once; a fresh one is
// issued in its place. Every other signed-in device is signed out.
export async function POST(request: Request) {
  try {
    const { recoveryCode, newPin } = await readJson(request)
    const code = normalizeRecoveryCode(recoveryCode)
    if (!code) return json({ error: 'invalid' }, 401)
    if (!isValidPin(newPin)) return json({ error: 'invalid_pin' }, 400)
    if (newPin === DEFAULT_PIN) return json({ error: 'same_as_default' }, 400)

    const check = await checkSecret('recovery', code)
    if (!check.ok) {
      if (check.lockedForSeconds) return json({ error: 'locked', retryAfter: check.lockedForSeconds }, 429)
      return json({ error: 'invalid' }, 401)
    }

    const nextCode = generateRecoveryCode()
    const sql = await db()
    // Only succeeds if the code that was just verified is still the current one, so two
    // requests racing with the same code cannot both use it.
    const [row] = await sql`
      UPDATE auth_pin SET
        pin_hash = ${await hashPin(newPin)},
        is_default = false,
        session_version = session_version + 1,
        recovery_hash = ${await hashPin(nextCode)},
        recovery_set_at = now(),
        failed_count = 0,
        locked_until = NULL,
        updated_at = now()
      WHERE id = 1 AND recovery_hash = ${check.hash}
      RETURNING session_version`
    if (!row) return json({ error: 'invalid' }, 401)

    const token = await createSessionToken(row.session_version)
    return json({ ok: true, code: formatRecoveryCode(nextCode) }, 200, {
      'Set-Cookie': sessionCookie(token, request),
    })
  } catch (err) {
    console.error('PIN reset failed:', err instanceof Error ? err.message : err)
    return json({ error: 'server' }, 500)
  }
}
