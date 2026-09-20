// Public values shared by the browser and the API. Nothing secret belongs here.

export const SESSION_COOKIE = 'session'
export const SESSION_DAYS = 60

export const PIN_MIN_LENGTH = 6
export const PIN_MAX_LENGTH = 12

// Recovery code: 16 characters from an alphabet without look-alikes (no 0/O, 1/I/L), shown as
// four groups of four. About 79 bits, so it cannot be guessed, unlike a PIN.
export const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const RECOVERY_LENGTH = 16

/**
 * Accepts a recovery code however it was typed (lower case, spaces, dashes) and returns the
 * 16 plain characters, or null if it cannot be a valid code.
 */
export function normalizeRecoveryCode(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 64) return null
  const plain = input.toUpperCase().replace(/[\s-]/g, '')
  if (plain.length !== RECOVERY_LENGTH) return null
  for (const ch of plain) if (!RECOVERY_ALPHABET.includes(ch)) return null
  return plain
}

/** K7QM2XPD9HRT4WNB -> K7QM-2XPD-9HRT-4WNB */
export function formatRecoveryCode(plain: string): string {
  return plain.match(/.{1,4}/g)?.join('-') ?? plain
}

export function isValidPin(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= PIN_MIN_LENGTH &&
    value.length <= PIN_MAX_LENGTH &&
    /^\d+$/.test(value)
  )
}
