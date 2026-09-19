import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { CODE_LENGTH } from '../../shared/config.js'
import { secretKey } from './session.js'

export const MAX_ATTEMPTS = 5

export function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0')
}

/** Keyed hash, so a leaked database row can't be brute-forced offline. */
export function hashCode(code: string): string {
  return createHmac('sha256', secretKey()).update(code).digest('hex')
}

export function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function isValidCode(value: unknown): value is string {
  return typeof value === 'string' && new RegExp(`^\\d{${CODE_LENGTH}}$`).test(value)
}
