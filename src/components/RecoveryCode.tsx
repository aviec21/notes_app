import { useState, type FormEvent } from 'react'
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from '../../shared/config'
import { lockedMessage, OFFLINE_MESSAGE, postJson } from '../api'
import { copyText } from '../lib/clipboard'
import { downloadBlob } from '../lib/export'
import { buttonStyles } from './ui/Modal'

/**
 * Shows a recovery code ONCE and makes sure it has been kept before moving on: the server
 * stores only a scrambled copy, so the code cannot be shown again later.
 */
export function CodeDisplay({ code, onDone, doneLabel = 'Done' }: { code: string; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  async function copy() {
    const result = await copyText(code)
    setCopied(result === 'failed' ? 'Could not copy. Write it down instead.' : 'Copied.')
  }

  function download() {
    const text =
      `Notes app: recovery code\n\n${code}\n\n` +
      'Keep this somewhere safe (a password manager is ideal). Anyone who has it can reset your PIN.\n' +
      'To use it: on the sign-in screen choose "Forgot your PIN?" and enter this code.\n' +
      `Created ${new Date().toLocaleString()}\n`
    downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), 'notes-recovery-code.txt')
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Save this code now. It is shown only once, and it is the only way back in if you forget your PIN. Anyone who has
        it can reset your PIN, so treat it like a password.
      </p>
      <p
        aria-label="Your recovery code"
        className="rounded-xl px-3 py-4 text-center font-mono text-xl font-semibold tracking-widest select-all"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {code}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void copy()} className={buttonStyles.base} style={buttonStyles.plain}>
          Copy
        </button>
        <button type="button" onClick={download} className={buttonStyles.base} style={buttonStyles.plain}>
          Download as text file
        </button>
        {copied && (
          <span role="status" className="self-center text-sm" style={{ color: 'var(--muted)' }}>
            {copied}
          </span>
        )}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="mt-0.5 h-4 w-4"
          style={{ accentColor: 'var(--accent)' }}
        />
        I have saved this code somewhere safe
      </label>
      <button type="button" disabled={!saved} onClick={onDone} className={`${buttonStyles.base} self-start`} style={buttonStyles.primary}>
        {doneLabel}
      </button>
    </div>
  )
}

const digitsOnly = (value: string) => value.replace(/\D/g, '')

/** Settings: create (or replace) the recovery code. Needs the current PIN. */
export default function RecoverySection({ hasRecovery, onChanged }: { hasRecovery: boolean; onChanged: () => void }) {
  const [asking, setAsking] = useState(false)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)

  async function create(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const res = await postJson('/api/auth/recovery', { pin })
    setBusy(false)
    if (!res) return setError(OFFLINE_MESSAGE)
    if (res.status === 429) return setError(await lockedMessage(res))
    if (res.status === 401) return setError('That is not your current PIN.')
    if (!res.ok) return setError('Could not create a recovery code. Please try again.')
    const body = (await res.json()) as { code: string }
    setPin('')
    setCode(body.code)
  }

  if (code) {
    return (
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Your new recovery code</h3>
        <CodeDisplay
          code={code}
          onDone={() => {
            setCode(null)
            setAsking(false)
            onChanged()
          }}
        />
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Recovery code</h3>
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        {hasRecovery
          ? 'A recovery code is set. If you forget your PIN, choose “Forgot your PIN?” on the sign-in screen. Creating a new code makes the old one stop working.'
          : 'You have no recovery code yet. Without one, a forgotten PIN can only be reset through your database. Create one and keep it somewhere safe.'}
      </p>
      {!asking ? (
        <button type="button" onClick={() => setAsking(true)} className={`${buttonStyles.base} self-start`} style={buttonStyles.plain}>
          {hasRecovery ? 'Create a new recovery code' : 'Create a recovery code'}
        </button>
      ) : (
        <form onSubmit={create} className="flex flex-col gap-2">
          <input
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={PIN_MAX_LENGTH}
            placeholder="Enter your current PIN to continue"
            aria-label="Current PIN for recovery code"
            value={pin}
            onChange={(e) => setPin(digitsOnly(e.target.value))}
            className="w-full rounded-lg px-3 py-3 text-base outline-none focus:ring-2"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || pin.length < PIN_MIN_LENGTH}
              className={buttonStyles.base}
              style={buttonStyles.primary}
            >
              {busy ? 'Creating…' : 'Create code'}
            </button>
            <button
              type="button"
              onClick={() => {
                setAsking(false)
                setPin('')
                setError(null)
              }}
              className={buttonStyles.base}
              style={buttonStyles.plain}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}
    </section>
  )
}
