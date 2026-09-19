import { useEffect, useState } from 'react'

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

export default function App() {
  const online = useOnline()
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
      <h1 className="text-3xl font-semibold">Notes</h1>
      <p style={{ color: 'var(--muted)' }}>
        Phase 1 foundation is live. Notes, folders, tags and sync come next.
      </p>
      <dl
        className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl p-4 text-sm"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <dt style={{ color: 'var(--muted)' }}>Network</dt>
        <dd>{online ? 'Online' : 'Offline'}</dd>
        <dt style={{ color: 'var(--muted)' }}>API</dt>
        <dd>{apiLabel}</dd>
      </dl>
    </main>
  )
}
