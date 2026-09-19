import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

// Used only until you change the PIN inside the app.
export const DEFAULT_PIN = '123456'

const derive = promisify(scrypt) as (pin: string, salt: Buffer, keyLength: number) => Promise<Buffer>

/** Salted scrypt hash, stored as "salt:hash" in hex. */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(pin, salt, 32)
  return `${salt.toString('hex')}:${key.toString('hex')}`
}

export async function pinMatchesHash(pin: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(':')
  if (!saltHex || !keyHex) return false
  const expected = Buffer.from(keyHex, 'hex')
  const actual = await derive(pin, Buffer.from(saltHex, 'hex'), expected.length)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
