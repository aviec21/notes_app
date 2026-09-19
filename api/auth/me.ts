import { json } from '../_lib/http.js'
import {
  createSessionToken,
  readSession,
  RENEW_AFTER_SECONDS,
  sessionCookie,
} from '../_lib/session.js'

export async function GET(request: Request) {
  try {
    const session = await readSession(request)
    if (!session) return json({ error: 'unauthorized' }, 401)

    const headers = new Headers()
    if (Date.now() / 1000 - session.issuedAt > RENEW_AFTER_SECONDS) {
      headers.append('Set-Cookie', sessionCookie(await createSessionToken(session.version), request))
    }
    return json({ defaultPin: session.defaultPin }, 200, headers)
  } catch (err) {
    console.error('Session check failed:', err instanceof Error ? err.message : err)
    return json({ error: 'server' }, 500)
  }
}
