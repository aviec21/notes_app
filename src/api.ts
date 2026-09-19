export const OFFLINE_MESSAGE = 'You are offline. Connect to the internet and try again.'

/** POSTs JSON to the API. Resolves to null when the network is unreachable. */
export async function postJson(path: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return null
  }
}

/** Turns a 429 "locked" response into a readable wait time. */
export async function lockedMessage(res: Response): Promise<string> {
  const { retryAfter } = (await res.json().catch(() => ({}))) as { retryAfter?: number }
  const seconds = retryAfter ?? 60
  const wait = seconds >= 90 ? `${Math.ceil(seconds / 60)} minutes` : `${seconds} seconds`
  return `Too many wrong attempts. Try again in ${wait}.`
}
