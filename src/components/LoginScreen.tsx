import { useState, type FormEvent } from 'react'
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from '../../shared/config'
import { lockedMessage, OFFLINE_MESSAGE, postJson } from '../api'

export default function LoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const res = await postJson('/api/auth/login', { pin })
    setBusy(false)

    if (!res) return setError(OFFLINE_MESSAGE)
    if (res.ok) return onSignedIn()
    setPin('')
    if (res.status === 429) return setError(await lockedMessage(res))
    setError(res.status === 401 ? 'Wrong PIN. Try again.' : 'Could not sign in. Please try again.')
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-5 px-4 py-10">
      <h1 className="text-3xl font-semibold">Notes</h1>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p style={{ color: 'var(--muted)' }}>Enter your PIN to open your notes.</p>
        <input
          type="password"
          name="pin"
          inputMode="numeric"
          autoComplete="current-password"
          maxLength={PIN_MAX_LENGTH}
          required
          autoFocus
          aria-label="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          className="w-full rounded-lg px-3 py-3 text-center text-2xl tracking-[0.4em] outline-none focus:ring-2"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        />
        <button
          type="submit"
          disabled={busy || pin.length < PIN_MIN_LENGTH}
          className="w-full rounded-lg px-3 py-3 text-base font-medium disabled:opacity-60"
          style={{ background: 'var(--accent)', color: 'var(--bg)' }}
        >
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </form>
      {error && (
        <p
          role="alert"
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          {error}
        </p>
      )}
    </main>
  )
}
