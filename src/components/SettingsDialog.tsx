import { useState } from 'react'
import { usePendingCount } from '../hooks'
import { downloadBlob, exportAllNotes } from '../lib/export'
import { useTheme, type Theme } from '../theme'
import ChangePin from './ChangePin'
import { useDialogs } from './ui/Dialogs'
import { Modal, buttonStyles } from './ui/Modal'

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

/** Downloads every note as Markdown files in a .zip, with the pictures they use. */
function ExportSection() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function exportAll() {
    setBusy(true)
    setMessage(null)
    try {
      const result = await exportAllNotes()
      downloadBlob(result.blob, result.filename)
      setMessage(
        `Downloaded ${result.filename} — ${result.notes} ${result.notes === 1 ? 'note' : 'notes'}, ${result.images} ${result.images === 1 ? 'picture' : 'pictures'}.` +
          (result.missingImages > 0
            ? ` ${result.missingImages} ${result.missingImages === 1 ? 'picture is' : 'pictures are'} not on this device and could not be included.`
            : ''),
      )
    } catch (err) {
      console.error('Export failed:', err)
      setMessage('The export could not be created. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Export</h3>
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Save a copy of everything as Markdown files (.zip), arranged in your folders, with pictures. Works offline.
      </p>
      <button type="button" onClick={() => void exportAll()} disabled={busy} className={`${buttonStyles.base} self-start`} style={buttonStyles.plain}>
        {busy ? 'Preparing…' : 'Export all notes'}
      </button>
      {message && (
        <p role="status" className="text-sm" style={{ color: 'var(--muted)' }}>
          {message}
        </p>
      )}
    </section>
  )
}

export default function SettingsDialog({
  open,
  onClose,
  defaultPin,
  onSignOut,
  onPinChanged,
}: {
  open: boolean
  onClose: () => void
  defaultPin: boolean
  onSignOut: () => void
  onPinChanged: () => void
}) {
  const dialogs = useDialogs()
  const pending = usePendingCount()
  const { theme, setTheme } = useTheme()

  async function signOut() {
    if (pending > 0) {
      const ok = await dialogs.confirm({
        title: 'Sign out with unsynced changes?',
        message: `${pending === 1 ? '1 change has' : `${pending} changes have`} not synced yet. They stay on this device, but will not reach your other devices until you sign in and sync again.`,
        confirmLabel: 'Sign out anyway',
        danger: true,
      })
      if (!ok) return
    }
    onClose()
    onSignOut()
  }

  return (
    <Modal open={open} onClose={onClose} title="Settings" width="max-w-lg">
      <div className="flex flex-col gap-5">
        {defaultPin && (
          <div role="alert" className="rounded-xl p-3 text-sm" style={{ border: '1px solid var(--accent)' }}>
            <strong>You are still using the default PIN.</strong> Anyone who finds this address could open your
            notes. Change it below.
          </div>
        )}

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Theme</h3>
          <div className="flex gap-2" role="group" aria-label="Theme">
            {THEMES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                aria-pressed={theme === value}
                className={buttonStyles.base}
                style={theme === value ? buttonStyles.primary : buttonStyles.plain}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <ExportSection />

        <ChangePin onChanged={onPinChanged} />

        <div className="flex justify-between gap-3">
          <button type="button" onClick={() => void signOut()} className={buttonStyles.base} style={buttonStyles.plain}>
            Sign out
          </button>
          <button type="button" onClick={onClose} className={buttonStyles.base} style={buttonStyles.primary}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  )
}
