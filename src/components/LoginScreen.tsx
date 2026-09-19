import { useEffect, useState, type FormEvent } from 'react'
import { CODE_LENGTH, CODE_TTL_MINUTES } from '../../shared/config'

const EMAIL_KEY = 'notes.loginEmail'
const RESEND_SECONDS = 60

function savedEmail(): string {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveEmail(email: string) {
  try {
    localStorage.setItem(EMAIL_KEY, email)
  } catch {
    // Prefilling is a convenience only.
  }
}

async function post(path: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return null // network failure
  }
}

const OFFLINE = 'You are offline. Connect to the internet to sign in.'

export default function LoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState(savedEmail)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  async function sendCode(event?: FormEvent) {
    event?.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const res = await post('/api/auth/request', { email })
    setBusy(false)

    if (!res) return setError(OFFLINE)
    if (res.status === 429) {
      const { error: kind } = (await res.json().catch(() => ({}))) as { error?: string }
      if (kind === 'too_soon') {
        setStep('code')
        setCooldown(RESEND_SECONDS)
        return setError('A code was just sent. Please wait a minute before requesting another.')
      }
      return setError('Too many codes requested. Please try again in an hour.')
    }
    if (!res.ok) return setError('Could not send the code. Please try again.')

    saveEmail(email.trim())
    setCode('')
    setStep('code')
    setCooldown(RESEND_SECONDS)
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const res = await post('/api/auth/verify', { email, code })
    setBusy(false)

    if (!res) return setError(OFFLINE)
    if (res.ok) return onSignedIn()
    setCode('')
    setError(
      res.status === 401
        ? 'That code is wrong or has expired. Check it and try again, or request a new one.'
        : 'Could not verify the code. Please try again.',
    )
  }

  const input = 'w-full rounded-lg px-3 py-3 text-base outline-none focus:ring-2'
  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)' }
  const button = 'w-full rounded-lg px-3 py-3 text-base font-medium disabled:opacity-60'
  const primary = { background: 'var(--accent)', color: 'var(--bg)' }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-5 px-4 py-10">
      <h1 className="text-3xl font-semibold">Notes</h1>

      {step === 'email' ? (
        <form onSubmit={sendCode} className="flex flex-col gap-4">
          <p style={{ color: 'var(--muted)' }}>Enter your email and we will send you a sign-in code.</p>
          <input
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            autoFocus
            placeholder="you@example.com"
            aria-label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={input}
            style={inputStyle}
          />
          <button type="submit" disabled={busy || !email} className={button} style={primary}>
            {busy ? 'Sending…' : 'Send code'}
          </button>
        </form>
      ) : (
        <form onSubmit={submitCode} className="flex flex-col gap-4">
          <p style={{ color: 'var(--muted)' }}>
            If <span className="break-all">{email.trim()}</span> is allowed, a {CODE_LENGTH}-digit code is on
            its way. It expires in {CODE_TTL_MINUTES} minutes.
          </p>
          <input
            type="text"
            name="code"
            inputMode="numeric"
            pattern={`\\d{${CODE_LENGTH}}`}
            maxLength={CODE_LENGTH}
            autoComplete="one-time-code"
            required
            autoFocus
            placeholder={'0'.repeat(CODE_LENGTH)}
            aria-label="Sign-in code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className={`${input} text-center text-2xl tracking-[0.4em]`}
            style={inputStyle}
          />
          <button
            type="submit"
            disabled={busy || code.length !== CODE_LENGTH}
            className={button}
            style={primary}
          >
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <div className="flex justify-between gap-3 text-sm">
            <button
              type="button"
              onClick={() => sendCode()}
              disabled={busy || cooldown > 0}
              className="underline disabled:no-underline disabled:opacity-60"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('email')
                setError(null)
              }}
              className="underline"
            >
              Use a different email
            </button>
          </div>
        </form>
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
