import { useEffect, useState } from 'react'
import { useAuth } from './auth'
import LoginScreen from './components/LoginScreen'
import { useTheme } from './theme'

type ApiState = 'checking' | 'ok' | 'unreachable'

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

const THEME_LABEL = { system: 'System', light: 'Light', dark: 'Dark' } as const

function Home({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const online = useOnline()
  const { theme, cycle } = useTheme()
  const [api, setApi] = useState<ApiState>('checking')

  useEffect(() => {
    if (!online) return
    let cancelled = false
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(() => !cancelled && setApi('ok'))
      .catch(() => !cancelled && setApi('unreachable'))
    return () => {
      cancelled = true
    }
  }, [online])

  const apiLabel = !online
    ? 'Offline (app still works)'
    : api === 'checking'
      ? 'Checking…'
      : api === 'ok'
        ? 'Connected'
        : 'Unreachable (expected in local dev)'

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-10">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Notes</h1>
        <button
          type="button"
          onClick={cycle}
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          aria-label={`Theme: ${THEME_LABEL[theme]}. Tap to change.`}
        >
          Theme: {THEME_LABEL[theme]}
        </button>
      </header>
      <p style={{ color: 'var(--muted)' }}>
        Signed in. Notes, folders, tags and sync come next.
      </p>
      <dl
        className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl p-4 text-sm"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <dt style={{ color: 'var(--muted)' }}>Account</dt>
        <dd className="break-all">{email}</dd>
        <dt style={{ color: 'var(--muted)' }}>Network</dt>
        <dd>{online ? 'Online' : 'Offline'}</dd>
        <dt style={{ color: 'var(--muted)' }}>API</dt>
        <dd>{apiLabel}</dd>
      </dl>
      <button
        type="button"
        onClick={onSignOut}
        className="self-start rounded-lg px-3 py-2 text-sm"
        style={{ border: '1px solid var(--border)' }}
      >
        Sign out
      </button>
    </main>
  )
}

export default function App() {
  const { state, signOut } = useAuth()

  if (state.status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center" style={{ color: 'var(--muted)' }}>
        Loading…
      </main>
    )
  }
  if (state.status === 'signedOut') return <LoginScreen />
  return <Home email={state.email} onSignOut={signOut} />
}
