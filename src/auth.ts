import { useCallback, useEffect, useState } from 'react'

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; email: string }

const CACHE_KEY = 'notes.user'

function cachedEmail(): string | null {
  try {
    return localStorage.getItem(CACHE_KEY)
  } catch {
    return null
  }
}

function cacheEmail(email: string | null) {
  try {
    if (email) localStorage.setItem(CACHE_KEY, email)
    else localStorage.removeItem(CACHE_KEY)
  } catch {
    // Storage can be unavailable (private mode); the app still works online.
  }
}

/**
 * Tracks who is signed in. The server is the authority, but a previously verified
 * user stays signed in while offline so the app opens without a connection.
 */
export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  const verify = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
      if (res.ok) {
        const { email } = (await res.json()) as { email: string }
        cacheEmail(email)
        setState({ status: 'signedIn', email })
      } else if (res.status === 401) {
        cacheEmail(null)
        setState({ status: 'signedOut' })
      } else {
        throw new Error(`Unexpected status ${res.status}`)
      }
    } catch {
      // Offline or server trouble: trust the last verified user rather than lock you out.
      const email = cachedEmail()
      setState(email ? { status: 'signedIn', email } : { status: 'signedOut' })
    }
  }, [])

  useEffect(() => {
    void verify()
    // Re-check when the connection returns, so an expired session is noticed.
    window.addEventListener('online', verify)
    return () => window.removeEventListener('online', verify)
  }, [verify])

  const signOut = useCallback(async () => {
    cacheEmail(null)
    setState({ status: 'signedOut' })
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
    } catch {
      // Offline: the local session is cleared; the cookie expires or is cleared next time.
    }
  }, [])

  return { state, signOut, refresh: verify }
}
