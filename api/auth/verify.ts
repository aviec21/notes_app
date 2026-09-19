import { db } from '../_lib/db.js'
import { json, normalizeEmail, readJson } from '../_lib/http.js'
import { hashCode, hashesMatch, isValidCode, MAX_ATTEMPTS } from '../_lib/otp.js'
import { allowedEmail, createSessionToken, sessionCookie } from '../_lib/session.js'

// Step 2: exchange the emailed code for a 60-day session cookie.
export async function POST(request: Request) {
  const invalid = () => json({ error: 'invalid' }, 401)
  try {
    const body = await readJson(request)
    const email = normalizeEmail(body.email)
    if (email !== allowedEmail() || !isValidCode(body.code)) return invalid()

    const sql = await db()

    // Count the attempt before comparing, so parallel guesses can't exceed the limit.
    const [candidate] = await sql`
      UPDATE login_codes SET attempts = attempts + 1
      WHERE id = (
        SELECT id FROM login_codes
        WHERE NOT consumed AND expires_at > now() AND attempts < ${MAX_ATTEMPTS}
        ORDER BY created_at DESC LIMIT 1
      ) AND attempts < ${MAX_ATTEMPTS}
      RETURNING id, code_hash`
    if (!candidate || !hashesMatch(hashCode(body.code), candidate.code_hash)) return invalid()

    // Single use: only one request can flip `consumed`.
    const used = await sql`
      UPDATE login_codes SET consumed = true
      WHERE id = ${candidate.id} AND NOT consumed RETURNING id`
    if (used.length === 0) return invalid()

    const token = await createSessionToken(email)
    return Response.json(
      { email },
      { headers: { 'Set-Cookie': sessionCookie(token, request), 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    console.error('Sign-in verification failed:', err instanceof Error ? err.message : err)
    return json({ error: 'server' }, 500)
  }
}
