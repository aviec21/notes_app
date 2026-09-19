import { useState, type FormEvent } from 'react'
import { isValidPin, PIN_MAX_LENGTH, PIN_MIN_LENGTH } from '../../shared/config'
import { lockedMessage, OFFLINE_MESSAGE, postJson } from '../api'

const digitsOnly = (value: string) => value.replace(/\D/g, '')

export default function ChangePin({ onChanged }: { onChanged: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (!isValidPin(next)) {
      return setMessage({
        kind: 'error',
        text: `The new PIN must be ${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digits.`,
      })
    }
    if (next !== confirm) return setMessage({ kind: 'error', text: 'The new PINs do not match.' })

    setBusy(true)
    setMessage(null)
    const res = await postJson('/api/auth/pin', { currentPin: current, newPin: next })
    setBusy(false)

    if (!res) return setMessage({ kind: 'error', text: OFFLINE_MESSAGE })
    if (res.ok) {
      setCurrent('')
      setNext('')
      setConfirm('')
      setMessage({ kind: 'ok', text: 'PIN changed. Other devices will need the new PIN.' })
      return onChanged()
    }

    const { error } = (await res
      .clone()
      .json()
      .catch(() => ({}))) as { error?: string }
    if (res.status === 429) return setMessage({ kind: 'error', text: await lockedMessage(res) })
    setMessage({
      kind: 'error',
      text:
        error === 'wrong_pin'
          ? 'Your current PIN is incorrect.'
          : error === 'same_as_default'
            ? 'Please choose a PIN other than the default one.'
            : error === 'unauthorized'
              ? 'Your session expired. Reload and sign in again.'
              : 'Could not change the PIN. Please try again.',
    })
  }

  const field = 'w-full rounded-lg px-3 py-3 text-base outline-none focus:ring-2'
  const style = { background: 'var(--bg)', border: '1px solid var(--border)' }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-xl p-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <h2 className="text-lg font-medium">Change PIN</h2>
      {[
        ['Current PIN', current, setCurrent, 'current-password'],
        ['New PIN', next, setNext, 'new-password'],
        ['Confirm new PIN', confirm, setConfirm, 'new-password'],
      ].map(([label, value, set, autoComplete]) => (
        <input
          key={label as string}
          type="password"
          inputMode="numeric"
          autoComplete={autoComplete as string}
          maxLength={PIN_MAX_LENGTH}
          required
          placeholder={label as string}
          aria-label={label as string}
          value={value as string}
          onChange={(e) => (set as (v: string) => void)(digitsOnly(e.target.value))}
          className={field}
          style={style}
        />
      ))}
      <button
        type="submit"
        disabled={busy || !current || !next || !confirm}
        className="rounded-lg px-3 py-3 text-base font-medium disabled:opacity-60"
        style={{ background: 'var(--accent)', color: 'var(--bg)' }}
      >
        {busy ? 'Saving…' : 'Change PIN'}
      </button>
      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className="text-sm">
          {message.text}
        </p>
      )}
    </form>
  )
}
