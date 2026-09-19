import {
  createSessionToken,
  readSession,
  RENEW_AFTER_SECONDS,
  sessionCookie,
} from '../_lib/session.js'

export async function GET(request: Request) {
  const session = await readSession(request)
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const headers = new Headers({ 'Cache-Control': 'no-store' })
  if (Date.now() / 1000 - session.issuedAt > RENEW_AFTER_SECONDS) {
    headers.append('Set-Cookie', sessionCookie(await createSessionToken(session.email), request))
  }
  return Response.json({ email: session.email }, { headers })
}
