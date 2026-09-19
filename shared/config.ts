// Public values shared by the browser and the API. Nothing secret belongs here.

export const SESSION_COOKIE = 'session'
export const SESSION_DAYS = 60

export const PIN_MIN_LENGTH = 6
export const PIN_MAX_LENGTH = 12

export function isValidPin(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= PIN_MIN_LENGTH &&
    value.length <= PIN_MAX_LENGTH &&
    /^\d+$/.test(value)
  )
}
