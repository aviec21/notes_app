import { jwtVerify, SignJWT } from 'jose'
import { SESSION_COOKIE, SESSION_DAYS } from '../../shared/config.js'
import { db } from './db.js'

const DAY = 24 * 60 * 60

export interface Session {
  version: number
  issuedAt: number // seconds since epoch
  defaultPin: boolean
}

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET is missing or shorter than 32 characters')
  }
  return new TextEncoder().encode(secret)
}

/** `version` ties the cookie to the current PIN, so changing the PIN signs out other devices. */
export async function createSessionToken(version: number): Promise<string> {
  return new SignJWT({ v: version })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('owner')
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

/**
 * Returns the current session, or null if there is no valid one. A database failure
 * throws instead of returning null, so callers can tell "signed out" from "server down".
 */
export async function readSession(request: Request): Promise<Session | null> {
  const token = readCookie(request, SESSION_COOKIE)
  if (!token) return null

  let version: number
  let issuedAt: number
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] })
    if (payload.sub !== 'owner' || typeof payload.v !== 'number' || !payload.iat) return null
    version = payload.v
    issuedAt = payload.iat
  } catch {
    return null
  }

  const sql = await db()
  const [row] = await sql`SELECT session_version, is_default FROM auth_pin WHERE id = 1`
  if (!row || row.session_version !== version) return null
  return { version, issuedAt, defaultPin: row.is_default }
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
