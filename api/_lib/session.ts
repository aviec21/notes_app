import { jwtVerify, SignJWT } from 'jose'
import { SESSION_COOKIE, SESSION_DAYS } from '../../shared/config.js'

const DAY = 24 * 60 * 60

export interface Session {
  email: string
  issuedAt: number // seconds since epoch
}

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET is missing or shorter than 32 characters')
  }
  return new TextEncoder().encode(secret)
}

export function allowedEmail(): string {
  const email = process.env.ALLOWED_EMAIL?.trim().toLowerCase()
  if (!email) throw new Error('ALLOWED_EMAIL is not set')
  return email
}

export async function createSessionToken(email: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey())
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim())
  }
  return undefined
}

/** Returns the signed-in user, or null if there is no valid, allowlisted session. */
export async function readSession(request: Request): Promise<Session | null> {
  const token = readCookie(request, SESSION_COOKIE)
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] })
    // Re-check the allowlist on every request so removing an email revokes access.
    if (!payload.sub || payload.sub !== allowedEmail() || !payload.iat) return null
    return { email: payload.sub, issuedAt: payload.iat }
  } catch {
    return null
  }
}

export function sessionCookie(token: string, request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * DAY}${secure}`
}

export function clearedSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`
}

/** Sessions older than this get a fresh cookie, so regular use never signs you out. */
export const RENEW_AFTER_SECONDS = 7 * DAY
