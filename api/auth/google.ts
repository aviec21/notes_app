import { createRemoteJWKSet, jwtVerify } from 'jose'
import { GOOGLE_CLIENT_ID } from '../../shared/config.js'
import { allowedEmail, createSessionToken, readCookie, sessionCookie } from '../_lib/session.js'

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

function redirect(location: string, cookie?: string): Response {
  const headers = new Headers({ Location: location })
  if (cookie) headers.append('Set-Cookie', cookie)
  // 303 turns Google's cross-site POST into a plain GET of the app.
  return new Response(null, { status: 303, headers })
}

// Google's "Sign in with Google" (redirect mode) POSTs the ID token here.
export async function POST(request: Request) {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return redirect('/?error=invalid')
  }

  // Double-submit CSRF check that Google's sign-in flow asks us to perform.
  const csrfBody = form.get('g_csrf_token')
  const csrfCookie = readCookie(request, 'g_csrf_token')
  const credential = form.get('credential')
  if (
    typeof csrfBody !== 'string' ||
    !csrfCookie ||
    csrfBody !== csrfCookie ||
    typeof credential !== 'string'
  ) {
    return redirect('/?error=invalid')
  }

  try {
    const { payload } = await jwtVerify(credential, googleKeys, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: GOOGLE_CLIENT_ID,
    })
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : ''
    if (!email || payload.email_verified !== true) return redirect('/?error=invalid')
    if (email !== allowedEmail()) return redirect('/?error=not_allowed')

    const token = await createSessionToken(email)
    return redirect('/', sessionCookie(token, request))
  } catch (err) {
    console.error('Google sign-in failed:', err instanceof Error ? err.message : err)
    return redirect('/?error=invalid')
  }
}
