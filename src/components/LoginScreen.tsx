import { useState, type FormEvent } from 'react'
import { isValidPin, normalizeRecoveryCode, PIN_MAX_LENGTH, PIN_MIN_LENGTH } from '../../shared/config'
import { lockedMessage, OFFLINE_MESSAGE, postJson } from '../api'
import { CodeDisplay } from './RecoveryCode'

type Mode = 'pin' | 'forgot' | 'newCode'

const digitsOnly = (value: string) => value.replace(/\D/g, '')
const field = 'w-full rounded-lg px-3 py-3 text-base outline-none focus:ring-2'
const fieldStyle = { background: 'var(--surface)', border: '1px solid var(--border)' }
const primaryButton = 'w-full rounded-lg px-3 py-3 text-base font-medium disabled:opacity-60'

export default function LoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<Mode>('pin')
  const [pin, setPin] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [newCode, setNewCode] = useState('')
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

  async function reset(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (!normalizeRecoveryCode(recoveryCode)) {
      return setError('That does not look like a recovery code. It has 16 letters and numbers, like K7QM-2XPD-9HRT-4WNB.')
    }
    if (!isValidPin(newPin)) return setError(`The new PIN must be ${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digits.`)
    if (newPin !== confirmPin) return setError('The new PINs do not match.')

    setBusy(true)
    setError(null)
    const res = await postJson('/api/auth/reset', { recoveryCode, newPin })
    setBusy(false)

    if (!res) return setError(OFFLINE_MESSAGE)
    if (res.status === 429) return setError(await lockedMessage(res))
    if (res.ok) {
      const body = (await res.json()) as { code: string }
      setNewCode(body.code)
      return setMode('newCode')
    }
    const { error: kind } = (await res.json().catch(() => ({}))) as { error?: string }
    if (kind === 'same_as_default') return setError('Please choose a PIN other than the default one.')
    setError(
      res.status === 401
        ? 'That recovery code is not right, or no recovery code has been created yet.'
        : 'Could not reset the PIN. Please try again.',
    )
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-5 px-4 py-10">
      <h1 className="text-3xl font-semibold">Notes</h1>

      {mode === 'pin' && (
        <>
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
              onChange={(e) => setPin(digitsOnly(e.target.value))}
              className={`${field} text-center text-2xl tracking-[0.4em]`}
              style={fieldStyle}
            />
            <button
              type="submit"
              disabled={busy || pin.length < PIN_MIN_LENGTH}
              className={primaryButton}
              style={{ background: 'var(--accent)', color: 'var(--bg)' }}
            >
              {busy ? 'Checking…' : 'Unlock'}
            </button>
          </form>
          <button
            type="button"
            onClick={() => {
              setError(null)
              setMode('forgot')
            }}
            className="self-center text-sm underline"
          >
            Forgot your PIN?
          </button>
        </>
      )}

      {mode === 'forgot' && (
        <form onSubmit={reset} className="flex flex-col gap-4">
          <p style={{ color: 'var(--muted)' }}>
            Enter the recovery code you saved, then choose a new PIN.
          </p>
          <input
            type="text"
            name="recovery"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
            autoFocus
            placeholder="XXXX-XXXX-XXXX-XXXX"
            aria-label="Recovery code"
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value)}
            className={`${field} text-center font-mono tracking-widest`}
            style={fieldStyle}
          />
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={PIN_MAX_LENGTH}
            required
            placeholder="New PIN"
            aria-label="New PIN"
            value={newPin}
            onChange={(e) => setNewPin(digitsOnly(e.target.value))}
            className={field}
            style={fieldStyle}
          />
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={PIN_MAX_LENGTH}
            required
            placeholder="Confirm new PIN"
            aria-label="Confirm new PIN"
            value={confirmPin}
            onChange={(e) => setConfirmPin(digitsOnly(e.target.value))}
            className={field}
            style={fieldStyle}
          />
          <button
            type="submit"
            disabled={busy || !recoveryCode.trim() || !newPin || !confirmPin}
            className={primaryButton}
            style={{ background: 'var(--accent)', color: 'var(--bg)' }}
          >
            {busy ? 'Checking…' : 'Reset PIN and sign in'}
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null)
              setMode('pin')
            }}
            className="self-center text-sm underline"
          >
            Back to sign in
          </button>
        </form>
      )}

      {mode === 'newCode' && (
        <div className="flex flex-col gap-3">
          <p role="status" className="text-sm font-medium">
            Your PIN has been reset. Here is a new recovery code to replace the one you just used.
          </p>
          <CodeDisplay code={newCode} onDone={onSignedIn} doneLabel="Continue to my notes" />
        </div>
      )}

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
