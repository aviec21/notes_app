import type { PullResponse, PushResponse, SyncOp } from '../../shared/sync'

export interface Transport {
  push(ops: SyncOp[]): Promise<PushResponse>
  pull(since: number): Promise<PullResponse>
}

/** The server says this device is not signed in (or the PIN changed). */
export class AuthError extends Error {}
/** The server could not be reached: offline, or the connection dropped. */
export class NetworkError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, { credentials: 'same-origin', ...init })
  } catch {
    throw new NetworkError('Network unreachable')
  }
  if (res.status === 401) throw new AuthError('Not signed in')
  if (!res.ok) throw new Error(`Server responded ${res.status}`)
  return (await res.json()) as T
}

export const httpTransport: Transport = {
  push: (ops) =>
    request<PushResponse>('/api/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ops }),
    }),
  pull: (since) => request<PullResponse>(`/api/sync/pull?since=${since}`),
}
