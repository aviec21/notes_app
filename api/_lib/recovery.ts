import { randomInt } from 'node:crypto'
import { RECOVERY_ALPHABET, RECOVERY_LENGTH } from '../../shared/config.js'

/** A fresh random recovery code, as 16 plain characters (format it with formatRecoveryCode). */
export function generateRecoveryCode(): string {
  let code = ''
  for (let i = 0; i < RECOVERY_LENGTH; i++) code += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]
  return code
}
