import { useEffect, useRef, useState } from 'react'
import { GOOGLE_CLIENT_ID } from '../../shared/config'

interface GoogleId {
  initialize(config: {
    client_id: string
    ux_mode: 'redirect'
    login_uri: string
  }): void
  renderButton(parent: HTMLElement, options: Record<string, string | number>): void
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } }
  }
}

const ERRORS: Record<string, string> = {
  not_allowed: 'That Google account is not allowed to use this app.',
  invalid: 'Sign-in could not be verified. Please try again.',
}

function takeErrorFromUrl(): string | null {
  const code = new URLSearchParams(window.location.search).get('error')
  if (!code) return null
  window.history.replaceState(null, '', window.location.pathname)
  return ERRORS[code] ?? ERRORS.invalid
}

export default function LoginScreen() {
  const buttonRef = useRef<HTMLDivElement>(null)
  const [error] = useState(takeErrorFromUrl)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    const render = () => {
      const id = window.google?.accounts.id
      if (!id || !buttonRef.current) return
      // Redirect mode works in installed PWAs and browsers that block pop-ups.
      id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        ux_mode: 'redirect',
        login_uri: `${window.location.origin}/api/auth/google`,
      })
      id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
        width: 260,
      })
    }

    if (window.google) {
      render()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = render
    script.onerror = () => setLoadFailed(true)
    document.head.appendChild(script)
    return () => script.remove()
  }, [])

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <h1 className="text-3xl font-semibold">Notes</h1>
      <p style={{ color: 'var(--muted)' }}>Sign in to open your notes.</p>
      {error && (
        <p role="alert" className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {error}
        </p>
      )}
      <div ref={buttonRef} className="min-h-11" />
      {loadFailed && (
        <p role="alert" className="text-sm" style={{ color: 'var(--muted)' }}>
          Could not load Google sign-in. Check your connection and reload.
        </p>
      )}
    </main>
  )
}
