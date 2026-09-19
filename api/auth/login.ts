import { isValidPin } from '../../shared/config.js'
import { json, readJson } from '../_lib/http.js'
import { checkPin } from '../_lib/pin.js'
import { createSessionToken, sessionCookie } from '../_lib/session.js'

export async function POST(request: Request) {
  try {
    const { pin } = await readJson(request)
    if (!isValidPin(pin)) return json({ error: 'invalid' }, 401)

    const result = await checkPin(pin)
    if (!result.ok) {
      if (result.lockedForSeconds) {
        return json({ error: 'locked', retryAfter: result.lockedForSeconds }, 429)
      }
      return json({ error: 'invalid' }, 401)
    }

    const token = await createSessionToken(result.sessionVersion)
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(token, request) })
  } catch (err) {
    console.error('PIN sign-in failed:', err instanceof Error ? err.message : err)
    return json({ error: 'server' }, 500)
  }
}
