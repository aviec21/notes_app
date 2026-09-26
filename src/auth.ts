import { useCallback, useEffect, useState } from 'react'

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; defaultPin: boolean; hasRecovery: boolean }

const CACHE_KEY = 'notes.signedIn'

function wasSignedIn(): boolean {
  try {
    return localStorage.getItem(CACHE_KEY) === '1'
  } catch {
    return false
  }
}

function rememberSignedIn(value: boolean) {
  try {
    if (value) localStorage.setItem(CACHE_KEY, '1')
    else localStorage.removeItem(CACHE_KEY)
  } catch {
    // Storage can be unavailable (private mode); the app still works online.
  }
}

/**
 * Tracks whether you are signed in. The server is the authority, but a previously
 * verified device stays signed in while offline so the app opens without a connection.
 */
export function useAuth() {
  // A device that was signed in opens straight onto its notes (they are stored on the device),
  // and the server check happens in the background. Waiting for that check first would keep
  // a phone on a blank "Loading…" screen for as long as the server (and its database) needs
  // to wake up. If the server says the session ended, the sign-in screen appears then.
  const [state, setState] = useState<AuthState>(() =>
    wasSignedIn() ? { status: 'signedIn', defaultPin: false, hasRecovery: true } : { status: 'loading' },
  )

  const verify = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
      if (res.ok) {
        const { defaultPin, hasRecovery } = (await res.json()) as { defaultPin: boolean; hasRecovery?: boolean }
        rememberSignedIn(true)
        setState({ status: 'signedIn', defaultPin, hasRecovery: hasRecovery ?? true })
      } else if (res.status === 401) {
        rememberSignedIn(false)
        setState({ status: 'signedOut' })
      } else {
        throw new Error(`Unexpected status ${res.status}`)
      }
    } catch {
      // Offline or server trouble: trust the last verified state rather than lock you out.
      // (Offline we cannot know whether a recovery code exists, so we do not nag about it.)
      setState(wasSignedIn() ? { status: 'signedIn', defaultPin: false, hasRecovery: true } : { status: 'signedOut' })
    }
  }, [])

  useEffect(() => {
    void verify()
    // Re-check when the connection returns, so an expired session is noticed.
    window.addEventListener('online', verify)
    return () => window.removeEventListener('online', verify)
  }, [verify])

  const signOut = useCallback(async () => {
    rememberSignedIn(false)
    setState({ status: 'signedOut' })
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
    } catch {
      // Offline: the local session is cleared; the cookie is cleared or expires later.
    }
  }, [])

  return { state, signOut, refresh: verify }
}
