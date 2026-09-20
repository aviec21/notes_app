import { formatRecoveryCode, isValidPin } from '../../shared/config.js'
import { db } from '../_lib/db.js'
import { json, readJson } from '../_lib/http.js'
import { checkPin } from '../_lib/pin.js'
import { hashPin } from '../_lib/pinhash.js'
import { generateRecoveryCode } from '../_lib/recovery.js'
import { readSession } from '../_lib/session.js'

// Creates (or replaces) the recovery code. Signed in AND knowing the current PIN is required,
// so a borrowed unlocked phone cannot mint a code. The code is returned once and never stored.
export async function POST(request: Request) {
  try {
    if (!(await readSession(request))) return json({ error: 'unauthorized' }, 401)

    const { pin } = await readJson(request)
    if (!isValidPin(pin)) return json({ error: 'wrong_pin' }, 401)

    const check = await checkPin(pin)
    if (!check.ok) {
      if (check.lockedForSeconds) return json({ error: 'locked', retryAfter: check.lockedForSeconds }, 429)
      return json({ error: 'wrong_pin' }, 401)
    }

    const code = generateRecoveryCode()
    const sql = await db()
    await sql`
      UPDATE auth_pin SET recovery_hash = ${await hashPin(code)}, recovery_set_at = now()
      WHERE id = 1`
    return json({ code: formatRecoveryCode(code) })
  } catch (err) {
    console.error('Recovery code creation failed:', err instanceof Error ? err.message : err)
    return json({ error: 'server' }, 500)
  }
}
