import { useEffect, useState } from 'react'
import { useAuth } from './auth'
import ChangePin from './components/ChangePin'
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
const card = { background: 'var(--surface)', border: '1px solid var(--border)' }

function Home({
  defaultPin,
  onSignOut,
  onPinChanged,
}: {
  defaultPin: boolean
  onSignOut: () => void
  onPinChanged: () => void
}) {
  const online = useOnline()
  const { theme, cycle } = useTheme()
  const [api, setApi] = useState<ApiState>('checking')
  const [showChangePin, setShowChangePin] = useState(false)

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
          style={card}
          aria-label={`Theme: ${THEME_LABEL[theme]}. Tap to change.`}
        >
          Theme: {THEME_LABEL[theme]}
        </button>
      </header>

      {defaultPin && (
        <div role="alert" className="rounded-xl p-4 text-sm" style={{ ...card, borderColor: 'var(--accent)' }}>
          <strong>You are still using the default PIN.</strong> Anyone who finds this address could
          open your notes. Change it now.
          {!showChangePin && (
            <button
              type="button"
              onClick={() => setShowChangePin(true)}
              className="mt-3 block rounded-lg px-3 py-2 font-medium"
              style={{ background: 'var(--accent)', color: 'var(--bg)' }}
            >
              Change PIN
            </button>
          )}
        </div>
      )}

      <p style={{ color: 'var(--muted)' }}>Signed in. Notes, folders, tags and sync come next.</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl p-4 text-sm" style={card}>
        <dt style={{ color: 'var(--muted)' }}>Network</dt>
        <dd>{online ? 'Online' : 'Offline'}</dd>
        <dt style={{ color: 'var(--muted)' }}>API</dt>
        <dd>{apiLabel}</dd>
      </dl>

      {showChangePin && <ChangePin onChanged={onPinChanged} />}

      <div className="flex gap-3">
        {!showChangePin && (
          <button
            type="button"
            onClick={() => setShowChangePin(true)}
            className="rounded-lg px-3 py-2 text-sm"
            style={{ border: '1px solid var(--border)' }}
          >
            Change PIN
          </button>
        )}
        <button
          type="button"
          onClick={onSignOut}
          className="rounded-lg px-3 py-2 text-sm"
          style={{ border: '1px solid var(--border)' }}
        >
          Sign out
        </button>
      </div>
    </main>
  )
}

export default function App() {
  const { state, signOut, refresh } = useAuth()

  if (state.status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center" style={{ color: 'var(--muted)' }}>
        Loading…
      </main>
    )
  }
  if (state.status === 'signedOut') return <LoginScreen onSignedIn={refresh} />
  return <Home defaultPin={state.defaultPin} onSignOut={signOut} onPinChanged={refresh} />
}
