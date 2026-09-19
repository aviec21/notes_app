import { CODE_TTL_MINUTES } from '../../shared/config.js'
import { db } from '../_lib/db.js'
import { json, normalizeEmail, readJson } from '../_lib/http.js'
import { sendCodeEmail } from '../_lib/mail.js'
import { generateCode, hashCode } from '../_lib/otp.js'
import { allowedEmail } from '../_lib/session.js'

const MAX_PER_HOUR = 5
const COOLDOWN_SECONDS = 60

// Step 1: email a sign-in code. The answer is identical for any address that is not
// allowlisted, so this endpoint reveals nothing to strangers.
export async function POST(request: Request) {
  try {
    const email = normalizeEmail((await readJson(request)).email)
    if (email !== allowedEmail()) return json({ ok: true })

    const sql = await db()
    await sql`DELETE FROM login_codes WHERE created_at < now() - interval '1 day'`

    const [recent] = await sql`
      SELECT count(*)::int AS total,
             coalesce(max(created_at) > now() - make_interval(secs => ${COOLDOWN_SECONDS}), false) AS cooling
      FROM login_codes
      WHERE created_at > now() - interval '1 hour'`
    if (recent.cooling) return json({ error: 'too_soon' }, 429)
    if (recent.total >= MAX_PER_HOUR) return json({ error: 'too_many' }, 429)

    const code = generateCode()
    const [row] = await sql`
      INSERT INTO login_codes (code_hash, expires_at)
      VALUES (${hashCode(code)}, now() + make_interval(mins => ${CODE_TTL_MINUTES}))
      RETURNING id`

    try {
      await sendCodeEmail(email, code)
    } catch (err) {
      await sql`DELETE FROM login_codes WHERE id = ${row.id}`
      throw err
    }
    return json({ ok: true })
  } catch (err) {
    console.error('Sign-in code request failed:', err instanceof Error ? err.message : err)
    return json({ error: 'server' }, 500)
  }
}
