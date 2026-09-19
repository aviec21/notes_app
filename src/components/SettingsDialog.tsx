import { usePendingCount } from '../hooks'
import { useTheme, type Theme } from '../theme'
import ChangePin from './ChangePin'
import { useDialogs } from './ui/Dialogs'
import { Modal, buttonStyles } from './ui/Modal'

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

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
