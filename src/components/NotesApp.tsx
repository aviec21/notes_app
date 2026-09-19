import { useCallback, useEffect, useState } from 'react'
import { useNotes, usePendingCount } from '../hooks'
import { repo, startSync } from '../sync/runtime'
import { useTheme } from '../theme'
import ChangePin from './ChangePin'
import NoteEditor from './NoteEditor'
import NoteList from './NoteList'
import SyncStatus from './SyncStatus'

const THEME_LABEL = { system: 'System', light: 'Light', dark: 'Dark' } as const
const card = { background: 'var(--surface)', border: '1px solid var(--border)' }

interface Props {
  defaultPin: boolean
  onSignOut: () => void
  onPinChanged: () => void
  onUnauthorized: () => void
}

export default function NotesApp({ defaultPin, onSignOut, onPinChanged, onUnauthorized }: Props) {
  const notes = useNotes()
  const pending = usePendingCount()
  const { theme, cycle } = useTheme()
  const [openId, setOpenId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(defaultPin)

  const closeEditor = useCallback(() => setOpenId(null), [])

  useEffect(() => startSync(onUnauthorized), [onUnauthorized])

  async function newNote() {
    setOpenId(await repo.createNote())
  }

  function signOut() {
    const warning =
      `${pending} change${pending === 1 ? ' has' : 's have'} not synced yet. ` +
      'They stay on this device, but will not reach your other devices until you sign in and sync again. Sign out anyway?'
    if (pending > 0 && !window.confirm(warning)) return
    onSignOut()
  }

  if (openId) return <NoteEditor id={openId} onClose={closeEditor} />

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-4 pb-28">
      <header
        className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-3 px-4 py-3"
        style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex flex-col">
          <h1 className="text-xl font-semibold">Notes</h1>
          <SyncStatus />
        </div>
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          aria-expanded={showSettings}
          className="rounded-lg px-3 py-2 text-sm"
          style={{ border: '1px solid var(--border)' }}
        >
          Settings
        </button>
      </header>

      {showSettings && (
        <section className="flex flex-col gap-4">
          {defaultPin && (
            <div role="alert" className="rounded-xl p-4 text-sm" style={{ ...card, borderColor: 'var(--accent)' }}>
              <strong>You are still using the default PIN.</strong> Anyone who finds this address could
              open your notes. Change it below.
            </div>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={cycle} className="rounded-lg px-3 py-2 text-sm" style={card}>
              Theme: {THEME_LABEL[theme]}
            </button>
            <button type="button" onClick={signOut} className="rounded-lg px-3 py-2 text-sm" style={card}>
              Sign out
            </button>
          </div>
          <ChangePin onChanged={onPinChanged} />
        </section>
      )}

      {notes === undefined ? (
        <p className="py-16 text-center" style={{ color: 'var(--muted)' }}>
          Loading…
        </p>
      ) : (
        <NoteList notes={notes} onOpen={setOpenId} />
      )}

      <button
        type="button"
        onClick={() => void newNote()}
        aria-label="New note"
        className="fixed right-4 flex h-14 w-14 items-center justify-center rounded-full text-3xl shadow-lg"
        style={{
          background: 'var(--accent)',
          color: 'var(--bg)',
          bottom: 'max(1rem, env(safe-area-inset-bottom))',
        }}
      >
        +
      </button>
    </main>
  )
}
