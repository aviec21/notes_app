import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** What to show instead when something inside fails. */
  fallback: (error: Error) => ReactNode
}

/**
 * Catches a failure inside part of the screen (a piece of the app that could not load, or
 * an unexpected error) and shows `fallback` there, instead of the whole app going blank.
 */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('Part of the screen failed:', error)
  }

  render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children
  }
}

const button = 'rounded-lg px-4 py-2 text-sm font-medium'

/** Shown when the note editor cannot be opened (usually a lost connection on first use). */
export function EditorFailed({ onBack }: { onBack: () => void }) {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
      <h2 className="text-lg font-semibold">The editor could not be opened</h2>
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        This usually means the connection dropped before the editor was downloaded. Your notes are safe on this
        device. Check your connection and try again.
      </p>
      <div className="flex gap-3">
        <button type="button" onClick={onBack} className={button} style={{ border: '1px solid var(--border)' }}>
          Back to notes
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={button}
          style={{ background: 'var(--accent)', color: 'var(--bg)' }}
        >
          Try again
        </button>
      </div>
    </div>
  )
}

/** Last resort: something unexpected failed. Notes are stored on the device, so reloading is safe. */
export function AppFailed() {
  return (
    <main role="alert" className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Your notes are stored on this device and nothing has been lost. Reloading usually fixes this.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className={button}
        style={{ background: 'var(--accent)', color: 'var(--bg)' }}
      >
        Reload
      </button>
    </main>
  )
}
